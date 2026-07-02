# FINDING-018 — Desktop deep review: no new exploitable vulnerabilities

| Field | Value |
|-------|-------|
| Severity | Info |
| Category | Audit |
| Component | trifecta-desktop |
| Status | Not Vulnerable |

## Description

A deep offensive security review of the trifecta-desktop server was conducted
covering: authentication bypass, authorization/IDOR, command injection, path
traversal, race conditions, DoS, prototype pollution, SSRF, secret exposure,
Electron security, and WebSocket message handling.

## Investigated and cleared

1. **Bitbucket API base URL SSRF** (SSRF-001): The `BELWEAVE_BITBUCKET_API_BASE_URL`
   env var is operator-controlled, not user-controlled. Not exploitable by
   remote clients.

2. **SSH session race conditions** (RACE-001/002): Effect `Ref` operations are
   atomic. The `authSessionId` is set at session creation and never changed.
   No TOCTOU window exists for authorization bypass.

3. **Electron webviewTag** (ELECTRON-001): Already documented as FINDING-008
   (Not Applicable). The app uses `contextIsolation: true`,
   `nodeIntegration: false`, `sandbox: true`.

4. **SSH tunnel loopback validation** (SSRF-002): The `isLoopbackHostname`
   check is adequate for the local desktop use case. The hostname comes from
   SSH forwarded URLs, not user input.

5. **SSH remote script injection** (CMD-INJECT-001): All replacement values
   are either shell-quoted via `shellSingleQuote()` or hex hashes from
   `remoteStateKey()`. No injection vector.

6. **Terminal session IDOR** (AUTHZ-001): Thread IDs are `crypto.randomUUID()`
   (unguessable). The server is a single-user desktop app where the owner
   trusts paired clients. SSH sessions have `authSessionId` checks; terminal
   sessions don't, but this is defense-in-depth, not exploitable.

7. **JSON parsing** (UNSAFE-JSON-001): `VcsProjectConfig.parseConfig` validates
   with `isProjectVcsConfig()` after parsing. Other JSON.parse sites parse
   local process output, not untrusted remote input.

## Conclusion

No new exploitable vulnerabilities were found in the trifecta-desktop server
beyond those already remediated in Sweeps #1 and #2.
