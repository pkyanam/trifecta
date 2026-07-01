import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopObservability from "./DesktopObservability.ts";

export const MIGRATION_MARKER = "belweave-localstorage-migrated";

const LEGACY_KEY_PREFIX = "trifecta:";
const NEW_KEY_PREFIX = "belweave:";

export interface DesktopLocalStorageMigrationShape {
  readonly migrate: Effect.Effect<void>;
  readonly needsMigration: Effect.Effect<boolean>;
}

export class DesktopLocalStorageMigration extends Context.Service<
  DesktopLocalStorageMigration,
  DesktopLocalStorageMigrationShape
>()("belweave/desktop/LocalStorageMigration") {}

const { logInfo, logWarning } = DesktopObservability.makeComponentLogger(
  "desktop-localstorage-migration",
);

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;

  const legacyDirNames = environment.legacyUserDataDirNames;
  const appDataDir = environment.appDataDirectory;
  const newUserDataPath = environment.path.join(appDataDir, environment.userDataDirName);
  const newLocalStoragePath = environment.path.join(newUserDataPath, "Local Storage", "leveldb");
  const migrationMarkerPath = environment.path.join(newUserDataPath, MIGRATION_MARKER);

  const needsMigration = Effect.gen(function* () {
    const markerExists = yield* fileSystem
      .exists(migrationMarkerPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (markerExists) return false;

    for (const dirName of legacyDirNames) {
      const legacyPath = environment.path.join(appDataDir, dirName);
      const legacyExists = yield* fileSystem
        .exists(legacyPath)
        .pipe(Effect.orElseSucceed(() => false));
      if (!legacyExists) continue;

      const legacyLocalStoragePath = environment.path.join(legacyPath, "Local Storage", "leveldb");
      const legacyLocalStorageExists = yield* fileSystem
        .exists(legacyLocalStoragePath)
        .pipe(Effect.orElseSucceed(() => false));
      if (legacyLocalStorageExists) return true;
    }

    return false;
  });

  const markMigrationComplete = Effect.gen(function* () {
    yield* fileSystem.makeDirectory(newUserDataPath, { recursive: true }).pipe(Effect.ignore);
    yield* fileSystem
      .writeFileString(migrationMarkerPath, "done")
      .pipe(Effect.catch(() => Effect.void));
  });

  const migrate = Effect.gen(function* () {
    const markerExists = yield* fileSystem
      .exists(migrationMarkerPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (markerExists) {
      yield* logInfo("no legacy localStorage migration needed");
      return;
    }

    // Mark migration as complete immediately so that even if the legacy directory
    // is inaccessible, the user denies the macOS permission prompt, or the app is
    // quit before the actual copy finishes, we never re-trigger the "access data
    // from other apps" prompt on later launches.
    yield* markMigrationComplete;

    yield* logInfo("starting legacy localStorage migration");

    yield* Effect.catchCause(
      Effect.gen(function* () {
        let migratedAny = false;

        for (const dirName of legacyDirNames) {
          const legacyPath = environment.path.join(appDataDir, dirName);
          const legacyLocalStoragePath = environment.path.join(
            legacyPath,
            "Local Storage",
            "leveldb",
          );

          const legacyLocalStorageExists = yield* fileSystem
            .exists(legacyLocalStoragePath)
            .pipe(Effect.orElseSucceed(() => false));
          if (!legacyLocalStorageExists) continue;

          yield* fileSystem.makeDirectory(newLocalStoragePath, { recursive: true });
          yield* logInfo("copying localStorage from legacy directory", { dirName });

          const files = yield* fileSystem
            .readDirectory(legacyLocalStoragePath)
            .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
          for (const file of files) {
            if (!file.endsWith(".ldb")) continue;

            const srcFile = environment.path.join(legacyLocalStoragePath, file);
            const dstFile = environment.path.join(newLocalStoragePath, file);

            const dstExists = yield* fileSystem
              .exists(dstFile)
              .pipe(Effect.orElseSucceed(() => false));
            if (dstExists) continue;

            const content = yield* fileSystem.readFile(srcFile);

            const newContent = Buffer.from(
              Buffer.from(content).toString("latin1").replaceAll(LEGACY_KEY_PREFIX, NEW_KEY_PREFIX),
              "latin1",
            );

            yield* fileSystem.writeFile(dstFile, newContent);
            migratedAny = true;
          }
        }

        if (migratedAny) {
          yield* logInfo("legacy localStorage migration complete");
        } else {
          yield* logInfo("no legacy localStorage data found to migrate");
        }
      }),
      (cause) =>
        logWarning("legacy localStorage migration failed", {
          error: Cause.pretty(cause),
        }),
    );
  });

  return DesktopLocalStorageMigration.of({ migrate, needsMigration });
});

export const layer = Layer.effect(DesktopLocalStorageMigration, make);
