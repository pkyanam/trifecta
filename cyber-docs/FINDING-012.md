# FINDING-012 — Android cleartext traffic enabled globally

| Field | Value |
|-------|-------|
| Severity | Critical |
| Category | Transport Security |
| Component | trifecta-mobile/app.json:32 |
| Status | Accepted as designed |

## Description

Android configuration enables cleartext traffic globally with
`usesCleartextTraffic: true`, allowing HTTP connections on Android.

## Decision

Same rationale as FINDING-011 — the app connects to self-hosted servers on
local networks that may not have TLS. See FINDING-011 for full analysis.
