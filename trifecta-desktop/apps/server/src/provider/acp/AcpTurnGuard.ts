/**
 * AcpTurnGuard — shared turn-lifecycle safeguards for ACP adapters.
 *
 * ACP turns are driven by a blocking `session/prompt` JSON-RPC request that
 * only resolves when the agent responds. If the agent's harness wedges while
 * its subprocess stays alive, the request never resolves — the UI is stuck
 * "Working" and a soft `session/cancel` may be ignored. This module bounds
 * that with a per-turn watchdog and a forceful soft-cancel-then-teardown
 * interrupt path, shared across all ACP adapters built on
 * {@link AcpSessionRuntimeShape} (Devin, Cursor, Grok, …) to avoid duplication.
 *
 * - `idleTimeoutMs`: force-end a turn after this long with no streamed
 *   activity (and no pending approval/user-input). Auto-recovers stalled
 *   turns without user action.
 * - `interruptGraceMs`: after the stop button sends a soft `session/cancel`,
 *   wait this long for the agent to honour it before force-terminating the
 *   session.
 * - `watchdogTickMs`: how often the per-turn watchdog re-evaluates the above.
 *
 * @module provider/acp/AcpTurnGuard
 */
import {
  type EventId,
  type ProviderDriverKind,
  type ProviderRuntimeEvent,
  type ThreadId,
  type TurnId,
} from "@belweave/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import type { ProviderAdapterError } from "../Errors.ts";
import type { AcpSessionRuntimeShape } from "./AcpSessionRuntime.ts";

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_INTERRUPT_GRACE_MS = 4_000;
const DEFAULT_WATCHDOG_TICK_MS = 5_000;

export interface AcpTurnGuardOptions {
  readonly idleTimeoutMs?: number;
  readonly interruptGraceMs?: number;
  readonly watchdogTickMs?: number;
}

/** Mutable control state for the in-flight turn, read by the turn watchdog. */
export interface AcpActiveTurn {
  readonly turnId: TurnId;
  /** Epoch ms of the last sign of life (streamed event) for this turn. */
  lastActivityAt: number;
  /** Epoch ms the user requested an interrupt, or undefined if not requested. */
  interruptRequestedAt: number | undefined;
}

/** Result of {@link runAcpWatchedPrompt}. */
export type AcpWatchedPromptResult =
  | { readonly kind: "natural"; readonly response: EffectAcpSchema.PromptResponse }
  | { readonly kind: "forceEnded" };

/** Internal race outcome shared by the prompt and watchdog branches. */
type AcpPromptRaceOutcome =
  | { readonly kind: "natural"; readonly response: EffectAcpSchema.PromptResponse }
  | { readonly kind: "interrupted" }
  | { readonly kind: "timeout" };

/**
 * Dependencies the guard needs from the host adapter. Each callback is a
 * thin closure over adapter-local state (session context, event emitters,
 * teardown), so the guard itself stays stateless and adapter-agnostic.
 */
export interface AcpTurnGuardDeps {
  readonly provider: ProviderDriverKind;
  readonly threadId: ThreadId;
  readonly turnId: TurnId;
  readonly acp: AcpSessionRuntimeShape;
  readonly activeTurn: AcpActiveTurn;
  /**
   * True while a pending approval or structured user-input request
   * legitimately pauses streamed activity (the idle watchdog treats the
   * turn as alive while paused).
   */
  readonly isPaused: () => boolean;
  readonly options: AcpTurnGuardOptions;
  /** Publish a runtime event onto the adapter's event stream. */
  readonly offerRuntimeEvent: (event: ProviderRuntimeEvent) => Effect.Effect<void>;
  /** Build a fresh `{ eventId, createdAt }` stamp for a runtime event. */
  readonly makeEventStamp: () => Effect.Effect<{
    readonly eventId: EventId;
    readonly createdAt: string;
  }>;
  /**
   * Tear down the session after a forced end (stop the subprocess, emit
   * `session.exited`, remove from the session map).
   */
  readonly stopSession: (exit: {
    readonly reason: string;
    readonly recoverable: boolean;
  }) => Effect.Effect<void>;
  /** Map an ACP `session/prompt` error to the adapter's error type. */
  readonly mapPromptError: (cause: EffectAcpErrors.AcpError) => ProviderAdapterError;
}

/**
 * Request a soft interrupt: send `session/cancel` (best effort) and record
 * the interrupt timestamp so the per-turn watchdog can force-terminate the
 * session if the agent doesn't honour it within the grace window.
 */
export const acpRequestInterrupt = (
  deps: AcpTurnGuardDeps,
): Effect.Effect<void, ProviderAdapterError> =>
  Effect.gen(function* () {
    yield* Effect.ignore(deps.acp.cancel.pipe(Effect.mapError(deps.mapPromptError)));
    if (deps.activeTurn.interruptRequestedAt === undefined) {
      deps.activeTurn.interruptRequestedAt = yield* Clock.currentTimeMillis;
    }
  });

/**
 * Race the blocking `session/prompt` against a per-turn watchdog. The
 * watchdog wins if (a) the user interrupted and the agent didn't honour the
 * soft `session/cancel` within the grace window, or (b) the turn went idle
 * past the timeout. The losing branch is interrupted — a watchdog win
 * abandons the in-flight prompt request (the protocol layer cleans up).
 *
 * On a natural completion the prompt response is returned for the caller to
 * project. On a forced end the guard emits the terminating `turn.completed`
 * (and, for timeouts, a diagnostic `runtime.error` using the agent stderr
 * tail) and tears the session down, then returns `{ kind: "forceEnded" }` so
 * the caller knows not to emit a duplicate `turn.completed`.
 */
export const runAcpWatchedPrompt = (
  deps: AcpTurnGuardDeps,
  promptParts: ReadonlyArray<EffectAcpSchema.ContentBlock>,
): Effect.Effect<AcpWatchedPromptResult, ProviderAdapterError> =>
  Effect.gen(function* () {
    const idleTimeoutMs = Math.max(1, deps.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS);
    const interruptGraceMs = Math.max(
      0,
      deps.options.interruptGraceMs ?? DEFAULT_INTERRUPT_GRACE_MS,
    );
    const watchdogTickMs = Math.max(1, deps.options.watchdogTickMs ?? DEFAULT_WATCHDOG_TICK_MS);

    const promptBranch = deps.acp.prompt({ prompt: promptParts }).pipe(
      Effect.mapError(deps.mapPromptError),
      Effect.map((response): AcpPromptRaceOutcome => ({ kind: "natural", response })),
    );

    // Poll frequently enough that a user interrupt is honored within roughly
    // the grace window, independent of the (coarser) idle tick. Without this a
    // large `watchdogTickMs` would add its full duration as stop-button
    // latency on top of the grace window.
    const pollMs = Math.min(watchdogTickMs, 250);

    const watchdogBranch = Effect.gen(function* () {
      while (true) {
        yield* Effect.sleep(Duration.millis(pollMs));
        const now = yield* Clock.currentTimeMillis;
        // An explicit interrupt is honored even while paused: the user pressed
        // stop, so we force-end after the grace window regardless of a pending
        // approval/user-input (those are settled as cancelled by the adapter's
        // interrupt path). Checking this BEFORE the pause gate ensures a stuck
        // approval can never starve the stop request.
        if (
          deps.activeTurn.interruptRequestedAt !== undefined &&
          now - deps.activeTurn.interruptRequestedAt >= interruptGraceMs
        ) {
          return { kind: "interrupted" } satisfies AcpPromptRaceOutcome;
        }
        // A pending approval/user-input legitimately pauses streamed activity,
        // so treat the turn as alive (for the idle timeout) while we wait on
        // the user.
        if (deps.isPaused()) {
          deps.activeTurn.lastActivityAt = now;
          continue;
        }
        if (now - deps.activeTurn.lastActivityAt >= idleTimeoutMs) {
          return { kind: "timeout" } satisfies AcpPromptRaceOutcome;
        }
      }
    });

    const outcome = yield* Effect.raceFirst(promptBranch, watchdogBranch);

    if (outcome.kind === "natural") {
      return { kind: "natural", response: outcome.response };
    }

    // Forced end: the agent is wedged. Surface why, complete the turn, and
    // tear the session down so the thread can recover (the next message
    // resumes it).
    if (outcome.kind === "timeout") {
      const idleSeconds = Math.round(idleTimeoutMs / 1000);
      const stderrTail = (yield* deps.acp.recentStderr).trim();
      const detail = stderrTail ? ` Last agent output:\n${stderrTail}` : "";
      yield* deps.offerRuntimeEvent({
        type: "runtime.error",
        ...(yield* deps.makeEventStamp()),
        provider: deps.provider,
        threadId: deps.threadId,
        turnId: deps.turnId,
        payload: {
          message:
            `Agent produced no activity for ${idleSeconds}s, so the stalled session was stopped. ` +
            `Send a new message to resume.${detail}`,
          class: "provider_error",
        },
      });
      yield* deps.offerRuntimeEvent({
        type: "turn.completed",
        ...(yield* deps.makeEventStamp()),
        provider: deps.provider,
        threadId: deps.threadId,
        turnId: deps.turnId,
        payload: {
          state: "failed",
          stopReason: "timeout",
          errorMessage: `Agent turn timed out after ${idleSeconds}s with no activity.`,
        },
      });
      yield* deps.stopSession({
        reason: "Agent session stopped after an inactivity timeout.",
        recoverable: true,
      });
    } else {
      const graceSeconds = Math.round(interruptGraceMs / 1000);
      yield* deps.offerRuntimeEvent({
        type: "turn.completed",
        ...(yield* deps.makeEventStamp()),
        provider: deps.provider,
        threadId: deps.threadId,
        turnId: deps.turnId,
        payload: { state: "interrupted", stopReason: "interrupted" },
      });
      yield* deps.stopSession({
        reason:
          graceSeconds > 0
            ? `Agent session stopped after it did not acknowledge the interrupt within ${graceSeconds}s.`
            : "Agent session stopped after an interrupt.",
        recoverable: true,
      });
    }

    return { kind: "forceEnded" };
  });
