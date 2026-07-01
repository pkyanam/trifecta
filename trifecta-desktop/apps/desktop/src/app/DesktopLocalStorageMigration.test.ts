import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLocalStorageMigration from "./DesktopLocalStorageMigration.ts";
import { MIGRATION_MARKER } from "./DesktopLocalStorageMigration.ts";

const makeEnvironmentLayer = (baseDir: string) =>
  DesktopEnvironment.layer({
    dirname: "/repo/apps/desktop/src",
    homeDirectory: baseDir,
    platform: "darwin",
    processArch: "x64",
    appVersion: "0.0.17",
    appPath: "/repo",
    isPackaged: true,
    resourcesPath: "/missing/resources",
    runningUnderArm64Translation: false,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({ BELWEAVE_HOME: baseDir })),
    ),
  );

const withMigration = <A, E, R>(
  effect: Effect.Effect<
    A,
    E,
    | R
    | DesktopLocalStorageMigration.DesktopLocalStorageMigration
    | DesktopEnvironment.DesktopEnvironment
  >,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const baseDir = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "belweave-desktop-localstorage-migration-test-",
    });
    return yield* effect.pipe(
      Effect.provide(
        DesktopLocalStorageMigration.layer.pipe(
          Layer.provideMerge(makeEnvironmentLayer(baseDir)),
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
    );
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped);

const legacyLocalStoragePath = (environment: DesktopEnvironment.DesktopEnvironmentShape) =>
  environment.path.join(
    environment.appDataDirectory,
    environment.legacyUserDataDirName,
    "Local Storage",
    "leveldb",
  );

const newLocalStoragePath = (environment: DesktopEnvironment.DesktopEnvironmentShape) =>
  environment.path.join(
    environment.appDataDirectory,
    environment.userDataDirName,
    "Local Storage",
    "leveldb",
  );

const migrationMarkerPath = (environment: DesktopEnvironment.DesktopEnvironmentShape) =>
  environment.path.join(
    environment.appDataDirectory,
    environment.userDataDirName,
    MIGRATION_MARKER,
  );

describe("DesktopLocalStorageMigration", () => {
  it.effect("copies legacy localStorage and writes the migration marker", () =>
    withMigration(
      Effect.gen(function* () {
        const environment = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        const migration = yield* DesktopLocalStorageMigration.DesktopLocalStorageMigration;

        const legacyPath = legacyLocalStoragePath(environment);
        const legacyFile = environment.path.join(legacyPath, "000001.ldb");
        yield* fileSystem.makeDirectory(legacyPath, { recursive: true });
        yield* fileSystem.writeFileString(legacyFile, "trifecta:some-key");

        yield* migration.migrate;

        const newPath = newLocalStoragePath(environment);
        const migratedFile = environment.path.join(newPath, "000001.ldb");
        const migratedContent = yield* fileSystem.readFileString(migratedFile);
        assert.equal(migratedContent, "belweave:some-key");

        const marker = migrationMarkerPath(environment);
        assert.isTrue(yield* fileSystem.exists(marker).pipe(Effect.orElseSucceed(() => false)));
      }),
    ),
  );

  it.effect("writes the marker even when there is no legacy localStorage to migrate", () =>
    withMigration(
      Effect.gen(function* () {
        const environment = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        const migration = yield* DesktopLocalStorageMigration.DesktopLocalStorageMigration;

        yield* migration.migrate;

        const marker = migrationMarkerPath(environment);
        assert.isTrue(yield* fileSystem.exists(marker).pipe(Effect.orElseSucceed(() => false)));

        const newPath = newLocalStoragePath(environment);
        assert.isFalse(yield* fileSystem.exists(newPath).pipe(Effect.orElseSucceed(() => false)));
      }),
    ),
  );

  it.effect("does nothing when the migration marker already exists", () =>
    withMigration(
      Effect.gen(function* () {
        const environment = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        const migration = yield* DesktopLocalStorageMigration.DesktopLocalStorageMigration;

        const legacyPath = legacyLocalStoragePath(environment);
        const legacyFile = environment.path.join(legacyPath, "000001.ldb");
        yield* fileSystem.makeDirectory(legacyPath, { recursive: true });
        yield* fileSystem.writeFileString(legacyFile, "trifecta:some-key");

        const marker = migrationMarkerPath(environment);
        yield* fileSystem.makeDirectory(
          environment.path.join(environment.appDataDirectory, environment.userDataDirName),
          { recursive: true },
        );
        yield* fileSystem.writeFileString(marker, "done");

        yield* migration.migrate;

        const newPath = newLocalStoragePath(environment);
        assert.isFalse(yield* fileSystem.exists(newPath).pipe(Effect.orElseSucceed(() => false)));
      }),
    ),
  );
});
