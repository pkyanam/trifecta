/**
 * HermesProvider — snapshot probe for the Hermes ACP driver.
 *
 * Probes by spawning `hermes acp`, running ACP `initialize` + `session/new`,
 * and extracting the model list from the session response. The subprocess is
 * killed when the probe scope closes.
 *
 * @module provider/Layers/HermesProvider
 */
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type {
  HermesSettings,
  ProviderOptionChoice,
  ProviderOptionDescriptor,
  ServerProvider,
  ServerProviderModel,
} from "@belweave/contracts";
import { ServerSettingsError } from "@belweave/contracts";
import { createModelCapabilities } from "@belweave/shared/model";

import * as AcpClient from "effect-acp/client";
import type * as AcpSchema from "effect-acp/schema";
import { AGENT_METHODS } from "effect-acp/schema";

import {
  AUTH_PROBE_TIMEOUT_MS,
  buildServerProvider,
  isCommandMissingCause,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  decodeHermesInitializeResponse,
  decodeHermesNewSessionResponse,
  normalizeHermesSessionConfigOptions,
} from "../hermes/HermesAcpWire.ts";
import packageJson from "../../../package.json" with { type: "json" };

const HERMES_PRESENTATION = {
  displayName: "Hermes",
} as const;

class HermesAcpProbeError extends Data.TaggedError("HermesAcpProbeError")<{
  readonly message: string;
}> {}

export interface HermesProviderSnapshot {
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly version: string | undefined;
}

function flattenConfigOptionValues(
  option: Extract<AcpSchema.SessionConfigOption, { readonly type: "select" }>,
): ReadonlyArray<{ readonly value: string; readonly name: string; readonly description?: string }> {
  return option.options.flatMap((entry) =>
    "value" in entry
      ? [
          {
            value: entry.value,
            name: entry.name,
            ...(entry.description ? { description: entry.description } : {}),
          },
        ]
      : entry.options.map((grouped) => ({
          value: grouped.value,
          name: grouped.name,
          ...(grouped.description ? { description: grouped.description } : {}),
        })),
  );
}

function modelOptionDescriptorsFromConfigOptions(
  configOptions: ReadonlyArray<AcpSchema.SessionConfigOption>,
): ReadonlyArray<ProviderOptionDescriptor> {
  const descriptors: ProviderOptionDescriptor[] = [];
  for (const option of configOptions) {
    if (option.category === "model") continue;
    if (option.type === "boolean") {
      descriptors.push({
        id: option.id,
        label: option.name,
        ...(option.description ? { description: option.description } : {}),
        type: "boolean",
        currentValue: option.currentValue,
      });
      continue;
    }
    const choices: ProviderOptionChoice[] = [];
    for (const choice of flattenConfigOptionValues(option)) {
      if (choice.value.trim().length === 0 || choice.name.trim().length === 0) continue;
      choices.push({
        id: choice.value,
        label: choice.name,
        ...(choice.description ? { description: choice.description } : {}),
        ...(choice.value === option.currentValue ? { isDefault: true } : {}),
      });
    }
    if (choices.length > 0) {
      descriptors.push({
        id: option.id,
        label: option.name,
        ...(option.description ? { description: option.description } : {}),
        type: "select",
        currentValue: option.currentValue,
        options: choices,
      });
    }
  }
  return descriptors;
}

function modelsFromSessionConfigOptions(
  configOptions: ReadonlyArray<AcpSchema.SessionConfigOption>,
): ReadonlyArray<ServerProviderModel> {
  const modelConfig = configOptions.find(
    (option): option is Extract<AcpSchema.SessionConfigOption, { readonly type: "select" }> =>
      option.type === "select" && option.category === "model",
  );
  if (!modelConfig) return [];
  const descriptors = modelOptionDescriptorsFromConfigOptions(configOptions);
  const capabilities = createModelCapabilities({ optionDescriptors: descriptors });
  return flattenConfigOptionValues(modelConfig)
    .filter((model) => model.value.trim().length > 0 && model.name.trim().length > 0)
    .map((model) => ({
      slug: model.value,
      name: model.name,
      isCustom: false,
      capabilities,
    }));
}

const probeHermesProvider = Effect.fn("probeHermesProvider")(function* (input: {
  readonly binaryPath: string;
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
}): Effect.fn.Return<
  HermesProviderSnapshot,
  HermesAcpProbeError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make(input.binaryPath || "hermes", ["acp"], {
    cwd: input.cwd,
    env: input.environment ?? process.env,
    shell: process.platform === "win32",
  });
  const handle = yield* spawner.spawn(command).pipe(
    Effect.mapError(
      (e) =>
        new HermesAcpProbeError({
          message:
            typeof e === "object" &&
            e !== null &&
            "message" in e &&
            typeof (e as { message: unknown }).message === "string"
              ? `Failed to spawn hermes acp: ${(e as { message: string }).message}`
              : `Failed to spawn hermes acp: ${String(e)}`,
        }),
    ),
  );

  const acpLayer = AcpClient.layerChildProcess(handle);

  return yield* Effect.gen(function* () {
    const acp = yield* AcpClient.AcpClient;

    const rawInit = yield* acp.raw
      .request(AGENT_METHODS.initialize, {
        protocolVersion: 1 as const,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: {
          name: "trifecta-desktop",
          version: packageJson.version,
        },
      })
      .pipe(
        Effect.mapError(
          (e) =>
            new HermesAcpProbeError({
              message: `ACP initialize transport failed: ${String((e as { message?: string }).message ?? e)}`,
            }),
        ),
      );

    const initialized = yield* decodeHermesInitializeResponse(rawInit).pipe(
      Effect.mapError(
        (e) =>
          new HermesAcpProbeError({
            message: `ACP initialize response decode failed: ${e.message}`,
          }),
      ),
    );

    const rawSession = yield* acp.raw
      .request(AGENT_METHODS.session_new, {
        cwd: input.cwd,
        mcpServers: [],
      })
      .pipe(
        Effect.mapError(
          (e) =>
            new HermesAcpProbeError({
              message: `ACP session/new transport failed: ${String((e as { message?: string }).message ?? e)}`,
            }),
        ),
      );

    const session = yield* decodeHermesNewSessionResponse(rawSession).pipe(
      Effect.mapError(
        (e) =>
          new HermesAcpProbeError({
            message: `ACP session/new response decode failed: ${e.message}`,
          }),
      ),
    );

    const configOptions = normalizeHermesSessionConfigOptions(session.configOptions ?? []);
    const optionModels = modelsFromSessionConfigOptions(configOptions);
    const availableModels = session.models?.availableModels ?? [];
    const descriptors = modelOptionDescriptorsFromConfigOptions(configOptions);
    const capabilities =
      descriptors.length > 0 ? createModelCapabilities({ optionDescriptors: descriptors }) : null;
    const models: ServerProviderModel[] = availableModels.map((m) => ({
      slug: m.modelId,
      name: m.name ?? m.modelId,
      isCustom: false,
      capabilities,
    }));

    const version = initialized.agentInfo?.version ?? undefined;
    return { models: models.length > 0 ? models : optionModels, version };
  }).pipe(Effect.provide(acpLayer));
});

export const makePendingHermesProvider = (
  hermesSettings: HermesSettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);

    if (!hermesSettings.enabled) {
      return buildServerProvider({
        presentation: HERMES_PRESENTATION,
        enabled: false,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Hermes is disabled in Trifecta settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: true,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Hermes provider status has not been checked in this session yet.",
      },
    });
  });

export const checkHermesProviderStatus = Effect.fn("checkHermesProviderStatus")(function* (
  hermesSettings: HermesSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ServerProviderDraft,
  ServerSettingsError,
  ChildProcessSpawner.ChildProcessSpawner
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);

  if (!hermesSettings.enabled) {
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: false,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Hermes is disabled in Trifecta settings.",
      },
    });
  }

  const probeResult = yield* probeHermesProvider({
    binaryPath: hermesSettings.binaryPath,
    cwd: process.cwd(),
    environment,
  }).pipe(
    Effect.scoped,
    Effect.timeoutOption(Duration.millis(AUTH_PROBE_TIMEOUT_MS)),
    Effect.result,
  );

  if (Result.isFailure(probeResult)) {
    const error = probeResult.failure;
    const installed = !isCommandMissingCause(error);
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: hermesSettings.enabled,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: installed
          ? `Hermes ACP probe failed: ${error.message}.`
          : "Hermes CLI (`hermes`) is not installed or not on PATH.",
      },
    });
  }

  if (Option.isNone(probeResult.success)) {
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: hermesSettings.enabled,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Timed out while checking Hermes ACP provider status.",
      },
    });
  }

  const snapshot = probeResult.success.value;

  return buildServerProvider({
    presentation: HERMES_PRESENTATION,
    enabled: hermesSettings.enabled,
    checkedAt,
    models: snapshot.models,
    skills: [],
    probe: {
      installed: true,
      version: snapshot.version ?? null,
      status: "ready",
      auth: { status: "authenticated" },
    },
  });
});

export type { ServerProvider };
