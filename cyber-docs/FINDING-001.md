# FINDING-001: Path traversal in git worktree create/remove via WebSocket RPC

- Severity: Medium
- Category: SAST
- Component: trifecta-desktop/apps/server/src/vcs/GitVcsDriverCore.ts
- Status: Fixed
- Discovered: 2026-07-02T02:00Z

## Description

The `createWorktree` and `removeWorktree` operations in `GitVcsDriverCore.ts`
accepted a user-controlled `path` parameter (via the `VcsCreateWorktreeInput`
and `VcsRemoveWorktreeInput` WebSocket RPC schemas) that was only validated as a
`TrimmedNonEmptyString`. There was no canonicalization or containment check
against the server's configured `worktreesDir`.

An authenticated WebSocket client could supply an arbitrary absolute path or a
relative path containing `..` segments to:

- **createWorktree**: create git worktrees (directories + git metadata) at
  arbitrary filesystem locations outside the intended `worktreesDir`.
- **removeWorktree**: invoke `git worktree remove [--force]` on arbitrary
  directories, potentially deleting or corrupting data outside the worktree
  area.

## Evidence (file:line, code snippet)

`apps/server/src/vcs/GitVcsDriverCore.ts` (before fix):

```typescript
// createWorktree — input.path used directly
const worktreePath = input.path ?? path.join(worktreesDir, repoName, sanitizedBranch);
const args = input.newRefName
  ? ["worktree", "add", "-b", input.newRefName, worktreePath, input.refName]
  : ["worktree", "add", worktreePath, input.refName];

// removeWorktree — input.path used directly
const args = ["worktree", "remove"];
if (input.force) { args.push("--force"); }
args.push(input.path);
```

`packages/contracts/src/git.ts` — schema only validates non-empty string:

```typescript
export const VcsCreateWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  refName: TrimmedNonEmptyStringSchema,
  newRefName: Schema.optional(TrimmedNonEmptyStringSchema),
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),  // no path validation
});

export const VcsRemoveWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  path: TrimmedNonEmptyStringSchema,  // no path validation
  force: Schema.optional(Schema.Boolean),
});
```

## Impact

An authenticated user could create or remove git worktrees at arbitrary
filesystem paths. `removeWorktree --force` is the more dangerous vector: it
could delete directories outside the intended worktree area, causing data loss
or denial of service. `createWorktree` could be used to write git metadata to
arbitrary locations, potentially overwriting files.

## Reproduction

1. Authenticate to the Trifecta WebSocket server.
2. Call `vcsCreateWorktree` with `path: "/tmp/escaped"` (or
   `path: "../../etc/escaped"`).
3. Observe a worktree is created outside `worktreesDir`.
4. Call `vcsRemoveWorktree` with `path: "/tmp/escaped"` and `force: true`.
5. Observe the directory is removed via `git worktree remove --force`.

## Fix Applied

Added a shared `isPathInside` utility to `packages/shared/src/path.ts` and
applied containment checks in both `createWorktree` and `removeWorktree`. Both
operations now resolve the user-supplied path and verify it is inside the
server's configured `worktreesDir` before proceeding. If the path escapes
`worktreesDir`, a `GitCommandError` is raised.

Files changed:
- `packages/shared/src/path.ts` — added `isPathInside(baseDir, candidate, sep)`
- `packages/shared/src/path.test.ts` — added unit tests for `isPathInside`
- `apps/server/src/vcs/GitVcsDriverCore.ts` — added containment checks in
  `createWorktree` and `removeWorktree`

## Tests Added

- `packages/shared/src/path.test.ts` — `isPathInside` containment checks
  including sibling-prefix edge case (`/a/b` vs `/a/bc`), Windows sep support.
- `apps/server/src/vcs/GitVcsDriverCore.test.ts`:
  - "rejects createWorktree with a path outside worktreesDir (path traversal)"
    — asserts `GitCommandError` is raised when path is outside `worktreesDir`.
  - "rejects removeWorktree with a path outside worktreesDir (path traversal)"
    — asserts `GitCommandError` is raised when path is outside `worktreesDir`.
  - Updated existing "creates and removes a worktree" test to use a path inside
    `worktreesDir` (previously used an arbitrary tmp dir which is now rejected).

## References

- CWE-22: Improper Limitation of a Pathname to a Restricted Directory
  ('Path Traversal')
- OWASP A01:2021 — Broken Access Control
