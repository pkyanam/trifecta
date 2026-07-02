# FINDING-015 — Excessive logging of sensitive data in production

| Field | Value |
|-------|-------|
| Severity | Medium |
| Category | Information Disclosure |
| Component | trifecta-mobile (ws-client.tsx, ssh.tsx) |
| Status | Fixed |

## Description

The mobile app logged sensitive information to `console.log` in production
builds, including:

- Full WebSocket frame payloads with request IDs and data (ws-client.tsx)
- SSH session input and snapshot details (ssh.tsx)

In production, these logs can be accessed via device debugging tools, crash
reports, or analytics SDKs, potentially exposing WebSocket message payloads
and SSH session parameters.

## Fix

1. Created a `devLog()` helper in `ws-client.tsx` that only logs when
   `__DEV__` is true. Replaced all 11 verbose `console.log` calls with
   `devLog()`.
2. Guarded the 2 SSH store `console.log` calls with `__DEV__` checks and
   removed sensitive data (input/snapshot) from the log messages.
3. Kept `console.error` calls for genuine errors (they don't contain
   secrets, only error messages).
