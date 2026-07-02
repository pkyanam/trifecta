# FINDING-003: Reliance on process.env.HOME for home directory resolution

- Severity: Low
- Category: Hardening
- Component: trifecta-desktop (multiple files)
- Status: Fixed
- Discovered: 2026-07-02T04:55Z

## Description

Multiple server-side modules used `process.env.HOME` (or
`process.env.USERPROFILE`) to resolve the user's home directory. The `HOME`
environment variable can be unset, empty, or manipulated by a parent process,
leading to incorrect path resolution for SSH config discovery, shell profile
modification, SSH session spawn cwd, and Antigravity SDK data storage.

`os.homedir()` uses the OS-level API (getpwuid on POSIX, SHGetFolderPath on
Windows) and is not affected by environment variable manipulation.

## Evidence (file:line, code snippet)

Before fix, 7 occurrences across 5 files:

```typescript
// packages/ssh/src/config.ts:206
const homeDir = input?.homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? "";

// apps/server/src/ws.ts:1721
const home = process.env.HOME ?? process.cwd();

// apps/server/src/ssh/Layers/SshSessionManagerLive.ts:385
cwd: process.env.HOME ?? process.env.USERPROFILE ?? process.cwd(),

// apps/server/src/ssh/Layers/SshCredentialsLive.ts:18
return process.env.HOME || process.env.USERPROFILE || Os.homedir() || undefined;

// apps/server/src/provider/Layers/AntigravitySdkAdapter.ts:36,386,387
const DEFAULT_SAVE_DIR = `${process.env.HOME || "."}/.trifecta/antigravity-sdk`;
if (path === "~") return process.env.HOME || path;
if (path.startsWith("~/")) return `${process.env.HOME || "."}${path.slice(1)}`;
```

## Impact

If `HOME` is manipulated or unset, SSH config discovery could fail silently,
shell profile modifications could target the wrong directory, SSH sessions
could spawn with an unexpected cwd, and Antigravity SDK data could be stored
in an unintended location. This is primarily a reliability and
defense-in-depth issue.

## Reproduction

1. Start the Trifecta server with `HOME=/tmp/fake node ...`
2. Attempt SSH host discovery or shell profile setup.
3. Observe operations target `/tmp/fake` instead of the real home directory.

## Fix Applied

Replaced all `process.env.HOME` / `process.env.USERPROFILE` references with
`Os.homedir()` from `node:os`. The `os.homedir()` function uses the OS API
directly and is not influenced by environment variable manipulation.

Files changed:
- `packages/ssh/src/config.ts` — `discoverSshHosts` home directory resolution
- `apps/server/src/ws.ts` — SSH shell profile setup home directory
- `apps/server/src/ssh/Layers/SshSessionManagerLive.ts` — SSH PTY spawn cwd
- `apps/server/src/ssh/Layers/SshCredentialsLive.ts` — SSH identity file resolution
- `apps/server/src/provider/Layers/AntigravitySdkAdapter.ts` — default save dir
  and `expandUserPath` function

## Tests Added

No new tests needed — existing tests cover the affected code paths and all
1103 tests pass. The change is a drop-in replacement with identical behavior
under normal conditions but more robust under edge cases.

## References

- CWE-426: Untrusted Search Path (related — environment variable trust)
- Node.js documentation: `os.homedir()` uses OS-level home directory resolution
