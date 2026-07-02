# NEXT — Next iteration action

## Status: Sweep #1 + #2 Complete

All findings from Sweep #1 have been investigated and remediated. The
security audit is complete for the current scope.

### Completed in this iteration (Sweep #2)

- FINDING-002 (SAST-001): Windows shell argument injection in `open.ts` — Fixed
- FINDING-003 (SAST-005): `process.env.HOME` → `os.homedir()` — Fixed
- FINDING-004 (CSP-001): Content Security Policy + security headers — Fixed
- FINDING-005 (WS-003): Permissive CORS wildcard → dynamic origin allowlist — Fixed
- FINDING-006 (WS-005/006): WebSocket rate limiting + message size limits — Fixed
- FINDING-007 (SAST-002): binaryPath — Accepted as designed
- FINDING-008 (EL-001): webviewTag — Not Applicable
- FINDING-009 (DEP-001/002): Electron/Vite versions — Not Vulnerable
- FINDING-010 (SEC-001): Math.random() → Crypto.randomUUID() — Fixed

### Verification

- `bun run typecheck` — passes (14/14 packages)
- `bun run lint` — 0 errors (85 pre-existing warnings)
- `bun run fmt` — passes
- `bun run test --filter=@belweave/trifecta` — 1129 tests pass, 0 failures

### Potential follow-up work (not required for current audit)

- Upgrade Electron to 41.9.2+ for general maintenance (not security-critical)
- Replace `'unsafe-inline'` in CSP script-src with nonce-based approach
- Add integration tests for CORS origin validation with real HTTP requests
- Consider adding HSTS header for HTTPS deployments
- Review mobile app (trifecta-mobile) for similar security issues
- Review marketing site (trifecta-www) for security issues
