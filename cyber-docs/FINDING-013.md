# FINDING-013 — Insecure randomness (Math.random) for security-sensitive IDs

| Field | Value |
|-------|-------|
| Severity | High |
| Category | Cryptography |
| Component | trifecta-mobile (multiple files) |
| Status | Fixed |

## Description

The mobile app used `Math.random()` to generate IDs for security-sensitive
operations including:

- WebSocket RPC trace IDs and span IDs (`ws-client.tsx`)
- RPC command IDs (`active-thread.tsx`, `use-thread.ts`, `main-header.*.tsx`, `chats.tsx`)
- Thread IDs and message IDs (`active-thread.tsx`)

`Math.random()` is not cryptographically secure and is predictable, allowing
an attacker who observes one ID to predict future IDs.

## Attack scenario

An attacker who can observe RPC frames (e.g. via MITM on HTTP — see
FINDING-011) could predict future command IDs and inject malicious commands
into the WebSocket stream, or enumerate thread IDs to access other users'
conversations.

## Fix

Created `src/utils/secure-id.ts` with `secureRandomHex()` and
`secureRandomId()` backed by `expo-crypto`'s `getRandomBytes()` (CSPRNG).
Replaced all `Math.random()`-based ID generation in:

- `src/stores/ws-client.tsx` (trace/span IDs)
- `src/stores/active-thread.tsx` (command, message, thread IDs)
- `src/hooks/use-thread.ts` (command IDs)
- `src/components/main-header.swiftui.tsx` (command IDs)
- `src/components/main-header.fallback.tsx` (command IDs)
- `src/app/chats.tsx` (command IDs)

Note: `Math.random()` in `src/components/markdown/utils.ts` (React key
generation) and `ws-client.tsx` (reconnect backoff jitter) were left as-is
because they are not security-sensitive.
