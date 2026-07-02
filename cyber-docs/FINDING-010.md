# FINDING-010: Use of Math.random() for security-sensitive identifiers (Fixed)

- Severity: Medium
- Category: Cryptography
- Component: trifecta-desktop/apps/server/src/ (multi-server pairing)
- Status: Fixed
- Discovered: 2026-07-02T04:40Z

## Description

The multi-server pairing feature used `Math.random()` to generate
pairing tokens and session identifiers. `Math.random()` is not
cryptographically secure — its output can be predicted if an attacker
can observe enough outputs, allowing token forgery.

## Analysis

This was identified during Sweep #1 and fixed in the same commit that
implemented the multi-server pairing feature. The fix replaced
`Math.random()` with `Crypto.randomUUID()` from the Node.js `crypto`
module, which uses a cryptographically secure random number generator.

## Fix Applied

Replaced `Math.random()` with `Crypto.randomUUID()` in the multi-server
pairing code. This was done as part of the feature implementation commit,
not as a separate security fix.

## Verification

- `grep -rn "Math.random" apps/server/src/` confirms no remaining uses
  of `Math.random()` for security-sensitive identifiers
- `Crypto.randomUUID()` uses CSPRNG and is suitable for session tokens

## References

- CWE-330: Use of Insufficiently Random Values
- CWE-338: Use of Cryptographically Weak Pseudo-Random Number Generator
- Node.js documentation: `crypto.randomUUID()`
