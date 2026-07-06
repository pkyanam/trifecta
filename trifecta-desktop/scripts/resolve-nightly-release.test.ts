import { assert, it } from "@effect/vitest";

import {
  parseNightlyNumberFromTag,
  resolveNightlyBaseVersion,
  resolveNightlyReleaseMetadata,
  resolveNightlyTargetVersion,
} from "./resolve-nightly-release.ts";

it("strips prerelease and build metadata when deriving the nightly base version", () => {
  assert.equal(resolveNightlyBaseVersion("0.0.17"), "0.0.17");
  assert.equal(resolveNightlyBaseVersion("9.9.9-smoke.0"), "9.9.9");
  assert.equal(resolveNightlyBaseVersion("1.2.3-beta.4+build.9"), "1.2.3");
});

it("bumps the patch version before deriving nightly prerelease versions", () => {
  assert.equal(resolveNightlyTargetVersion("0.0.17"), "0.0.18");
  assert.equal(resolveNightlyTargetVersion("9.9.9-smoke.0"), "9.9.10");
  assert.equal(resolveNightlyTargetVersion("1.2.3-beta.4+build.9"), "1.2.4");
});

it("derives nightly metadata including the short commit sha in the release name", () => {
  assert.deepStrictEqual(resolveNightlyReleaseMetadata("9.9.10", 321, "abcdef1234567890"), {
    baseVersion: "9.9.10",
    version: "9.9.10-nightly.321",
    tag: "v9.9.10-nightly.321",
    name: "Trifecta Nightly 9.9.10-nightly.321 (abcdef123456)",
    shortSha: "abcdef123456",
  });
});

it("derives nightly metadata for small nightly build numbers", () => {
  assert.deepStrictEqual(resolveNightlyReleaseMetadata("0.0.45", 1, "abcdef1234567890"), {
    baseVersion: "0.0.45",
    version: "0.0.45-nightly.1",
    tag: "v0.0.45-nightly.1",
    name: "Trifecta Nightly 0.0.45-nightly.1 (abcdef123456)",
    shortSha: "abcdef123456",
  });
});

it("parses nightly build numbers from new-format tags", () => {
  assert.equal(parseNightlyNumberFromTag("0.0.45", "v0.0.45-nightly.1"), 1);
  assert.equal(parseNightlyNumberFromTag("0.0.45", "v0.0.45-nightly.42"), 42);
});

it("returns undefined for legacy-format tags and mismatched base versions", () => {
  // Legacy format: vX.Y.Z-nightly.DATE.RUN
  assert.isUndefined(parseNightlyNumberFromTag("0.0.45", "v0.0.45-nightly.20250705.42"));
  // Mismatched base version
  assert.isUndefined(parseNightlyNumberFromTag("0.0.45", "v0.0.44-nightly.1"));
  // Non-nightly tag
  assert.isUndefined(parseNightlyNumberFromTag("0.0.45", "v0.0.45"));
  // Zero or negative nightly numbers
  assert.isUndefined(parseNightlyNumberFromTag("0.0.45", "v0.0.45-nightly.0"));
});
