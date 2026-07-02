import { describe, expect, it } from "vitest";
import {
  isExplicitRelativePath,
  isPathInside,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
} from "./path.ts";

describe("path helpers", () => {
  it("detects windows drive paths", () => {
    expect(isWindowsDrivePath("C:\\repo")).toBe(true);
    expect(isWindowsDrivePath("D:/repo")).toBe(true);
    expect(isWindowsDrivePath("/repo")).toBe(false);
  });

  it("detects UNC paths", () => {
    expect(isUncPath("\\\\server\\share\\repo")).toBe(true);
    expect(isUncPath("C:\\repo")).toBe(false);
  });

  it("detects windows absolute paths", () => {
    expect(isWindowsAbsolutePath("C:\\repo")).toBe(true);
    expect(isWindowsAbsolutePath("\\\\server\\share\\repo")).toBe(true);
    expect(isWindowsAbsolutePath("./repo")).toBe(false);
  });

  it("detects explicit relative paths", () => {
    expect(isExplicitRelativePath(".")).toBe(true);
    expect(isExplicitRelativePath("..")).toBe(true);
    expect(isExplicitRelativePath("./repo")).toBe(true);
    expect(isExplicitRelativePath("..\\repo")).toBe(true);
    expect(isExplicitRelativePath("~/repo")).toBe(false);
  });

  it("checks path containment with isPathInside", () => {
    expect(isPathInside("/a/b", "/a/b")).toBe(true);
    expect(isPathInside("/a/b", "/a/b/c")).toBe(true);
    expect(isPathInside("/a/b", "/a/b/c/d")).toBe(true);
    // sibling with a longer name must NOT match (prefix-only check would be a bug)
    expect(isPathInside("/a/b", "/a/bc")).toBe(false);
    expect(isPathInside("/a/b", "/a")).toBe(false);
    expect(isPathInside("/a/b", "/a/c")).toBe(false);
    expect(isPathInside("/a/b", "/etc/passwd")).toBe(false);
    // handles baseDir already ending with sep
    expect(isPathInside("/a/b/", "/a/b/c")).toBe(true);
    // windows sep
    expect(isPathInside("C:\\repo", "C:\\repo\\sub", "\\")).toBe(true);
    expect(isPathInside("C:\\repo", "C:\\repo2", "\\")).toBe(false);
  });
});
