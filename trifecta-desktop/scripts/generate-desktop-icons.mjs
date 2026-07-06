#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";
import { applyMacMask } from "./lib/macos-icon-mask.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const IS_MACOS = process.platform === "darwin";
const DESKTOP_RESOURCES_DIR = join(REPO_ROOT, "apps", "desktop", "resources");

const BRANDS = {
  production: {
    macIconPng: BRAND_ASSET_PATHS.productionMacIconPng,
    windowsIconIco: BRAND_ASSET_PATHS.productionWindowsIconIco,
  },
  nightly: {
    macIconPng: BRAND_ASSET_PATHS.nightlyMacIconPng,
    windowsIconIco: BRAND_ASSET_PATHS.nightlyWindowsIconIco,
  },
  development: {
    macIconPng: BRAND_ASSET_PATHS.developmentDesktopIconPng,
    windowsIconIco: BRAND_ASSET_PATHS.developmentWindowsIconIco,
  },
};

function parseArgs(argv) {
  let brand = "production";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--brand") {
      const value = argv[index + 1];
      if (!value || !(value in BRANDS)) {
        throw new Error(`Unknown brand "${value ?? ""}". Use production, nightly, or development.`);
      }
      brand = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage: node scripts/generate-desktop-icons.mjs [--brand production|nightly|development]",
          "",
          "Regenerates apps/desktop/resources/icon.{icns,png,ico} from the canonical brand assets.",
          "macOS icons are squircle-masked so dock icons keep rounded corners and consistent sizing.",
        ].join("\n") + "\n",
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { brand };
}

function runChecked(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

async function writeIconPng(sourcePng, targetPng, size) {
  // sharp is cross-platform; sips is macOS-only. Prefer sips on macOS to keep
  // byte-for-byte parity with previously shipped icons, fall back to sharp
  // everywhere else.
  if (IS_MACOS) {
    runChecked("sips", ["-z", String(size), String(size), sourcePng, "--out", targetPng]);
    return;
  }
  await sharp(sourcePng)
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toFile(targetPng);
}

function generateIcns(maskedPng, targetIcns) {
  if (!IS_MACOS) {
    // iconutil/sips are macOS-only; .icns is only consumed by macOS builds.
    // Non-mac runners stage icons via build-desktop-artifact's platform logic.
    return;
  }

  const iconsetRoot = mkdtempSync(join(REPO_ROOT, ".tmp-iconset-"));
  const iconsetDir = join(iconsetRoot, "icon.iconset");
  mkdirSync(iconsetDir, { recursive: true });

  try {
    for (const size of [16, 32, 128, 256, 512]) {
      runChecked("sips", [
        "-z",
        String(size),
        String(size),
        maskedPng,
        "--out",
        join(iconsetDir, `icon_${size}x${size}.png`),
      ]);
      const retinaSize = size * 2;
      runChecked("sips", [
        "-z",
        String(retinaSize),
        String(retinaSize),
        maskedPng,
        "--out",
        join(iconsetDir, `icon_${size}x${size}@2x.png`),
      ]);
    }

    try {
      runChecked("iconutil", ["-c", "icns", iconsetDir, "-o", targetIcns]);
    } catch (error) {
      if (!existsSync(targetIcns)) {
        throw error;
      }
      process.stderr.write(
        `Warning: iconutil failed; keeping existing macOS icon at ${targetIcns}\n`,
      );
    }
  } finally {
    rmSync(iconsetRoot, { recursive: true, force: true });
  }
}

function writeStamp(brand, sourcePng) {
  const stamp = {
    brand,
    sourcePng: sourcePng.startsWith(`${REPO_ROOT}/`)
      ? sourcePng.slice(REPO_ROOT.length + 1)
      : sourcePng,
    sourceMtimeMs: statSync(sourcePng).mtimeMs,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(DESKTOP_RESOURCES_DIR, "icon-source.json"),
    `${JSON.stringify(stamp, null, 2)}\n`,
  );
}

async function main() {
  const { brand } = parseArgs(process.argv.slice(2));
  const { macIconPng, windowsIconIco } = BRANDS[brand];
  const sourcePng = join(REPO_ROOT, macIconPng);
  const sourceIco = join(REPO_ROOT, windowsIconIco);

  if (!existsSync(sourcePng)) {
    throw new Error(`Missing macOS icon source at ${sourcePng}`);
  }
  if (!existsSync(sourceIco)) {
    throw new Error(`Missing Windows icon source at ${sourceIco}`);
  }

  mkdirSync(DESKTOP_RESOURCES_DIR, { recursive: true });

  const maskedSourcePng = join(DESKTOP_RESOURCES_DIR, ".icon-masked-source.png");
  const iconPng = join(DESKTOP_RESOURCES_DIR, "icon.png");
  const iconIcns = join(DESKTOP_RESOURCES_DIR, "icon.icns");
  const iconIco = join(DESKTOP_RESOURCES_DIR, "icon.ico");

  await applyMacMask(sourcePng, maskedSourcePng);
  copyFileSync(maskedSourcePng, sourcePng);
  generateIcns(maskedSourcePng, iconIcns);

  await writeIconPng(maskedSourcePng, iconPng, 512);
  copyFileSync(sourceIco, iconIco);
  rmSync(maskedSourcePng, { force: true });
  writeStamp(brand, sourcePng);

  const generated = [`Generated desktop icons from ${macIconPng}`];
  if (IS_MACOS) {
    generated.push(`  ${iconIcns}`);
  }
  generated.push(`  ${iconPng}`, `  ${iconIco}`);
  process.stdout.write(generated.join("\n") + "\n");
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
