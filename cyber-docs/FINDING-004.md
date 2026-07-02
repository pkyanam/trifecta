# FINDING-004: Missing Content Security Policy and security headers

- Severity: High
- Category: Hardening
- Component: trifecta-desktop/apps/web/index.html, trifecta-desktop/apps/server/src/http.ts
- Status: Fixed
- Discovered: 2026-07-02T05:05Z

## Description

The Trifecta web application had no Content Security Policy (CSP) — neither
via HTTP headers nor HTML meta tags. Additionally, no standard security
headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
Permissions-Policy) were set on any response. Without CSP, any XSS or
injection vector (now or in the future) has unlimited blast radius —
attackers can load arbitrary scripts, exfiltrate data to external domains,
or embed the app in iframes for clickjacking.

## Evidence (file:line, code snippet)

Before fix:
- `apps/web/index.html` — no `<meta http-equiv="Content-Security-Policy">` tag
- `apps/server/src/http.ts` — static file responses set only `contentType`
  and `Cache-Control`, no security headers
- `grep -r "Content-Security-Policy" trifecta-desktop/apps/` returned 0 matches
- `grep -r "X-Frame-Options\|X-Content-Type-Options" trifecta-desktop/apps/` returned 0 matches

## Impact

Without CSP:
- XSS payloads can load external scripts, send data to attacker domains
- No restriction on `connect-src` — exfiltration via fetch/XHR/WebSocket
- No clickjacking protection via `frame-src`/`X-Frame-Options`
- No plugin execution restriction via `object-src`

Without X-Content-Type-Options: nosniff, browsers may MIME-sniff responses,
potentially interpreting non-script files as executable.

## Reproduction

1. Open the Trifecta web app in a browser.
2. Open DevTools → Network tab.
3. Observe no `Content-Security-Policy` header in any response.
4. Observe no `X-Frame-Options`, `X-Content-Type-Options` headers.

## Fix Applied

1. Added a CSP meta tag to `apps/web/index.html` with a policy that:
   - `default-src 'self'` — restrict all resource types to same origin
   - `script-src 'self' 'unsafe-inline'` — allow inline theme detection script
   - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — allow
     inline styles and Google Fonts CSS
   - `font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com` —
     allow Google Fonts
   - `img-src 'self' data: https:` — allow data URIs and HTTPS images
   - `connect-src 'self' ws: wss:` — allow WebSocket connections
   - `object-src 'none'` — block plugins (Flash, Java, etc.)
   - `base-uri 'self'` — prevent base tag injection
   - `form-action 'self'` — restrict form submissions
   - `frame-src 'none'` — prevent framing/clickjacking

2. Added security headers to server static file responses in `http.ts`:
   - `X-Content-Type-Options: nosniff` — prevent MIME sniffing
   - `X-Frame-Options: DENY` — prevent clickjacking (defense-in-depth with CSP frame-src)
   - `Referrer-Policy: strict-origin-when-cross-origin` — limit referrer leakage
   - `Permissions-Policy: geolocation=(), microphone=(), camera=()` — disable
     unnecessary browser permissions

Files changed:
- `apps/web/index.html` — added CSP meta tag
- `apps/server/src/http.ts` — added `SECURITY_HEADERS` constant, applied to
  index.html fallback and static file responses
- `apps/server/src/http.test.ts` — added 7 tests verifying CSP policy content

## Tests Added

- `index.html contains a CSP meta tag`
- `CSP restricts default-src to self`
- `CSP restricts object-src to none`
- `CSP restricts base-uri to self`
- `CSP allows WebSocket connections`
- `CSP allows inline scripts (theme detection)`
- `CSP allows inline styles and Google Fonts`

All 1110 tests pass (135 test files, 0 failures).

## References

- CWE-1021: Improper Restriction of Rendered UI Layers or Frames
- CWE-693: Protection Mechanism Failure
- MDN: Content Security Policy (CSP)
- OWASP Secure Headers Project
