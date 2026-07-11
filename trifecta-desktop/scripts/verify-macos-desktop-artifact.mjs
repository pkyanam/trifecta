#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

function fail(message) {
  throw new Error(`[desktop-artifact] ${message}`);
}

function parseArgs(argv) {
  const options = {
    dmg: undefined,
    arch: undefined,
    version: undefined,
    requireNotarization: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--require-notarization") {
      options.requireNotarization = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for ${argument}.`);
    }

    if (argument === "--dmg") options.dmg = value;
    else if (argument === "--arch") options.arch = value;
    else if (argument === "--version") options.version = value;
    else fail(`Unknown argument: ${argument}`);
    index++;
  }

  if (!options.dmg)
    fail(
      "Usage: verify-macos-desktop-artifact --dmg <path> [--arch <arch>] [--version <version>] [--require-notarization]",
    );
  if (options.arch && !["arm64", "x64", "universal"].includes(options.arch)) {
    fail(`Unsupported architecture: ${options.arch}`);
  }

  return options;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

const options = parseArgs(process.argv.slice(2));
const dmgPath = resolve(options.dmg);
const mountRoot = mkdtempSync(join(tmpdir(), "trifecta-dmg-verify-"));
let mounted = false;

try {
  console.log(`[desktop-artifact] Verifying disk image ${basename(dmgPath)}...`);
  run("hdiutil", ["verify", dmgPath]);
  run("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mountRoot, dmgPath]);
  mounted = true;

  const appNames = readdirSync(mountRoot).filter((entry) => entry.endsWith(".app"));
  if (appNames.length !== 1) {
    fail(`Expected exactly one app bundle in the DMG, found ${appNames.length}.`);
  }

  const appPath = join(mountRoot, appNames[0]);
  const executableName = run(
    "plutil",
    ["-extract", "CFBundleExecutable", "raw", "-o", "-", join(appPath, "Contents/Info.plist")],
    { capture: true },
  ).trim();
  const executablePath = join(appPath, "Contents/MacOS", executableName);

  if (options.version) {
    const actualVersion = run(
      "plutil",
      [
        "-extract",
        "CFBundleShortVersionString",
        "raw",
        "-o",
        "-",
        join(appPath, "Contents/Info.plist"),
      ],
      { capture: true },
    ).trim();
    if (actualVersion !== options.version) {
      fail(`Expected app version ${options.version}, found ${actualVersion}.`);
    }
  }

  if (options.arch) {
    const actualArchitectures = new Set(
      run("lipo", ["-archs", executablePath], { capture: true }).trim().split(/\s+/),
    );
    const expectedArchitectures =
      options.arch === "universal"
        ? ["arm64", "x86_64"]
        : [options.arch === "x64" ? "x86_64" : "arm64"];
    for (const architecture of expectedArchitectures) {
      if (!actualArchitectures.has(architecture)) {
        fail(
          `Expected ${architecture} in ${executableName}; found ${[...actualArchitectures].join(", ")}.`,
        );
      }
    }
  }

  if (options.requireNotarization) {
    console.log("[desktop-artifact] Verifying code signature and notarization ticket...");
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=4", appPath]);
    run("xcrun", ["stapler", "validate", appPath]);
    run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
  }

  console.log(`[desktop-artifact] macOS artifact verification passed for ${appNames[0]}.`);
} finally {
  if (mounted) {
    try {
      run("hdiutil", ["detach", mountRoot]);
    } catch {
      run("hdiutil", ["detach", "-force", mountRoot]);
    }
  }
  rmSync(mountRoot, { recursive: true, force: true });
}
