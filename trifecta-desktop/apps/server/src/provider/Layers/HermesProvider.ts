/**
 * HermesProvider — snapshot probe for the Hermes ACP driver.
 *
 * Probes by spawning `hermes acp`, running ACP `initialize` + `session/new`,
 * and extracting the model list from the session response. The subprocess is
 * killed when the probe scope closes.
 *
 * @module provider/Layers/HermesProvider
 */
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { HermesSettings, ServerProvider, ServerProviderModel } from "@t3tools/contracts";
import { ServerSettingsError } from "@t3tools/contracts";

import * as AcpClient from "effect-acp/client";

import {
  AUTH_PROBE_TIMEOUT_MS,
  buildServerProvider,
  isCommandMissingCause,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import packageJson from "../../../package.json" with { type: "json" };

const HERMES_PRESENTATION = {
  displayName: "Hermes",
} as const;

export interface HermesProviderSnapshot {
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly version: string | undefined;
}

const probeHermesProvider = Effect.fn("probeHermesProvider")(function* (input: {
  readonly binaryPath: string;
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
}): Effect.fn.Return<HermesProviderSnapshot, Error, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make(input.binaryPath || "hermes", ["acp"], {
    cwd: input.cwd,
    env: input.environment ?? process.env,
    shell: process.platform === "win32",
  });
  const handle = yield* spawner.spawn(command);

  const acpLayer = AcpClient.layerChildProcess(handle);

  return yield* Effect.gen(function* () {
    const acp = yield* AcpClient.AcpClient;

    const initialized = yield* acp.agent.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: {
        name: "trifecta-desktop",
        version: packageJson.version,
      },
    });

    const session = yield* acp.agent.createSession({
      cwd: input.cwd,
      mcpServers: [],
    });

    const availableModels = session.models?.availableModels ?? [];
    const models: ServerProviderModel[] = availableModels.map((m) => ({
      slug: m.modelId,
      name: m.name ?? m.modelId,
      isCustom: false,
      capabilities: null,
    }));

    const version = initialized.agentInfo?.version ?? undefined;
    return { models, version };
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
