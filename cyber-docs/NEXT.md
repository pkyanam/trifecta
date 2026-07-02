# NEXT — Next iteration action

## Status: Sweep #1 + #2 + #3 Complete

All findings from Sweeps #1, #2, and #3 have been investigated and
remediated (or accepted/documented). The security audit is complete for
the current scope across all three components: trifecta-desktop,
trifecta-mobile, and trifecta-www.

### Completed in Sweep #3

- FINDING-011 (Transport): iOS ATS globally disabled — Accepted as designed
- FINDING-012 (Transport): Android cleartext traffic — Accepted as designed
- FINDING-013 (Crypto): Math.random() for RPC/thread IDs (mobile) — Fixed
- FINDING-014 (WebView): SSH terminal WebView misconfigurations — Fixed
- FINDING-015 (Info Disclosure): Sensitive data logged in production — Fixed
- FINDING-016 (Webhook): Stripe webhook replay protection — Fixed
- FINDING-017 (Hardening): Missing CSP and security headers (www) — Fixed
- FINDING-018 (Audit): Desktop deep review — No new vulnerabilities found

### Verification

- trifecta-mobile: `bunx tsc --noEmit` — 10 pre-existing errors (0 new)
- trifecta-mobile: `bun run lint` — 0 errors (12 pre-existing warnings)
- trifecta-www: `npm run build` — succeeds
- trifecta-www: `npm run lint` — 1 pre-existing error (0 new)
- trifecta-desktop: `bun audit` — 0 vulnerabilities

### Dependency audit summary

- trifecta-desktop: 0 vulnerabilities
- trifecta-mobile: 3 (2 moderate, 1 low) — all dev dependencies (@babel/core,
  uuid, js-yaml)
- trifecta-www: 39 (1 critical shell-quote, 6 high, 30 moderate, 2 low) —
  mostly transitive via Daytona SDK / OpenTelemetry. The critical
  shell-quote vulnerability is in a dev dependency.

### Potential follow-up work (not required for current audit)

- Upgrade Electron to 41.9.2+ for general maintenance
- Replace `'unsafe-inline'` in CSP script-src with nonce-based approach
  (both desktop and www)
- Add integration tests for CORS origin validation with real HTTP requests
- Consider adding HSTS header for HTTPS deployments (done for www)
- Enforce HTTPS for non-local server URLs in mobile pairing flow
  (while keeping HTTP for LAN/localhost)
- Upgrade trifecta-www dependencies to resolve transitive CVEs
  (shell-quote, OpenTelemetry, esbuild)
- Bundle xterm.js locally instead of loading from CDN (mobile SSH terminal)
- Add distributed rate limiting to trifecta-www (Upstash Redis) for
  serverless deployment
- Review mobile clipboard auto-pair flow for social engineering risk
  (FINDING-006 from mobile audit — user must explicitly tap "Paste link")
