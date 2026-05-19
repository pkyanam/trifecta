import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { AntigravitySettings, ServerProviderModel } from "@belweave/contracts";
import { ServerSettingsError } from "@belweave/contracts";

import {
  AUTH_PROBE_TIMEOUT_MS,
  buildServerProvider,
  detailFromResult,
  isCommandMissingCause,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const ANTIGRAVITY_PRESENTATION = {
  displayName: "Antigravity",
} as const;

const ANTIGRAVITY_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "auto",
    name: "Auto",
    shortName: "Auto",
    isCustom: false,
    capabilities: null,
  },
];

const antigravityCommand = (settings: AntigravitySettings): string =>
  settings.binaryPath?.trim() || "agy";

const antigravityPythonCommand = (settings: AntigravitySettings): string =>
  settings.pythonPath?.trim() || "python3";

export const makePendingAntigravityProvider = (
  settings: AntigravitySettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);

    if (!settings.enabled) {
      return buildServerProvider({
        presentation: ANTIGRAVITY_PRESENTATION,
        enabled: false,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Antigravity is disabled in Trifecta settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: ANTIGRAVITY_PRESENTATION,
      enabled: true,
      checkedAt,
      models: ANTIGRAVITY_MODELS,
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Antigravity provider status has not been checked in this session yet.",
      },
    });
  });

export const checkAntigravityProviderStatus = Effect.fn("checkAntigravityProviderStatus")(
  function* (
    settings: AntigravitySettings,
    environment: NodeJS.ProcessEnv = process.env,
  ): Effect.fn.Return<
    ServerProviderDraft,
    ServerSettingsError,
    ChildProcessSpawner.ChildProcessSpawner
  > {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);

    if (!settings.enabled) {
      return buildServerProvider({
        presentation: ANTIGRAVITY_PRESENTATION,
        enabled: false,
        checkedAt,
        models: [],
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Antigravity is disabled in Trifecta settings.",
        },
      });
    }

    if (settings.useSdkHarness !== false) {
      const command = antigravityPythonCommand(settings);
      const result = yield* spawnAndCollect(
        command,
        ChildProcess.make(
          command,
          [
            "-c",
            "import google.antigravity; print('google-antigravity sdk available')",
          ],
          {
            cwd: process.cwd(),
            env: environment,
            shell: process.platform === "win32",
            stdin: "ignore",
          },
        ),
      ).pipe(Effect.timeoutOption(Duration.millis(AUTH_PROBE_TIMEOUT_MS)), Effect.result);

      if (Result.isFailure(result)) {
        const cause = result.failure;
        const message = isCommandMissingCause(cause)
          ? `Python not found. Install Python 3 or set the Antigravity Python path to an environment with google-antigravity installed.`
          : `Unable to run Antigravity SDK probe: ${cause.message}`;
        return buildServerProvider({
          presentation: ANTIGRAVITY_PRESENTATION,
          enabled: true,
          checkedAt,
          models: ANTIGRAVITY_MODELS,
          skills: [],
          probe: {
            installed: false,
            version: null,
            status: "error",
            auth: { status: "unknown" },
            message,
          },
        });
      }

      if (Option.isNone(result.success)) {
        return buildServerProvider({
          presentation: ANTIGRAVITY_PRESENTATION,
          enabled: true,
          checkedAt,
          models: ANTIGRAVITY_MODELS,
          skills: [],
          probe: {
            installed: true,
            version: null,
            status: "error",
            auth: { status: "unknown" },
            message: "Timed out while checking Antigravity SDK status.",
          },
        });
      }

      const probe = result.success.value;
      if (probe.code !== 0) {
        return buildServerProvider({
          presentation: ANTIGRAVITY_PRESENTATION,
          enabled: true,
          checkedAt,
          models: ANTIGRAVITY_MODELS,
          skills: [],
          probe: {
            installed: true,
            version: null,
            status: "error",
            auth: { status: "unknown" },
            message:
              detailFromResult(probe) ??
              `Antigravity SDK import probe exited with code ${probe.code}. Install it with: pip install google-antigravity`,
          },
        });
      }

      const hasApiKey = Boolean(settings.apiKey?.trim() || environment.GEMINI_API_KEY?.trim());
      if (!hasApiKey) {
        return buildServerProvider({
          presentation: ANTIGRAVITY_PRESENTATION,
          enabled: true,
          checkedAt,
          models: ANTIGRAVITY_MODELS,
          skills: [],
          probe: {
            installed: true,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message:
              "Antigravity SDK is installed, but SDK harness mode requires a Gemini API key. Add one in Antigravity settings or turn SDK harness mode off to use CLI OAuth.",
          },
        });
      }

      return buildServerProvider({
        presentation: ANTIGRAVITY_PRESENTATION,
        enabled: true,
        checkedAt,
        models: ANTIGRAVITY_MODELS,
        skills: [],
        probe: {
          installed: true,
          version: null,
          status: "ready",
          auth: { status: "unknown" },
          message:
            "Antigravity SDK is available. Trifecta will use the SDK local harness for chat turns.",
        },
      });
    }

    const command = antigravityCommand(settings);
    const result = yield* spawnAndCollect(
      command,
      ChildProcess.make(command, ["--help"], {
        cwd: process.cwd(),
        env: environment,
        shell: process.platform === "win32",
        stdin: "ignore",
      }),
    ).pipe(Effect.timeoutOption(Duration.millis(AUTH_PROBE_TIMEOUT_MS)), Effect.result);

    if (Result.isFailure(result)) {
      const cause = result.failure;
      const message = isCommandMissingCause(cause)
        ? `Antigravity CLI not found. Install Antigravity CLI or set the Antigravity CLI path to the agy executable.`
        : `Unable to run Antigravity CLI: ${cause.message}`;
      return buildServerProvider({
        presentation: ANTIGRAVITY_PRESENTATION,
        enabled: true,
        checkedAt,
        models: ANTIGRAVITY_MODELS,
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message,
        },
      });
    }

    if (Option.isNone(result.success)) {
      return buildServerProvider({
        presentation: ANTIGRAVITY_PRESENTATION,
        enabled: true,
        checkedAt,
        models: ANTIGRAVITY_MODELS,
        skills: [],
        probe: {
          installed: true,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: "Timed out while checking Antigravity provider status.",
        },
      });
    }

    const probe = result.success.value;
    if (probe.code !== 0) {
      return buildServerProvider({
        presentation: ANTIGRAVITY_PRESENTATION,
        enabled: true,
        checkedAt,
        models: ANTIGRAVITY_MODELS,
        skills: [],
        probe: {
          installed: true,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: detailFromResult(probe) ?? `Antigravity CLI exited with code ${probe.code}.`,
        },
      });
    }

    return buildServerProvider({
      presentation: ANTIGRAVITY_PRESENTATION,
      enabled: true,
      checkedAt,
      models: ANTIGRAVITY_MODELS,
      skills: [],
      probe: {
        installed: true,
        version: null,
        status: "ready",
        auth: { status: "unknown" },
        message: "Antigravity CLI is available. Trifecta will use agy print mode for chat turns.",
      },
    });
  },
);
