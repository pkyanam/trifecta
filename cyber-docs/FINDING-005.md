# FINDING-005: Overly permissive CORS wildcard and missing WebSocket Origin validation

- Severity: High
- Category: Web Security
- Component: trifecta-desktop/apps/server/src/httpCors.ts, http.ts, auth/http.ts, ws.ts
- Status: Fixed
- Discovered: 2026-07-02T05:10Z

## Description

The Trifecta server set `access-control-allow-origin: *` on all HTTP API
responses, allowing any website to make authenticated cross-origin requests.
Combined with cookie-based authentication (`sameSite: "lax"`), this enabled
CSRF attacks from arbitrary origins. Additionally, the WebSocket server did
not validate the `Origin` header, enabling cross-site WebSocket hijacking
(CSWSH).

## Evidence (file:line, code snippet)

Before fix:

```typescript
// apps/server/src/httpCors.ts:9-13
export const browserApiCorsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": browserApiCorsAllowedMethods.join(", "),
  "access-control-allow-headers": browserApiCorsAllowedHeaders.join(", "),
} as const;

// apps/server/src/http.ts:44-48 — no allowedOrigins, defaults to *
export const browserApiCorsLayer = HttpRouter.cors({
  allowedMethods: [...browserApiCorsAllowedMethods],
  allowedHeaders: [...browserApiCorsAllowedHeaders],
  maxAge: 600,
});

// apps/server/src/ws.ts — no Origin header validation on WebSocket upgrade
```

## Impact

Any malicious website could:
1. Make authenticated HTTP API requests using the user's session cookie
2. Open WebSocket connections to the server with the user's credentials
3. Execute arbitrary RPC commands (open editors, access SSH sessions, etc.)

## Reproduction

1. User has an active Trifecta session (cookie set)
2. User visits `https://evil.example.com`
3. Evil site runs `fetch("http://localhost:3773/api/auth/session", {credentials: "include"})`
4. Request succeeds because `access-control-allow-origin: *` allows it
5. Evil site can now call any authenticated API endpoint

## Fix Applied

1. **Dynamic CORS origin validation** (`httpCors.ts`):
   - Added `isOriginAllowed()` function that validates origins against a
     dynamic allowlist: loopback origins (any port), server's own origin,
     configured `devUrl`, and configured `publicUrl`
   - Added `buildCorsHeaders()` for per-request CORS header generation
   - Added `corsHeadersForRequest` Effect for use in route handlers
   - Removed `access-control-allow-origin: *` from static headers

2. **Dynamic CORS middleware** (`http.ts`):
   - `browserApiCorsLayer` now uses `allowedOrigins` as a function (supported
     by the runtime) that calls `isOriginAllowed()` per request
   - All route handlers updated to use `corsHeadersForRequest` instead of
     static `browserApiCorsHeaders`

3. **Auth route handlers** (`auth/http.ts`):
   - All 5 route handlers updated to use `corsHeadersForRequest`

4. **WebSocket Origin validation** (`ws.ts`):
   - Added Origin header check on WebSocket upgrade requests
   - Rejects connections from disallowed origins with 403 Forbidden

Files changed:
- `apps/server/src/httpCors.ts` — rewritten with dynamic origin validation
- `apps/server/src/http.ts` — dynamic CORS layer, per-request CORS headers
- `apps/server/src/auth/http.ts` — per-request CORS headers in all routes
- `apps/server/src/ws.ts` — WebSocket Origin header validation
- `apps/server/src/httpCors.test.ts` — 13 new tests for CORS logic
- `apps/server/src/server.test.ts` — updated existing tests for dynamic CORS

## Tests Added

- `isOriginAllowed` allows undefined origin (same-origin / non-browser)
- `isOriginAllowed` allows loopback origins on any port
- `isOriginAllowed` allows the server's own origin
- `isOriginAllowed` rejects arbitrary external origins
- `isOriginAllowed` rejects malformed origins
- `isOriginAllowed` allows configured devUrl origin
- `isOriginAllowed` allows configured publicUrl origin
- `buildCorsHeaders` reflects allowed origin in access-control-allow-origin
- `buildCorsHeaders` does not set access-control-allow-origin for disallowed origins
- `buildCorsHeaders` does not set access-control-allow-origin for same-origin
- `computeAllowedOriginsList` includes loopback origins with server port
- `computeAllowedOriginsList` includes devUrl when configured
- `computeAllowedOriginsList` includes publicUrl when configured

All 1123 tests pass (136 test files, 0 failures).

## References

- CWE-942: Permissive Cross-domain Policy with Untrusted Domains
- CWE-346: Origin Validation Error
- OWASP CORS Misconfiguration
- Cross-Site WebSocket Hijacking (CSWSH) — Christian Schneider, 2013
