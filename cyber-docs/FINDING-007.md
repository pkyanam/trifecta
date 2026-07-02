# FINDING-007: Arbitrary binary execution via binaryPath settings (Accepted as designed)

- Severity: Informational
- Category: SAST
- Component: trifecta-desktop/apps/server/src/provider/Layers/
- Status: Accepted (by design)
- Discovered: 2026-07-02T04:45Z

## Description

The Trifecta server allows users to configure custom binary paths for
provider adapters (e.g., `binaryPath` for Codex, Claude, etc.). A SAST
scanner flagged this as "arbitrary binary execution" because user-controlled
settings could point to any executable on the system.

## Analysis

This is **accepted as designed** because:

1. **Local desktop application**: Trifecta is a local desktop application
   where the user configures their own settings. The `binaryPath` setting
   is stored in the user's local settings file (`settings.json`) and is
   only accessible to the user themselves.

2. **No untrusted input**: The binary path is not exposed to untrusted
   external input. It is configured by the local user through the desktop
   UI or by editing their own settings file.

3. **Intended functionality**: The ability to specify a custom binary path
   is a core feature — users need to point Trifecta to their installed
   coding agent binaries (Codex, Claude, etc.) which may be in non-standard
   locations.

4. **Same trust level**: The user configuring the binary path has the same
   trust level as the user running the application. There is no privilege
   escalation — the spawned process runs with the same permissions as the
   user.

## Mitigations Already in Place

- Settings are stored in the user's local state directory, not world-readable
- The desktop UI validates binary paths before saving
- Binary paths are only used with `spawn` (not `exec`), preventing shell
  injection

## Decision

**Accepted as designed.** No code changes needed. This is intentional
functionality for a local desktop application where the user controls
their own configuration.

## References

- CWE-78: OS Command Injection (not applicable — no injection, just
  user-configured binary path)
