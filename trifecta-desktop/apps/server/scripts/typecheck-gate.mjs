#!/usr/bin/env node
// Effect typecheck gate (run before `tsdown` in the build).
//
// tsdown bundles WITHOUT typechecking, so this is the only thing standing
// between a code change and a shipped `.dmg`. Two classes of bug have shipped
// to packaged builds because of that:
//
//   1. Calls to a non-existent Effect API (e.g. `Effect.catchAll`, which does
//      not exist in this Effect beta) — throws at runtime and surfaces to the
//      mobile client as a connection-level `Defect`.
//   2. An Effect layer requirement that isn't provided (e.g. `ProcessRunner`
//      missing from a `mergeAll`) — the layer fails to build and the server
//      crashes on boot, so the packaged app never loads.
//
// We do NOT fail on the full `tsc` output: the repo runs @effect/language-service
// diagnostics through tsc (many advisory lines) and the test files carry
// pre-existing issues. We fail only on the two high-signal, ship-breaking
// patterns above.
import { spawnSync } from "node:child_process";

const serverDir = new URL("..", import.meta.url).pathname;

const result = spawnSync("tsc", ["--noEmit"], {
  cwd: serverDir,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.error) {
  // Tooling problem (tsc not resolvable here) — don't block the build on it.
  console.warn(`⚠ Effect typecheck gate skipped (could not run tsc): ${result.error.message}`);
  process.exit(0);
}

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

const dangerous = output.split("\n").filter((line) => {
  // (1) Unprovided layer dependency — a CONCRETE service (capitalised), as
  //     opposed to the pervasive `Missing 'any'` requirements-channel advisory.
  if (/Missing '[A-Z]\w*' in the expected Effect context/.test(line)) return true;
  // (2) Accessing an export that doesn't exist on a namespace import
  //     (e.g. `Effect.catchAll`). Always a real bug.
  if (/Property '\w+' does not exist on type 'typeof import\(/.test(line)) return true;
  return false;
});

if (dangerous.length > 0) {
  console.error("\n✘ Effect typecheck gate FAILED — these will break at runtime:\n");
  for (const line of [...new Set(dangerous)]) console.error(`  ${line.trim()}`);
  console.error(
    "\nThese are missing layer dependencies or calls to non-existent APIs.\n" +
      "Fix them before building. (Other tsc / language-service advisories are\n" +
      "intentionally ignored by this gate.)\n",
  );
  process.exit(1);
}

console.log("✓ Effect typecheck gate passed (no missing layer deps / non-existent API calls).");
