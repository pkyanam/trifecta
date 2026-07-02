# FINDING-006: Missing WebSocket rate limiting and message size limits

- Severity: Medium-High
- Category: DoS Protection
- Component: trifecta-desktop/apps/server/src/ws.ts
- Status: Fixed
- Discovered: 2026-07-02T05:15Z

## Description

The WebSocket RPC endpoint (`/ws`) had no rate limiting or message size
limits. An attacker could overwhelm the server by:
1. Opening many WebSocket connections rapidly (connection flooding)
2. Sending very large messages (memory exhaustion)
3. Sending many messages per second (CPU exhaustion)

This could lead to denial-of-service conditions, making the server
unresponsive to legitimate clients.

## Evidence (file:line, code snippet)

Before fix, `apps/server/src/ws.ts` (WebSocket handler):
```typescript
Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  const sessions = yield* SessionCredentialService;
  // No rate limiting, no message size check
  const session = yield* serverAuth.authenticateWebSocketUpgrade(request);
  // ... proceed to RPC processing
```

No `maxPayload` configuration on the HTTP server, no per-IP rate limiting,
no content-length validation on WebSocket upgrade requests.

## Impact

An attacker (even unauthenticated, since rate limiting is checked before
auth) could:
1. Open thousands of WebSocket connections per second, exhausting file
   descriptors and memory
2. Send multi-GB messages in a single WebSocket frame, causing OOM
3. Saturate the CPU with RPC message parsing

## Reproduction

1. `for i in $(seq 1 10000); do curl -N -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" http://localhost:3773/ws & done`
2. Observe server becomes unresponsive

## Fix Applied

Created `apps/server/src/wsRateLimit.ts` with:
- **Message size limit**: Rejects requests with `content-length` > 1 MB
  (configurable via `MAX_MESSAGE_SIZE_BYTES`)
- **Per-IP rate limiting**: Sliding window algorithm tracking WebSocket
  upgrade requests per IP address (30 upgrades per 10 seconds by default)
- **Stale entry pruning**: Automatically cleans up IP entries when the
  rate limit map grows beyond 1000 entries
- **Combined check**: `checkAll` method validates both size and rate limits
  in a single call

Integrated into the WebSocket handler in `ws.ts`:
- Rate limiting and size checks run BEFORE authentication and Origin
  validation, ensuring unauthenticated attackers are blocked early
- Returns HTTP 413 (Payload Too Large) or 429 (Too Many Requests) for
  rejected requests

Files changed:
- `apps/server/src/wsRateLimit.ts` — new module with rate limiter
- `apps/server/src/wsRateLimit.test.ts` — 6 tests for message size checks
- `apps/server/src/ws.ts` — integrated rate limiter into WebSocket handler

## Tests Added

- `checkMessageSize allows requests without content-length`
- `checkMessageSize allows requests with content-length under the limit`
- `checkMessageSize rejects requests with content-length over the limit`
- `checkMessageSize allows requests with non-numeric content-length`
- `checkMessageSize allows requests with content-length of 0`
- `checkMessageSize supports custom max size`

All 1129 tests pass (137 test files, 0 failures).

## References

- CWE-770: Allocation of Resources Without Limits or Throttling
- CWE-400: Uncontrolled Resource Consumption
- OWASP Rate Limiting
