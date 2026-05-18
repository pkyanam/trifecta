/**
 * DevinProvider — snapshot probe for the Devin ACP driver.
 *
 * Probes by spawning `devin acp`, running ACP `initialize` + `session/new`,
 * and extracting the model list from the session response. The subprocess is
 * killed when the probe scope closes.
 *
 * Devin reports models inside `configOptions` rather than the standard ACP
 * `models.availableModels` field, so DevinAcpWire.ts normalizes that first.
 * Version is also fixed: Devin ACP returns "0.0.0-dev" for agentInfo.version,
 * so we fall back to `devin version` via a short-lived subprocess.
 *
 * @module provider/Layers/DevinProvider
 */
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { DevinSettings, ServerProvider, ServerProviderModel } from "@belweave/contracts";
import { ServerSettingsError } from "@belweave/contracts";

import * as AcpClient from "effect-acp/client";
import { AGENT_METHODS } from "effect-acp/schema";

import { collectUint8StreamText } from "../../stream/collectUint8StreamText.ts";

import {
  AUTH_PROBE_TIMEOUT_MS,
  buildServerProvider,
  isCommandMissingCause,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  decodeDevinInitializeResponse,
  decodeDevinNewSessionResponse,
} from "../devin/DevinAcpWire.ts";
import packageJson from "../../../package.json" with { type: "json" };

const DEVIN_PRESENTATION = {
  displayName: "Devin",
} as const;

class DevinAcpProbeError extends Data.TaggedError("DevinAcpProbeError")<{
  readonly message: string;
}> {}

function parseDevinVersionLine(output: string): string | undefined {
  const match = output.trim().match(/^devin\s+([\w.\-+]+)/);
  return match?.[1];
}

export interface DevinProviderSnapshot {
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly version: string | undefined;
}

const probeDevinProvider = Effect.fn("probeDevinProvider")(function* (input: {
  readonly binaryPath: string;
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
}): Effect.fn.Return<
  DevinProviderSnapshot,
  DevinAcpProbeError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make(input.binaryPath || "devin", ["acp"], {
    cwd: input.cwd,
    env: input.environment ?? process.env,
    shell: process.platform === "win32",
  });
  const handle = yield* spawner.spawn(command).pipe(
    Effect.mapError(
      (e) =>
        new DevinAcpProbeError({
          message:
            typeof e === "object" &&
            e !== null &&
            "message" in e &&
            typeof (e as { message: unknown }).message === "string"
              ? `Failed to spawn devin acp: ${(e as { message: string }).message}`
              : `Failed to spawn devin acp: ${String(e)}`,
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
            new DevinAcpProbeError({
              message: `ACP initialize transport failed: ${String((e as { message?: string }).message ?? e)}`,
            }),
        ),
      );

    const initialized = yield* decodeDevinInitializeResponse(rawInit).pipe(
      Effect.mapError(
        (e) =>
          new DevinAcpProbeError({
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
            new DevinAcpProbeError({
              message: `ACP session/new transport failed: ${String((e as { message?: string }).message ?? e)}`,
            }),
        ),
      );

    const session = yield* decodeDevinNewSessionResponse(rawSession).pipe(
      Effect.mapError(
        (e) =>
          new DevinAcpProbeError({
            message: `ACP session/new response decode failed: ${e.message}`,
          }),
      ),
    );

    const availableModels = session.models?.availableModels ?? [];
    const models: ServerProviderModel[] = availableModels.map((m) => ({
      slug: m.modelId,
      name: m.name ?? m.modelId,
      isCustom: false,
      capabilities: null,
    }));

    // Devin ACP hardcodes agentInfo.version to "0.0.0-dev".
    // Fall back to `devin version` via a short-lived subprocess for the real version.
    let version = initialized.agentInfo?.version ?? undefined;
    if (!version || version === "0.0.0-dev") {
      version = yield* Effect.gen(function* () {
        const child = yield* spawner.spawn(
          ChildProcess.make(input.binaryPath || "devin", ["version"], {
            cwd: input.cwd,
            env: input.environment ?? process.env,
            shell: process.platform === "win32",
          }),
        );
        const [stdout] = yield* Effect.all(
          [
            collectUint8StreamText({
              stream: child.stdout,
              maxBytes: 4096,
              truncatedMarker: "",
            }),
            collectUint8StreamText({
              stream: child.stderr,
              maxBytes: 1024,
              truncatedMarker: "",
            }),
            child.exitCode,
          ],
          { concurrency: "unbounded" },
        );
        return parseDevinVersionLine(stdout.text);
      }).pipe(
        Effect.scoped,
        Effect.timeout(5_000),
        Effect.orElseSucceed(() => undefined),
      );
    }

    return { models, version };
  }).pipe(Effect.provide(acpLayer));
});

export const makePendingDevinProvider = (
  devinSettings: DevinSettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);

    if (!devinSettings.enabled) {
      return buildServerProvider({
        presentation: DEVIN_PRESENTATION,
        enabled: false,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Devin is disabled in Trifecta settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: DEVIN_PRESENTATION,
      enabled: true,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Devin provider status has not been checked in this session yet.",
      },
    });
  });

export const checkDevinProviderStatus = Effect.fn("checkDevinProviderStatus")(function* (
  devinSettings: DevinSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ServerProviderDraft,
  ServerSettingsError,
  ChildProcessSpawner.ChildProcessSpawner
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);

  if (!devinSettings.enabled) {
    return buildServerProvider({
      presentation: DEVIN_PRESENTATION,
      enabled: false,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Devin is disabled in Trifecta settings.",
      },
    });
  }

  const probeResult = yield* probeDevinProvider({
    binaryPath: devinSettings.binaryPath,
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
      presentation: DEVIN_PRESENTATION,
      enabled: devinSettings.enabled,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: installed
          ? `Devin ACP probe failed: ${error.message}.`
          : "Devin CLI (`devin`) is not installed or not on PATH.",
      },
    });
  }

  if (Option.isNone(probeResult.success)) {
    return buildServerProvider({
      presentation: DEVIN_PRESENTATION,
      enabled: devinSettings.enabled,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Timed out while checking Devin ACP provider status.",
      },
    });
  }

  const snapshot = probeResult.success.value;

  return buildServerProvider({
    presentation: DEVIN_PRESENTATION,
    enabled: devinSettings.enabled,
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
