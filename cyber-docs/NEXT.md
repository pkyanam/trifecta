# NEXT — Next iteration action

## Priority: Fix CSP-001 / EL-002 (Missing Content Security Policy)

The highest-value pending finding from Sweep #1 is the **missing Content
Security Policy** on the web app. This is a High-severity defense-in-depth gap:
if any XSS or injection vector exists (now or in the future), there is no CSP
to limit the blast radius.

### Context
- No CSP meta tag in `apps/web/index.html`
- No CSP headers set in `apps/server/src/http.ts` for static file responses
- The app uses Vite (dev) and serves built static files (prod) from the server
- WebSocket connections use `ws://` / `wss://` so `connect-src` must allow them

### Plan
1. Read `apps/web/index.html` and `apps/server/src/http.ts` to understand
   current header setup.
2. Add a strict CSP meta tag to `apps/web/index.html`:
   `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:; font-src 'self' data:;`
   (Vite injects styles with inline tags in dev, so `style-src 'unsafe-inline'`
   is needed initially; consider nonce-based in a follow-up.)
3. Optionally also set CSP via `onHeadersReceived` in the server's static file
   handler for defense-in-depth on the HTTP layer.
4. Verify the Vite dev build still loads (check index.html structure, don't
   start dev server).
5. Write a Vitest test asserting the CSP meta tag is present in index.html
   (simple string check) and/or that http.ts sets the header.
6. Run `bun run typecheck`, `bun run lint`, `bun run fmt` for affected packages.
7. Document as FINDING-002, commit.

### Other pending findings (for subsequent iterations)
- WS-003: Overly permissive CORS (`access-control-allow-origin: *`) in
  `apps/server/src/httpCors.ts` — replace with origin allowlist.
- SAST-002: Arbitrary binary execution via Hermes/Devin `binaryPath` settings —
  add path validation/allowlist.
- SAST-001: Windows shell argument injection in `open.ts` — proper escaping.
- DEP-001: Electron 41.5.0 — upgrade to 41.5.1+.
- DEP-002: Vite ^8.1.1 — upgrade to 8.0.5+ (CVE-2026-39364).
- EL-001: Remove `webviewTag: true` if unused.
- WS-005/006: Add rate limiting + message size limits to WebSocket server.
- SEC-001: Replace `Math.random()` with crypto-secure IDs in mobile app.
- SAST-005: Use `os.homedir()` instead of `process.env.HOME` in shell profile
  setup.
