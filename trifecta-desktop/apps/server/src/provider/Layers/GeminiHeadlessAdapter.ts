/**
 * GeminiHeadlessAdapter — Gemini CLI via `-p` (headless) instead of ACP stdio.
 *
 * Each Trifecta thread starts with a **stable Gemini CLI session UUID**:
 * the first successful headless spawn uses `--session-id <uuid>`. Gemini CLI
 * 0.41.x documents headless continuation as `--resume latest` or a numeric
 * session-list index (not UUID), so later turns resolve the stored UUID from
 * `gemini --list-sessions` and use `--resume <index>`.
 *
 * The turn workload is still forked so `interruptTurn` can target the fiber,
 * but `sendTurn` **joins** that fiber before returning so `cliSessionReady` is
 * updated before another message can run (otherwise a fast follow-up could
 * still use `--session-id` and break the CLI session).
 *
 * Spawns use `stdin: "ignore"` so the CLI never blocks on an unused stdin pipe.
 * Transient transport failures while waiting for the child (`Connection stalled`,
 * rate limits, etc.) retry a few times with backoff before surfacing a runtime error.
 *
 * @module provider/Layers/GeminiHeadlessAdapter
 */
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Predicate from "effect/Predicate";
import * as Queue from "effect/Queue";
import * as Random from "effect/Random";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeItemId,
  RuntimeRequestId,
  TurnId as TurnIdSchema,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ThreadId,
  type TurnId,
} from "@belweave/contracts";

import {
  type ProviderAdapterError,
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import { collectUint8StreamText } from "../../stream/collectUint8StreamText.ts";

const DRIVER_KIND = ProviderDriverKind.make("gemini");
const GEMINI_HEADLESS_TURN_TIMEOUT_MS = 10 * 60_000;
const MAX_HEADLESS_IO_BYTES = 16 * 1024 * 1024;
/** Gemini CLI / transport flakes (see google-gemini/gemini-cli issues around stalls and hung fetches). */
const GEMINI_HEADLESS_TRANSIENT_DETAIL =
  /connection stalled|econnreset|etimedout|enotfound|network|socket|fetch failed|^fetch\b|429|503|502|504|quota|capacity|rate limit|resource_exhausted|overloaded|temporarily unavailable|unavailable/i;

/** Exported for unit tests — used by `Effect.retry` `while` in headless turns. */
export function isRetriableGeminiHeadlessRequestFailure(error: unknown): boolean {
  if (!Predicate.isTagged(error, "ProviderAdapterRequestError")) return false;
  const e = error as ProviderAdapterRequestError;
  return GEMINI_HEADLESS_TRANSIENT_DETAIL.test(`${e.detail}\n${e.message}`);
}

/** Persisted on `ProviderSession.resumeCursor` / `ProviderTurnStartResult.resumeCursor`. */
const GEMINI_HEADLESS_RESUME_CURSOR_V = 1 as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function parseGeminiHeadlessResume(
  input: unknown,
): { sessionId: string; ready: boolean } | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const sidRaw = (input as { geminiHeadlessSessionId?: unknown }).geminiHeadlessSessionId;
  if (typeof sidRaw !== "string" || !looksLikeUuid(sidRaw)) return undefined;
  const ready = (input as { geminiHeadlessReady?: unknown }).geminiHeadlessReady === true;
  return { sessionId: sidRaw.trim(), ready };
}

function geminiHeadlessResumeCursor(
  sessionId: string,
  ready: boolean,
): {
  readonly v: typeof GEMINI_HEADLESS_RESUME_CURSOR_V;
  readonly geminiHeadlessSessionId: string;
  readonly geminiHeadlessReady: boolean;
} {
  return {
    v: GEMINI_HEADLESS_RESUME_CURSOR_V,
    geminiHeadlessSessionId: sessionId,
    geminiHeadlessReady: ready,
  };
}

interface GeminiHeadlessSession {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  cwd: string;
  /** Model slug for `-m` after first resolution. */
  lastModelId: string | undefined;
  /** Stable id for the first `gemini --session-id` invocation. */
  cliSessionId: string;
  /**
   * After the first **successful** headless run for `cliSessionId`, use
   * `--resume <index>` and persist `geminiHeadlessReady: true` so restarts
   * resume the same transcript.
   */
  cliSessionReady: boolean;
  currentTurnId: TurnId | undefined;
  activeTurnFiber: Fiber.Fiber<void, never> | undefined;
  assistantTextChunksThisTurn: number;
  stopped: boolean;
}

const makeEventId = Effect.gen(function* () {
  const ms = yield* Clock.currentTimeMillis;
  const uuid = yield* Random.nextUUIDv4;
  return EventId.make(`gemhl-${ms}-${uuid.slice(0, 8)}`);
});

const makeIsoNow = Effect.map(DateTime.now, DateTime.formatIso);

const makeEventBase = Effect.fn("makeGeminiHeadlessEventBase")(function* (
  session: Pick<GeminiHeadlessSession, "threadId" | "providerInstanceId">,
  turnId?: TurnId,
  itemId?: string,
  requestId?: string,
): Effect.fn.Return<Omit<ProviderRuntimeEvent, "type" | "payload">> {
  const eventId = yield* makeEventId;
  const createdAt = yield* makeIsoNow;
  return {
    eventId,
    provider: DRIVER_KIND,
    providerInstanceId: session.providerInstanceId,
    threadId: session.threadId,
    createdAt,
    ...(turnId ? { turnId } : {}),
    ...(itemId ? { itemId: RuntimeItemId.make(itemId) } : {}),
    ...(requestId ? { requestId: RuntimeRequestId.make(requestId) } : {}),
  };
});

function buildPromptText(input: ProviderSendTurnInput): string {
  const base = input.input?.trim() ?? "";
  if (input.attachments?.length) {
    const note =
      "\n\n[Note: Trifecta attached files in this turn; Gemini headless mode does not pass binary attachments yet — only this text was sent.]";
    return base ? `${base}${note}` : note.trim();
  }
  return base;
}

function escapeRegExp(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/** Exported for unit tests — Gemini CLI lists resumable sessions as `N. title [uuid]`. */
export function parseGeminiSessionResumeIndex(
  listOutput: string,
  sessionId: string,
): string | undefined {
  const sessionIdPattern = escapeRegExp(sessionId.trim());
  const linePattern = new RegExp(`^\\s*(\\d+)\\.\\s+.*\\[${sessionIdPattern}\\]\\s*$`, "im");
  const match = linePattern.exec(listOutput);
  return match?.[1];
}

export interface GeminiHeadlessAdapterInput {
  readonly geminiCli: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly instanceId: ProviderInstanceId;
}

export const makeGeminiHeadlessAdapter = Effect.fn("makeGeminiHeadlessAdapter")(function* (
  input: GeminiHeadlessAdapterInput,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const directory = yield* ProviderSessionDirectory;
  const runtimeEventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();
  const sessions = new Map<ThreadId, GeminiHeadlessSession>();

  const requireSession = Effect.fn("geminiHeadless.requireSession")(function* (threadId: ThreadId) {
    const session = sessions.get(threadId);
    if (!session || session.stopped) {
      return yield* new ProviderAdapterSessionNotFoundError({
        provider: DRIVER_KIND,
        threadId,
      });
    }
    return session;
  });

  const stopSessionInternal = Effect.fn("geminiHeadless.stopSessionInternal")(function* (
    session: GeminiHeadlessSession,
  ) {
    if (session.stopped) return;
    session.stopped = true;
    sessions.delete(session.threadId);
    if (session.activeTurnFiber) {
      yield* Fiber.interrupt(session.activeTurnFiber).pipe(Effect.ignoreCause);
      session.activeTurnFiber = undefined;
    }
    const base = yield* makeEventBase(session);
    yield* Queue.offer(runtimeEventQueue, {
      ...base,
      type: "session.exited",
      payload: { reason: "Session stopped" },
    }).pipe(Effect.ignore);
  });

  const startSession: ProviderAdapterShape<ProviderAdapterError>["startSession"] = (sessionInput) =>
    Effect.gen(function* () {
      if (sessionInput.provider !== undefined && sessionInput.provider !== DRIVER_KIND) {
        return yield* new ProviderAdapterValidationError({
          provider: DRIVER_KIND,
          operation: "startSession",
          issue: `Expected provider '${DRIVER_KIND}' but received '${sessionInput.provider}'.`,
        });
      }

      const existing = sessions.get(sessionInput.threadId);
      if (existing && !existing.stopped) {
        yield* Effect.suspend(() => stopSessionInternal(existing));
      }

      const persisted = parseGeminiHeadlessResume(sessionInput.resumeCursor);
      const cliSessionId = persisted ? persisted.sessionId : yield* Random.nextUUIDv4;
      const cliSessionReady = persisted?.ready ?? false;

      const session: GeminiHeadlessSession = {
        threadId: sessionInput.threadId,
        providerInstanceId: input.instanceId,
        cwd: sessionInput.cwd ?? process.cwd(),
        lastModelId: sessionInput.modelSelection?.model,
        cliSessionId,
        cliSessionReady,
        currentTurnId: undefined,
        activeTurnFiber: undefined,
        assistantTextChunksThisTurn: 0,
        stopped: false,
      };
      sessions.set(sessionInput.threadId, session);

      const startedBase = yield* makeEventBase(session);
      yield* Queue.offer(runtimeEventQueue, {
        ...startedBase,
        type: "session.started",
        payload: {},
      });

      const now = yield* makeIsoNow;
      return {
        provider: DRIVER_KIND,
        providerInstanceId: input.instanceId,
        status: "ready" as const,
        runtimeMode: sessionInput.runtimeMode ?? "full-access",
        threadId: sessionInput.threadId,
        createdAt: now,
        updatedAt: now,
        resumeCursor: geminiHeadlessResumeCursor(cliSessionId, cliSessionReady),
      } satisfies ProviderSession;
    });

  const sendTurn: ProviderAdapterShape<ProviderAdapterError>["sendTurn"] = Effect.fn(
    "geminiHeadless.sendTurn",
  )(function* (turnInput: ProviderSendTurnInput) {
    const session = yield* requireSession(turnInput.threadId);
    const ms = yield* Clock.currentTimeMillis;
    const uuid = yield* Random.nextUUIDv4;
    const turnId = TurnIdSchema.make(`gemhl-turn-${ms}-${uuid.slice(0, 8)}`);
    session.currentTurnId = turnId;
    session.assistantTextChunksThisTurn = 0;

    const modelId = turnInput.modelSelection?.model ?? session.lastModelId;
    if (!modelId?.trim()) {
      return yield* new ProviderAdapterValidationError({
        provider: DRIVER_KIND,
        operation: "sendTurn",
        issue:
          "No model selected for Gemini headless mode. Pick a model in the thread (or set a default) before sending.",
      });
    }
    session.lastModelId = modelId.trim();

    const promptText = buildPromptText(turnInput);
    if (!promptText) {
      return yield* new ProviderAdapterValidationError({
        provider: DRIVER_KIND,
        operation: "sendTurn",
        issue: "Empty prompt.",
      });
    }

    const startedBase = yield* makeEventBase(session, turnId);
    yield* Queue.offer(runtimeEventQueue, {
      ...startedBase,
      type: "turn.started",
      payload: {},
    });

    const geminiCli = input.geminiCli;
    const cwd = session.cwd;
    const env = input.environment;

    const turnEffect = Effect.gen(function* () {
      const resolveExistingSessionIndex = Effect.gen(function* () {
        const child = yield* spawner
          .spawn(
            ChildProcess.make(geminiCli, ["--list-sessions"], {
              cwd,
              env,
              shell: process.platform === "win32",
              stdin: "ignore",
            }),
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: DRIVER_KIND,
                  threadId: session.threadId,
                  detail: `Failed to list Gemini sessions with ${geminiCli}: ${cause.message}`,
                  cause,
                }),
            ),
          );

        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            collectUint8StreamText({
              stream: child.stdout,
              maxBytes: MAX_HEADLESS_IO_BYTES,
              truncatedMarker: "\n\n[stdout truncated]",
            }),
            collectUint8StreamText({
              stream: child.stderr,
              maxBytes: MAX_HEADLESS_IO_BYTES,
              truncatedMarker: "\n\n[stderr truncated]",
            }),
            child.exitCode,
          ],
          { concurrency: "unbounded" },
        );

        if (exitCode !== 0) return undefined;
        return parseGeminiSessionResumeIndex(
          `${stdout.text}\n${stderr.text}`,
          session.cliSessionId,
        );
      }).pipe(Effect.orElseSucceed(() => undefined));

      const runHeadlessCli = Effect.gen(function* () {
        const args: string[] = [];
        const existingSessionIndex = yield* resolveExistingSessionIndex;
        if (existingSessionIndex) {
          args.push("--resume", existingSessionIndex);
          session.cliSessionReady = true;
        } else if (session.cliSessionReady) {
          args.push("--resume", "latest");
        } else {
          args.push("--session-id", session.cliSessionId);
        }
        args.push("-m", modelId.trim(), "-o", "text", "-p", promptText);

        const child = yield* spawner
          .spawn(
            ChildProcess.make(geminiCli, args, {
              cwd,
              env,
              shell: process.platform === "win32",
              stdin: "ignore",
            }),
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: DRIVER_KIND,
                  threadId: session.threadId,
                  detail: `Failed to spawn ${geminiCli}: ${cause.message}`,
                  cause,
                }),
            ),
          );

        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            collectUint8StreamText({
              stream: child.stdout,
              maxBytes: MAX_HEADLESS_IO_BYTES,
              truncatedMarker: "\n\n[stdout truncated]",
            }),
            collectUint8StreamText({
              stream: child.stderr,
              maxBytes: MAX_HEADLESS_IO_BYTES,
              truncatedMarker: "\n\n[stderr truncated]",
            }),
            child.exitCode,
          ],
          { concurrency: "unbounded" },
        ).pipe(
          Effect.mapError(
            (cause) =>
              new ProviderAdapterRequestError({
                provider: DRIVER_KIND,
                method: "gemini/headless",
                detail: cause instanceof Error ? cause.message : String(cause),
                cause: cause instanceof Error ? cause : new Error(String(cause)),
              }),
          ),
        );

        if (exitCode !== 0) {
          const detail = stderr.text.trim() || stdout.text.trim() || `exit code ${exitCode}`;
          if (GEMINI_HEADLESS_TRANSIENT_DETAIL.test(detail)) {
            return yield* new ProviderAdapterRequestError({
              provider: DRIVER_KIND,
              method: "gemini/headless",
              detail: `Gemini headless exited with status ${exitCode} (transient): ${detail}`,
            });
          }
          return yield* new ProviderAdapterProcessError({
            provider: DRIVER_KIND,
            threadId: session.threadId,
            detail: `Gemini headless exited with status ${exitCode}: ${detail}`,
          });
        }

        return { stdout, stderr };
      });

      const { stdout, stderr } = yield* runHeadlessCli.pipe(
        Effect.retry({
          times: 3,
          schedule: Schedule.exponential("1 second", 2),
          while: isRetriableGeminiHeadlessRequestFailure,
        }),
      );

      const text = stdout.text.trimEnd();
      if (text.length > 0) {
        session.assistantTextChunksThisTurn += 1;
        const base = yield* makeEventBase(session, turnId);
        yield* Queue.offer(runtimeEventQueue, {
          ...base,
          type: "content.delta",
          payload: { streamKind: "assistant_text", delta: text },
        });
      } else {
        const base = yield* makeEventBase(session, turnId);
        yield* Queue.offer(runtimeEventQueue, {
          ...base,
          type: "content.delta",
          payload: {
            streamKind: "assistant_text",
            delta:
              "Gemini returned no stdout for this headless run. Check stderr in the server logs or run the same command in a terminal.",
          },
        });
      }

      if (!session.cliSessionReady) {
        session.cliSessionReady = true;
        yield* directory
          .upsert({
            threadId: session.threadId,
            provider: DRIVER_KIND,
            providerInstanceId: session.providerInstanceId,
            resumeCursor: geminiHeadlessResumeCursor(session.cliSessionId, true),
          })
          .pipe(Effect.ignore);
      }

      const completedBase = yield* makeEventBase(session, turnId);
      yield* Queue.offer(runtimeEventQueue, {
        ...completedBase,
        type: "turn.completed",
        payload: { state: "completed" as const },
      });
    }).pipe(
      Effect.scoped,
      Effect.timeout(GEMINI_HEADLESS_TURN_TIMEOUT_MS),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.gen(function* () {
              const doneBase = yield* makeEventBase(session, turnId);
              yield* Queue.offer(runtimeEventQueue, {
                ...doneBase,
                type: "turn.completed",
                payload: { state: "interrupted" as const },
              });
            })
          : Effect.gen(function* () {
              const squashed = Cause.squash(cause);
              const timedOut = Cause.isTimeoutError(squashed);
              const message = timedOut
                ? `Gemini headless timed out after ${GEMINI_HEADLESS_TURN_TIMEOUT_MS / 1000}s.`
                : squashed instanceof Error
                  ? squashed.message
                  : typeof squashed === "object" &&
                      squashed !== null &&
                      "message" in squashed &&
                      typeof (squashed as { message: unknown }).message === "string"
                    ? (squashed as { message: string }).message
                    : `Gemini headless failed: ${String(squashed)}`;
              const base = yield* makeEventBase(session, turnId);
              yield* Queue.offer(runtimeEventQueue, {
                ...base,
                type: "runtime.error",
                payload: {
                  message,
                  class: "provider_error" as const,
                },
              });
              const doneBase = yield* makeEventBase(session, turnId);
              yield* Queue.offer(runtimeEventQueue, {
                ...doneBase,
                type: "turn.completed",
                payload: { state: "completed" as const },
              });
            }),
      ),
      Effect.forkDetach({ startImmediately: true }),
    );

    const turnFiber = yield* turnEffect;
    session.activeTurnFiber = turnFiber as Fiber.Fiber<void, never>;
    yield* Fiber.join(turnFiber).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          session.activeTurnFiber = undefined;
        }),
      ),
    );

    return { threadId: turnInput.threadId, turnId };
  });

  const interruptTurn: ProviderAdapterShape<ProviderAdapterError>["interruptTurn"] = (
    threadId,
    _turnId,
  ) =>
    requireSession(threadId).pipe(
      Effect.flatMap((session) =>
        Effect.gen(function* () {
          if (session.activeTurnFiber) {
            yield* Fiber.interrupt(session.activeTurnFiber).pipe(Effect.ignoreCause);
            session.activeTurnFiber = undefined;
          }
        }),
      ),
      Effect.mapError((cause) =>
        cause._tag === "ProviderAdapterSessionNotFoundError"
          ? cause
          : new ProviderAdapterRequestError({
              provider: DRIVER_KIND,
              method: "interrupt",
              detail: cause.message,
              cause,
            }),
      ),
    );

  const respondToRequest: ProviderAdapterShape<ProviderAdapterError>["respondToRequest"] = () =>
    Effect.void;

  const respondToUserInput: ProviderAdapterShape<ProviderAdapterError>["respondToUserInput"] = () =>
    Effect.void;

  const stopSession: ProviderAdapterShape<ProviderAdapterError>["stopSession"] = (threadId) =>
    Effect.gen(function* () {
      const session = sessions.get(threadId);
      if (!session) return;
      yield* stopSessionInternal(session);
    });

  const listSessions: ProviderAdapterShape<ProviderAdapterError>["listSessions"] = () =>
    Effect.gen(function* () {
      const now = yield* makeIsoNow;
      return Array.from(sessions.values())
        .filter((s) => !s.stopped)
        .map(
          (s) =>
            ({
              provider: DRIVER_KIND,
              providerInstanceId: s.providerInstanceId,
              status: "ready" as const,
              runtimeMode: "full-access" as const,
              threadId: s.threadId,
              ...(s.currentTurnId ? { activeTurnId: s.currentTurnId } : {}),
              createdAt: now,
              updatedAt: now,
            }) satisfies ProviderSession,
        );
    });

  const hasSession: ProviderAdapterShape<ProviderAdapterError>["hasSession"] = (threadId) =>
    Effect.succeed(Boolean(sessions.get(threadId) && !sessions.get(threadId)?.stopped));

  const readThread: ProviderAdapterShape<ProviderAdapterError>["readThread"] = (threadId) =>
    requireSession(threadId).pipe(
      Effect.map((s) => ({ threadId: s.threadId, turns: [] }) satisfies ProviderThreadSnapshot),
      Effect.mapError((cause) =>
        cause._tag === "ProviderAdapterSessionNotFoundError"
          ? cause
          : new ProviderAdapterRequestError({
              provider: DRIVER_KIND,
              method: "readThread",
              detail: cause.message,
              cause,
            }),
      ),
    );

  const rollbackThread: ProviderAdapterShape<ProviderAdapterError>["rollbackThread"] = (
    threadId,
    _numTurns,
  ) => readThread(threadId);

  const stopAll: ProviderAdapterShape<ProviderAdapterError>["stopAll"] = () =>
    Effect.forEach(Array.from(sessions.values()), stopSessionInternal, {
      concurrency: 1,
      discard: true,
    }).pipe(Effect.asVoid);

  yield* Effect.acquireRelease(Effect.void, () =>
    stopAll().pipe(Effect.andThen(Queue.shutdown(runtimeEventQueue)), Effect.ignore),
  );

  return {
    provider: DRIVER_KIND,
    capabilities: {
      sessionModelSwitch: "in-session",
    },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    hasSession,
    readThread,
    rollbackThread,
    stopAll,
    get streamEvents() {
      return Stream.fromQueue(runtimeEventQueue);
    },
  } satisfies ProviderAdapterShape<ProviderAdapterError>;
});
