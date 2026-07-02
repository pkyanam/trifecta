export function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:([/\\]|$)/.test(value);
}

export function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

export function isWindowsAbsolutePath(value: string): boolean {
  return isUncPath(value) || isWindowsDrivePath(value);
}

export function isExplicitRelativePath(value: string): boolean {
  return (
    value === "." ||
    value === ".." ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\")
  );
}

/**
 * Returns true when `candidate` is equal to or nested inside `baseDir`.
 *
 * Both arguments MUST be already-resolved absolute paths (e.g. via
 * `path.resolve`). The check is a normalized prefix comparison that is robust
 * against sibling-directory confusion (`/foo/bar` is NOT inside `/foo/ba`).
 *
 * `sep` defaults to `/` (POSIX). Pass `path.sep` from the platform Path service
 * for cross-platform correctness.
 */
export function isPathInside(baseDir: string, candidate: string, sep = "/"): boolean {
  if (candidate === baseDir) {
    return true;
  }
  const baseWithSep = baseDir.endsWith(sep) ? baseDir : `${baseDir}${sep}`;
  return candidate.startsWith(baseWithSep);
}
