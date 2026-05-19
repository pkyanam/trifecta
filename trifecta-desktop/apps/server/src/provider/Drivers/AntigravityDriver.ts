import { AntigravitySettings, ProviderDriverKind, type ServerProvider } from "@belweave/contracts";
import { TextGenerationError } from "@belweave/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { TextGenerationShape } from "../../textGeneration/TextGeneration.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeAntigravityHeadlessAdapter } from "../Layers/AntigravityHeadlessAdapter.ts";
import { makeAntigravitySdkAdapter } from "../Layers/AntigravitySdkAdapter.ts";
import {
  checkAntigravityProviderStatus,
  makePendingAntigravityProvider,
} from "../Layers/AntigravityProvider.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import { makeProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import type { ServerProviderDraft } from "../providerSnapshot.ts";

const decodeAntigravitySettings = Schema.decodeSync(AntigravitySettings);

const DRIVER_KIND = ProviderDriverKind.make("antigravity");
const SNAPSHOT_REFRESH_INTERVAL = Duration.minutes(5);
const DEFAULT_ANTIGRAVITY_CLI_COMMAND = "agy";
const DEFAULT_PYTHON_COMMAND = "python3";

function antigravityCli(config: AntigravitySettings): string {
  return config.binaryPath?.trim() || DEFAULT_ANTIGRAVITY_CLI_COMMAND;
}

function antigravityPython(config: AntigravitySettings): string {
  return config.pythonPath?.trim() || DEFAULT_PYTHON_COMMAND;
}

const unsupportedTextGeneration: TextGenerationShape = {
  generateCommitMessage: () =>
    Effect.fail(
      new TextGenerationError({
        operation: "generateCommitMessage",
        detail: "Antigravity text generation is not supported yet.",
      }),
    ),
  generatePrContent: () =>
    Effect.fail(
      new TextGenerationError({
        operation: "generatePrContent",
        detail: "Antigravity text generation is not supported yet.",
      }),
    ),
  generateBranchName: () =>
    Effect.fail(
      new TextGenerationError({
        operation: "generateBranchName",
        detail: "Antigravity text generation is not supported yet.",
      }),
    ),
  generateThreadTitle: () =>
    Effect.fail(
      new TextGenerationError({
        operation: "generateThreadTitle",
        detail: "Antigravity text generation is not supported yet.",
      }),
    ),
};

const withInstanceIdentity =
  (input: {
    readonly instanceId: ProviderInstance["instanceId"];
    readonly displayName: string | undefined;
    readonly accentColor: string | undefined;
    readonly continuationGroupKey: string;
  }) =>
  (snapshot: ServerProviderDraft): ServerProvider => ({
    ...snapshot,
    instanceId: input.instanceId,
    driver: DRIVER_KIND,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationGroupKey },
  });

export type AntigravityDriverEnv = ChildProcessSpawner.ChildProcessSpawner;

export const AntigravityDriver: ProviderDriver<AntigravitySettings, AntigravityDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "Antigravity",
    supportsMultipleInstances: true,
  },
  configSchema: AntigravitySettings,
  defaultConfig: (): AntigravitySettings => decodeAntigravitySettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const processEnv = mergeProviderInstanceEnvironment(environment);
      const effectiveConfig = { ...config, enabled } satisfies AntigravitySettings;
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const stampIdentity = withInstanceIdentity({
        instanceId,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });

      const adapter =
        effectiveConfig.useSdkHarness === false
          ? yield* makeAntigravityHeadlessAdapter({
              antigravityCli: antigravityCli(effectiveConfig),
              environment: processEnv,
              instanceId,
            })
          : yield* makeAntigravitySdkAdapter({
              pythonPath: antigravityPython(effectiveConfig),
              saveDirectory: effectiveConfig.saveDirectory?.trim() || undefined,
              apiKey: effectiveConfig.apiKey?.trim() || undefined,
              environment: processEnv,
              instanceId,
            });

      const checkProvider = checkAntigravityProviderStatus(effectiveConfig, processEnv).pipe(
        Effect.map(stampIdentity),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );

      const snapshot = yield* makeManagedServerProvider<AntigravitySettings>({
        maintenanceCapabilities: makeProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: "google-antigravity",
          updateExecutable: antigravityPython(effectiveConfig),
          updateArgs: ["-m", "pip", "install", "--upgrade", "google-antigravity"],
          updateLockKey: `python-pip:${antigravityPython(effectiveConfig)}`,
        }),
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.never,
        haveSettingsChanged: () => false,
        initialSnapshot: (settings) =>
          makePendingAntigravityProvider(settings).pipe(Effect.map(stampIdentity)),
        checkProvider,
        enrichSnapshot: ({ snapshot: snap, publishSnapshot }) => publishSnapshot(snap),
        refreshInterval: SNAPSHOT_REFRESH_INTERVAL,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build Antigravity snapshot: ${cause.message ?? String(cause)}`,
              cause,
            }),
        ),
      );

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        adapter,
        textGeneration: unsupportedTextGeneration,
      } satisfies ProviderInstance;
    }),
};
