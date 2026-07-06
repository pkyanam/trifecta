#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import { Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

interface NightlyReleaseMetadata {
  readonly baseVersion: string;
  readonly version: string;
  readonly tag: string;
  readonly name: string;
  readonly shortSha: string;
}

const NightlyNumberSchema = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
);
const ShaSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,40}$/i));
const DesktopPackageJsonSchema = Schema.Struct({
  version: Schema.NonEmptyString,
});

const RepoRoot = Effect.service(Path.Path).pipe(
  Effect.flatMap((path) => path.fromFileUrl(new URL("..", import.meta.url))),
);
const decodeDesktopPackageJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(DesktopPackageJsonSchema),
);

export const resolveNightlyBaseVersion = (version: string) => version.replace(/[-+].*$/, "");

export const resolveNightlyTargetVersion = (version: string) => {
  const stableCore = resolveNightlyBaseVersion(version);
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(stableCore);
  if (!match) {
    throw new Error(`Invalid desktop package version '${version}'.`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
};

export const resolveNightlyReleaseMetadata = (
  baseVersion: string,
  nightlyNumber: number,
  sha: string,
) => {
  const shortSha = sha.slice(0, 12);
  const version = `${baseVersion}-nightly.${nightlyNumber}`;
  return {
    baseVersion,
    version,
    tag: `v${version}`,
    name: `Trifecta Nightly ${version} (${shortSha})`,
    shortSha,
  };
};

/**
 * Extracts the nightly build number from a tag using the new
 * `vX.Y.Z-nightly.N` format. Returns `undefined` for legacy
 * `vX.Y.Z-nightly.DATE.RUN` tags.
 */
export const parseNightlyNumberFromTag = (baseVersion: string, tag: string): number | undefined => {
  const prefix = `v${baseVersion}-nightly.`;
  if (!tag.startsWith(prefix)) return undefined;
  const suffix = tag.slice(prefix.length);
  // New format is a single integer. Legacy format has DATE.RUN (two parts).
  if (!/^\d+$/.test(suffix)) return undefined;
  const value = Number(suffix);
  return Number.isInteger(value) && value >= 1 ? value : undefined;
};

const listGitTags = Effect.fn("listGitTags")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(ChildProcess.make("git", ["tag", "--list"]));
  const tags = yield* child.stdout.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (acc, chunk) => acc + chunk,
    ),
    Effect.map(String.split(/\r?\n/)),
    Effect.map(Array.map(String.trim)),
    Effect.map(Array.filter(String.isNonEmpty)),
  );
  return tags;
});

/**
 * Resolves the next nightly build number for the given base version by
 * scanning existing git tags matching `v${baseVersion}-nightly.N`. Returns
 * 1 if no prior nightly tags exist for this base version.
 */
export const resolveNextNightlyNumber = Effect.fn("resolveNextNightlyNumber")(function* (
  baseVersion: string,
) {
  const tags = yield* listGitTags();
  let maxNightlyNumber = 0;
  for (const tag of tags) {
    const nightlyNumber = parseNightlyNumberFromTag(baseVersion, tag);
    if (nightlyNumber !== undefined && nightlyNumber > maxNightlyNumber) {
      maxNightlyNumber = nightlyNumber;
    }
  }
  return maxNightlyNumber + 1;
});

const readDesktopBaseVersion = Effect.fn("readDesktopBaseVersion")(function* (
  rootDir: string | undefined,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = rootDir ? path.resolve(rootDir) : yield* RepoRoot;
  const packageJsonPath = path.join(workspaceRoot, "apps/desktop/package.json");
  const packageJson = yield* fs
    .readFileString(packageJsonPath)
    .pipe(Effect.flatMap(decodeDesktopPackageJson));
  return resolveNightlyTargetVersion(packageJson.version);
});

const writeOutput = Effect.fn("writeOutput")(function* (
  metadata: NightlyReleaseMetadata,
  writeGithubOutput: boolean,
) {
  const fs = yield* FileSystem.FileSystem;

  const entries = [
    ["base_version", metadata.baseVersion],
    ["version", metadata.version],
    ["tag", metadata.tag],
    ["name", metadata.name],
    ["short_sha", metadata.shortSha],
  ] as const;

  if (writeGithubOutput) {
    const githubOutputPath = yield* Config.nonEmptyString("GITHUB_OUTPUT");
    const serialized = entries.map(([key, value]) => `${key}=${value}\n`).join("");
    yield* fs.writeFileString(githubOutputPath, serialized, { flag: "a" });
  } else {
    for (const [key, value] of entries) {
      yield* Console.log(`${key}=${value}`);
    }
  }
});

const command = Command.make(
  "resolve-nightly-release",
  {
    sha: Flag.string("sha").pipe(
      Flag.withSchema(ShaSchema),
      Flag.withDescription("Commit sha for the nightly build."),
    ),
    nightlyNumber: Flag.string("nightly-number").pipe(
      Flag.withSchema(NightlyNumberSchema),
      Flag.withDescription(
        "Explicit nightly build number. If omitted, the next number is resolved from existing git tags.",
      ),
      Flag.optional,
    ),
    githubOutput: Flag.boolean("github-output").pipe(
      Flag.withDescription("Write values to GITHUB_OUTPUT instead of stdout."),
      Flag.withDefault(false),
    ),
    root: Flag.string("root").pipe(
      Flag.withDescription("Workspace root used to resolve apps/desktop/package.json."),
      Flag.optional,
    ),
  },
  ({ sha, nightlyNumber, githubOutput, root }) =>
    readDesktopBaseVersion(Option.getOrUndefined(root)).pipe(
      Effect.flatMap((baseVersion) =>
        Option.match(nightlyNumber, {
          onNone: () => resolveNextNightlyNumber(baseVersion),
          onSome: (value) => Effect.succeed(value),
        }).pipe(
          Effect.map((resolvedNightlyNumber) =>
            resolveNightlyReleaseMetadata(baseVersion, resolvedNightlyNumber, sha),
          ),
        ),
      ),
      Effect.flatMap((metadata) => writeOutput(metadata, githubOutput)),
    ),
).pipe(Command.withDescription("Resolve nightly release version metadata."));

if (import.meta.main) {
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
