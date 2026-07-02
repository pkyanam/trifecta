# FINDING-002: Windows shell argument injection in editor launch

- Severity: High
- Category: SAST
- Component: trifecta-desktop/apps/server/src/open.ts
- Status: Fixed
- Discovered: 2026-07-02T04:50Z

## Description

The `launchDetached` function in `open.ts` spawns editor processes with
`shell: true` on Windows (needed to resolve `.cmd` files like `code.cmd`).
Arguments were naively wrapped in double quotes using `"${a}"` without
escaping internal double quotes. A user-controlled `cwd` (from the
`OpenInEditorInput` WebSocket RPC schema) containing a `"` character could
break out of the quoted argument and inject arbitrary cmd.exe commands.

## Evidence (file:line, code snippet)

`apps/server/src/open.ts` (before fix, line 200):

```typescript
const isWin32 = process.platform === "win32";
child = spawn(
  launch.command,
  isWin32 ? launch.args.map((a) => `"${a}"`) : [...launch.args],
  {
    detached: true,
    stdio: "ignore",
    shell: isWin32,
  },
);
```

The `cwd` flows from `OpenInEditorInput.cwd` (user-controlled via WebSocket
RPC) through `resolveEditorArgs` into `launch.args`, then to the naive quoting.

Example attack: `cwd = 'foo" & calc & "bar'` produces the cmd.exe command line
`command "foo" & calc & "bar"` which executes `calc` as a separate command.

## Impact

An authenticated WebSocket client could achieve arbitrary command execution
on Windows hosts by supplying a crafted `cwd` value in an `openInEditor` RPC
call. On macOS/Linux, `shell: false` is used so the vulnerability is
Windows-specific.

## Reproduction

1. On a Windows host running the Trifecta server, authenticate via WebSocket.
2. Call the `openInEditor` RPC method with `cwd` containing a `"` character
   followed by `&` and a command name.
3. Observe the injected command executes.

## Fix Applied

Added `escapeWindowsShellArg()` which doubles internal double quotes (`"` →
`""`) per cmd.exe quoting rules. Inside a double-quoted string, `""` is
interpreted as a literal `"` and all shell metacharacters (`&`, `|`, `<`, `>`,
`^`) are inert. This prevents argument breakout.

Files changed:
- `apps/server/src/open.ts` — added `escapeWindowsShellArg`, used in
  `launchDetached` instead of naive `"${a}"` quoting.
- `apps/server/src/open.test.ts` — added 5 unit tests for the escaping
  function including the injection PoC case.

## Tests Added

- `escapeWindowsShellArg wraps a simple path in double quotes`
- `escapeWindowsShellArg wraps a path with spaces in double quotes`
- `escapeWindowsShellArg doubles internal double quotes to prevent cmd.exe injection`
- `escapeWindowsShellArg handles multiple consecutive double quotes`
- `escapeWindowsShellArg handles empty string`

All 1103 tests pass (135 test files, 0 failures).

## References

- CWE-78: Improper Neutralization of Special Elements used in an OS Command
  ('OS Command Injection')
- CWE-88: Improper Neutralization of Argument Delimiters in a Command
- Node.js `child_process.spawn` documentation on `shell: true` risks
