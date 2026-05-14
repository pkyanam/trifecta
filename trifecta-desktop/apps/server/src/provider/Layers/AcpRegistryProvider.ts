/**
 * AcpRegistryProvider — snapshot probe for the ACP Registry driver.
 *
 * Probes by spawning the configured command + args, running standard ACP
 * `initialize` + `session/new`, and extracting the model list. No wire
 * normalization is applied; registry agents are assumed to be spec-compliant.
 *
 * @module provider/Layers/AcpRegistryProvider
 */
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { AcpRegistrySettings, ServerProvider, ServerProviderModel } from "@t3tools/contracts";
import { ServerSettingsError } from "@t3tools/contracts";

import * as AcpClient from "effect-acp/client";

import {
  AUTH_PROBE_TIMEOUT_MS,
  buildServerProvider,
  isCommandMissingCause,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import packageJson from "../../../package.json" with { type: "json" };

function parseCommandArgs(commandArgs: string): string[] {
  return commandArgs ? commandArgs.split(/\s+/).filter(Boolean) : [];
}

const ACP_REGISTRY_PRESENTATION = {
  displayName: "ACP Registry",
} as const;

class AcpRegistryProbeError extends Data.TaggedError("AcpRegistryProbeError")<{
  readonly message: string;
}> {}

function presentationForConfig(config: AcpRegistrySettings): { displayName: string } {
  const name = config.agentId?.trim();
  return { displayName: name ? name : "ACP Registry" };
}

export interface AcpRegistryProviderSnapshot {
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly version: string | undefined;
}

const probeAcpRegistryProvider = Effect.fn("probeAcpRegistryProvider")(function* (input: {
  readonly command: string;
  readonly commandArgs: string;
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
}): Effect.fn.Return<
  AcpRegistryProviderSnapshot,
  AcpRegistryProbeError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const spawnCmd = input.command || "npx";
  const spawnArgs = parseCommandArgs(input.commandArgs);

  const command = ChildProcess.make(spawnCmd, spawnArgs, {
    cwd: input.cwd,
    env: input.environment ?? process.env,
    shell: process.platform === "win32",
  });
  const handle = yield* spawner.spawn(command).pipe(
    Effect.mapError(
      (e) =>
        new AcpRegistryProbeError({
          message:
            typeof e === "object" &&
            e !== null &&
            "message" in e &&
            typeof (e as { message: unknown }).message === "string"
              ? `Failed to spawn ${spawnCmd}: ${(e as { message: string }).message}`
              : `Failed to spawn ${spawnCmd}: ${String(e)}`,
        }),
    ),
  );

  const acpLayer = AcpClient.layerChildProcess(handle);

  return yield* Effect.gen(function* () {
    const acp = yield* AcpClient.AcpClient;

    const initResult = yield* acp.agent
      .initialize({
        protocolVersion: 1,
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
            new AcpRegistryProbeError({
              message: `ACP initialize failed: ${String((e as { message?: string }).message ?? e)}`,
            }),
        ),
      );

    const sessionResult = yield* acp.agent
      .createSession({
        cwd: input.cwd,
        mcpServers: [],
      })
      .pipe(
        Effect.mapError(
          (e) =>
            new AcpRegistryProbeError({
              message: `ACP session/new failed: ${String((e as { message?: string }).message ?? e)}`,
            }),
        ),
      );

    const availableModels = sessionResult.models?.availableModels ?? [];
    const models: ServerProviderModel[] = availableModels.map((m) => ({
      slug: m.modelId,
      name: m.name ?? m.modelId,
      isCustom: false,
      capabilities: null,
    }));

    const version = initResult.agentInfo?.version ?? undefined;
    return { models, version };
  }).pipe(Effect.provide(acpLayer));
});

export const makePendingAcpRegistryProvider = (
  config: AcpRegistrySettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const presentation = presentationForConfig(config);

    if (!config.enabled) {
      return buildServerProvider({
        presentation,
        enabled: false,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: `${presentation.displayName} is disabled in Trifecta settings.`,
        },
      });
    }

    return buildServerProvider({
      presentation,
      enabled: true,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: `${presentation.displayName} provider status has not been checked in this session yet.`,
      },
    });
  });

export const checkAcpRegistryProviderStatus = Effect.fn("checkAcpRegistryProviderStatus")(
  function* (
    config: AcpRegistrySettings,
    environment: NodeJS.ProcessEnv = process.env,
    timeoutMs: number = AUTH_PROBE_TIMEOUT_MS,
  ): Effect.fn.Return<
    ServerProviderDraft,
    ServerSettingsError,
    ChildProcessSpawner.ChildProcessSpawner
  > {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    const presentation = presentationForConfig(config);

    if (!config.enabled) {
      return buildServerProvider({
        presentation,
        enabled: false,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: `${presentation.displayName} is disabled in Trifecta settings.`,
        },
      });
    }

    if (!config.command?.trim()) {
      return buildServerProvider({
        presentation,
        enabled: config.enabled,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: "No command configured. Set the command and arguments in provider settings.",
        },
      });
    }

    const probeResult = yield* probeAcpRegistryProvider({
      command: config.command,
      commandArgs: config.commandArgs,
      cwd: process.cwd(),
      environment,
    }).pipe(
      Effect.scoped,
      Effect.timeoutOption(Duration.millis(timeoutMs)),
      Effect.result,
    );

    if (Result.isFailure(probeResult)) {
      const error = probeResult.failure;
      const installed = !isCommandMissingCause(error);
      return buildServerProvider({
        presentation,
        enabled: config.enabled,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: installed
            ? `ACP probe failed: ${error.message}.`
            : `Command \`${config.command}\` is not installed or not on PATH.`,
        },
      });
    }

    if (Option.isNone(probeResult.success)) {
      return buildServerProvider({
        presentation,
        enabled: config.enabled,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: true,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: `Timed out while checking ${presentation.displayName} ACP provider status.`,
        },
      });
    }

    const snapshot = probeResult.success.value;

    return buildServerProvider({
      presentation,
      enabled: config.enabled,
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
  },
);

export type { ServerProvider };
