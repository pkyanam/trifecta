# FINDING-011 — iOS App Transport Security globally disabled

| Field | Value |
|-------|-------|
| Severity | Critical |
| Category | Transport Security |
| Component | trifecta-mobile/app.json:16-18 |
| Status | Accepted as designed |

## Description

The iOS Info.plist configuration disables App Transport Security (ATS)
globally with `NSAllowsArbitraryLoads: true`. This allows all HTTP cleartext
traffic and disables TLS version checks for all network connections.

## Risk

An attacker on the same network (public Wi-Fi, compromised LAN) can intercept
HTTP traffic, steal bearer tokens during pairing, and inject malicious
responses.

## Decision: Accepted as designed

The Trifecta mobile app is designed to connect to user-self-hosted Trifecta
Desktop servers on local networks (LAN, Tailscale, localhost). These servers
typically do not have TLS certificates. Restricting ATS to HTTPS-only would
break the core use case of connecting to LAN servers.

The Android equivalent (`usesCleartextTraffic: true`) is also required for the
same reason.

## Mitigations

- Bearer tokens are stored in the iOS Keychain / Android Keystore via
  `expo-secure-store`.
- The pairing flow uses a one-time token exchange; tokens are not sent in
  cleartext URLs (they are in POST bodies or URL fragments).
- Users pairing with public-internet servers should use HTTPS.

## Future improvement

Consider enforcing HTTPS for non-local (public internet) server URLs at the
application layer, while allowing HTTP only for loopback / private IP ranges
(RFC 1918). This would require a runtime URL protocol check in the pairing
flow and a more granular `NSExceptionDomains` / `networkSecurityConfig`
configuration.
