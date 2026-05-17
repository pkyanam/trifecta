/**
 * GeminiDriver — `ProviderDriver` for Google Gemini CLI.
 *
 * Chat uses **headless** mode (`gemini -p …`): the first turn starts a Gemini
 * session with `--session-id <uuid>`, and follow-up turns resolve that UUID via
 * `gemini --list-sessions` and use Gemini CLI's documented numeric resume form.
 *
 * Runs the `gemini` binary on `PATH` (e.g. Homebrew or `npm i -g @google/gemini-cli`)
 * unless `binaryPath` overrides. When an API key is configured it is passed as
 * `GEMINI_API_KEY`; otherwise the CLI uses its default auth (browser OAuth,
 * existing login, etc.).
 *
 * Reuses the ACP Registry probe / text-generation helpers for model discovery
 * and structured text features; headless mode only replaces the chat adapter.
 *
 * @module provider/Drivers/GeminiDriver
 */
import { GeminiSettings, ProviderDriverKind, type ServerProvider } from "@belweave/contracts";
import type { AcpRegistrySettings } from "@belweave/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import { makeAcpRegistryTextGeneration } from "../../textGeneration/AcpRegistryTextGeneration.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeGeminiHeadlessAdapter } from "../Layers/GeminiHeadlessAdapter.ts";
import {
  checkAcpRegistryProviderStatus,
  makePendingAcpRegistryProvider,
} from "../Layers/AcpRegistryProvider.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import type { ServerProviderDraft } from "../providerSnapshot.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";

const decodeGeminiSettings = Schema.decodeSync(GeminiSettings);

const DRIVER_KIND = ProviderDriverKind.make("gemini");
const SNAPSHOT_REFRESH_INTERVAL = Duration.minutes(5);
// Gemini's ACP server can take over a minute to answer under packaged-app
// startup load.
// Provider refreshes run in the background, so this can be longer than the
// normal CLI health checks without blocking Electron startup.
const GEMINI_AUTH_PROBE_TIMEOUT_MS = 120_000;

/** Default when `binaryPath` is unset: global CLI (`brew install gemini`, npm `-g`, etc.). */
const DEFAULT_GEMINI_CLI_COMMAND = "gemini";

function buildGeminiAcpConfig(config: GeminiSettings): AcpRegistrySettings {
  const geminiCli = config.binaryPath?.trim() || DEFAULT_GEMINI_CLI_COMMAND;
  return {
    enabled: config.enabled,
    agentId: "Gemini",
    command: geminiCli,
    commandArgs: "--acp",
  };
}

function buildGeminiEnv(baseEnv: NodeJS.ProcessEnv, config: GeminiSettings): NodeJS.ProcessEnv {
  if (config.apiKey?.trim()) {
    return { ...baseEnv, GEMINI_API_KEY: config.apiKey.trim() };
  }
  return baseEnv;
}

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

export type GeminiDriverEnv = ChildProcessSpawner.ChildProcessSpawner | ProviderSessionDirectory;

export const GeminiDriver: ProviderDriver<GeminiSettings, GeminiDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "Gemini",
    supportsMultipleInstances: true,
  },
  configSchema: GeminiSettings,
  defaultConfig: (): GeminiSettings => decodeGeminiSettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const processEnv = mergeProviderInstanceEnvironment(environment);
      const geminiEnv = buildGeminiEnv(processEnv, config);
      const acpConfig = buildGeminiAcpConfig({ ...config, enabled });
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
      const effectiveConfig = { ...config, enabled } satisfies GeminiSettings;

      // Gemini's ACP prompt transport currently fails on follow-up turns in
      // production. Keep ACP for probing/text generation, but force chat turns
      // through the headless CLI path even if an older stored config explicitly
      // contains `useHeadlessPromptTransport: false`.
      const adapter = yield* makeGeminiHeadlessAdapter({
        geminiCli: acpConfig.command,
        environment: geminiEnv,
        instanceId,
      });

      const textGeneration = yield* makeAcpRegistryTextGeneration(acpConfig, geminiEnv);

      const checkProvider = checkAcpRegistryProviderStatus(
        acpConfig,
        geminiEnv,
        GEMINI_AUTH_PROBE_TIMEOUT_MS,
      ).pipe(
        Effect.map(stampIdentity),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );

      const snapshot = yield* makeManagedServerProvider<GeminiSettings>({
        maintenanceCapabilities: makeManualOnlyProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: null,
        }),
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.never,
        haveSettingsChanged: () => false,
        initialSnapshot: (settings) =>
          makePendingAcpRegistryProvider(buildGeminiAcpConfig(settings)).pipe(
            Effect.map(stampIdentity),
          ),
        checkProvider,
        enrichSnapshot: ({ snapshot: snap, publishSnapshot }) => publishSnapshot(snap),
        refreshInterval: SNAPSHOT_REFRESH_INTERVAL,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build Gemini snapshot: ${cause.message ?? String(cause)}`,
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
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
