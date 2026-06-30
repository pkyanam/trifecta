/**
 * DevinAcpSupport — wires the Devin CLI (`devin acp`) onto the shared
 * {@link AcpSessionRuntime}.
 *
 * Devin is a standard ACP agent. Unlike Cursor/Grok it does not require an
 * explicit `authenticate` step (its ACP server accepts host/env/stored CLI
 * credentials), so we omit `authMethodId` and let the runtime skip auth.
 *
 * Devin advertises its model list and session modes through `configOptions`
 * (`category: "model"` / `category: "mode"`) and a `modes` block, both of which
 * the shared runtime already understands.
 *
 * @module provider/acp/DevinAcpSupport
 */
import {
  type DevinSettings,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@belweave/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import { ChildProcessSpawner } from "effect/unstable/process";
import type * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  AcpSessionRuntime,
  type AcpSessionRuntimeOptions,
  type AcpSessionRuntimeShape,
  type AcpSpawnInput,
} from "./AcpSessionRuntime.ts";
import { findSessionConfigOption } from "./AcpRuntimeModel.ts";

/** Devin session mode ids advertised over ACP (see `devin acp` `session/new`). */
export const DEVIN_MODE_CODE = "accept-edits";
export const DEVIN_MODE_ASK = "ask";
export const DEVIN_MODE_PLAN = "plan";
export const DEVIN_MODE_BYPASS = "bypass";

type DevinAcpRuntimeDevinSettings = Pick<DevinSettings, "binaryPath">;

export interface DevinAcpRuntimeInput extends Omit<
  AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly devinSettings: DevinAcpRuntimeDevinSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildDevinAcpSpawnInput(
  devinSettings: DevinAcpRuntimeDevinSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSpawnInput {
  return {
    command: devinSettings?.binaryPath || "devin",
    args: ["acp"],
    cwd,
    ...(environment ? { env: environment } : {}),
  };
}

export const makeDevinAcpRuntime = (
  input: DevinAcpRuntimeInput,
): Effect.Effect<AcpSessionRuntimeShape, EffectAcpErrors.AcpError, Scope.Scope> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildDevinAcpSpawnInput(input.devinSettings, input.cwd, input.environment),
        // No authMethodId: Devin relies on stored CLI credentials / env vars.
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime).pipe(Effect.provide(acpContext));
  });

/**
 * Resolve the Devin ACP session mode that best matches Trifecta's runtime /
 * interaction mode, returning `undefined` when Devin's default mode should be
 * left in place (the adapter then routes Devin's permission requests to the UI).
 *
 * - Plan interaction → `plan`
 * - Full access → `bypass` (auto-approve all tool calls)
 * - Otherwise → `undefined` (keep Devin's default `accept-edits` and prompt)
 *
 * The resolved mode is only returned when it is actually advertised by the
 * running agent.
 */
export function resolveDevinSessionModeId(input: {
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode | undefined;
  readonly availableModeIds: ReadonlyArray<string>;
}): string | undefined {
  const available = new Set(input.availableModeIds);
  const pick = (modeId: string): string | undefined => (available.has(modeId) ? modeId : undefined);

  if (input.interactionMode === "plan") {
    return pick(DEVIN_MODE_PLAN);
  }
  if (input.runtimeMode === "full-access") {
    return pick(DEVIN_MODE_BYPASS);
  }
  return undefined;
}

/** Extract the currently-selected Devin model slug from a session setup result. */
export function currentDevinModelIdFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): string | undefined {
  const fromModels = sessionSetupResult.models?.currentModelId?.trim();
  if (fromModels) {
    return fromModels;
  }
  const modelOption = findSessionConfigOption(sessionSetupResult.configOptions, "model");
  if (modelOption && typeof modelOption.currentValue === "string") {
    return modelOption.currentValue.trim() || undefined;
  }
  return undefined;
}
