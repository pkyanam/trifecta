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
import { collectUint8StreamText } from "../../stream/collectUint8StreamText.ts";

const DRIVER_KIND = ProviderDriverKind.make("antigravity");
const ANTIGRAVITY_TURN_TIMEOUT_MS = 10 * 60_000;
const MAX_HEADLESS_IO_BYTES = 16 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 120_000;
const ANTIGRAVITY_TRANSIENT_DETAIL =
  /connection stalled|econnreset|etimedout|enotfound|network|socket|fetch failed|^fetch\b|429|503|502|504|quota|capacity|rate limit|resource_exhausted|overloaded|temporarily unavailable|unavailable/i;

const ANTIGRAVITY_RESUME_CURSOR_V = 1 as const;

type TranscriptMessage = {
  readonly role: "user" | "assistant";
  readonly text: string;
};

interface AntigravitySession {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  cwd: string;
  transcript: TranscriptMessage[];
  currentTurnId: TurnId | undefined;
  activeTurnFiber: Fiber.Fiber<void, never> | undefined;
  stopped: boolean;
}

export function isRetriableAntigravityRequestFailure(error: unknown): boolean {
  if (!Predicate.isTagged(error, "ProviderAdapterRequestError")) return false;
  const e = error as ProviderAdapterRequestError;
  return ANTIGRAVITY_TRANSIENT_DETAIL.test(`${e.detail}\n${e.message}`);
}

function parseAntigravityResume(input: unknown): TranscriptMessage[] {
  if (input === null || typeof input !== "object") return [];
  const raw = (input as { antigravityTranscript?: unknown }).antigravityTranscript;
  if (!Array.isArray(raw)) return [];
  const messages: TranscriptMessage[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const role = (entry as { role?: unknown }).role;
    const text = (entry as { text?: unknown }).text;
    if ((role === "user" || role === "assistant") && typeof text === "string" && text.trim()) {
      messages.push({ role, text });
    }
  }
  return trimTranscript(messages);
}

function antigravityResumeCursor(transcript: ReadonlyArray<TranscriptMessage>) {
  return {
    v: ANTIGRAVITY_RESUME_CURSOR_V,
    antigravityTranscript: trimTranscript(transcript),
  };
}

function trimTranscript(messages: ReadonlyArray<TranscriptMessage>): TranscriptMessage[] {
  const kept: TranscriptMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    const cost = message.text.length + message.role.length + 16;
    if (kept.length > 0 && used + cost > MAX_TRANSCRIPT_CHARS) break;
    kept.unshift(message);
    used += cost;
  }
  return kept;
}

function buildPromptText(input: ProviderSendTurnInput): string {
  const base = input.input?.trim() ?? "";
  if (input.attachments?.length) {
    const note =
      "\n\n[Note: Trifecta attached files in this turn; Antigravity print mode does not pass binary attachments yet. Only this text was sent.]";
    return base ? `${base}${note}` : note.trim();
  }
  return base;
}

function buildAntigravityPrompt(
  transcript: ReadonlyArray<TranscriptMessage>,
  userPrompt: string,
): string {
  if (transcript.length === 0) return userPrompt;
  const history = transcript
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}:\n${message.text}`)
    .join("\n\n");
  return [
    "Continue this Trifecta chat using the prior transcript below.",
    "Use the transcript as context. Answer only the latest user message.",
    "",
    "<transcript>",
    history,
    "</transcript>",
    "",
    "Latest user message:",
    userPrompt,
  ].join("\n");
}

const makeEventId = Effect.gen(function* () {
  const ms = yield* Clock.currentTimeMillis;
  const uuid = yield* Random.nextUUIDv4;
  return EventId.make(`agy-${ms}-${uuid.slice(0, 8)}`);
});

const makeIsoNow = Effect.map(DateTime.now, DateTime.formatIso);

const makeEventBase = Effect.fn("makeAntigravityEventBase")(function* (
  session: Pick<AntigravitySession, "threadId" | "providerInstanceId">,
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

export interface AntigravityHeadlessAdapterInput {
  readonly antigravityCli: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly instanceId: ProviderInstanceId;
}

export const makeAntigravityHeadlessAdapter = Effect.fn("makeAntigravityHeadlessAdapter")(
  function* (input: AntigravityHeadlessAdapterInput) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtimeEventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();
    const sessions = new Map<ThreadId, AntigravitySession>();

    const requireSession = Effect.fn("antigravity.requireSession")(function* (threadId: ThreadId) {
      const session = sessions.get(threadId);
      if (!session || session.stopped) {
        return yield* new ProviderAdapterSessionNotFoundError({
          provider: DRIVER_KIND,
          threadId,
        });
      }
      return session;
    });

    const stopSessionInternal = Effect.fn("antigravity.stopSessionInternal")(function* (
      session: AntigravitySession,
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

    const startSession: ProviderAdapterShape<ProviderAdapterError>["startSession"] = (
      sessionInput,
    ) =>
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

        const session: AntigravitySession = {
          threadId: sessionInput.threadId,
          providerInstanceId: input.instanceId,
          cwd: sessionInput.cwd ?? process.cwd(),
          transcript: parseAntigravityResume(sessionInput.resumeCursor),
          currentTurnId: undefined,
          activeTurnFiber: undefined,
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
          resumeCursor: antigravityResumeCursor(session.transcript),
        } satisfies ProviderSession;
      });

    const sendTurn: ProviderAdapterShape<ProviderAdapterError>["sendTurn"] = Effect.fn(
      "antigravity.sendTurn",
    )(function* (turnInput: ProviderSendTurnInput) {
      const session = yield* requireSession(turnInput.threadId);
      const ms = yield* Clock.currentTimeMillis;
      const uuid = yield* Random.nextUUIDv4;
      const turnId = TurnIdSchema.make(`agy-turn-${ms}-${uuid.slice(0, 8)}`);
      session.currentTurnId = turnId;

      const userPrompt = buildPromptText(turnInput);
      if (!userPrompt) {
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

      let assistantText = "";
      const turnEffect = Effect.gen(function* () {
        const promptText = buildAntigravityPrompt(session.transcript, userPrompt);
        const child = yield* spawner
          .spawn(
            ChildProcess.make(input.antigravityCli, ["-p", promptText], {
              cwd: session.cwd,
              env: input.environment,
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
                  detail: `Failed to spawn ${input.antigravityCli}: ${cause.message}`,
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
                method: "antigravity/headless",
                detail: cause instanceof Error ? cause.message : String(cause),
                cause: cause instanceof Error ? cause : new Error(String(cause)),
              }),
          ),
        );

        if (exitCode !== 0) {
          const detail = stderr.text.trim() || stdout.text.trim() || `exit code ${exitCode}`;
          if (ANTIGRAVITY_TRANSIENT_DETAIL.test(detail)) {
            return yield* new ProviderAdapterRequestError({
              provider: DRIVER_KIND,
              method: "antigravity/headless",
              detail: `Antigravity headless exited with status ${exitCode} (transient): ${detail}`,
            });
          }
          return yield* new ProviderAdapterProcessError({
            provider: DRIVER_KIND,
            threadId: session.threadId,
            detail: `Antigravity headless exited with status ${exitCode}: ${detail}`,
          });
        }

        assistantText = stdout.text.trimEnd();
        const base = yield* makeEventBase(session, turnId);
        yield* Queue.offer(runtimeEventQueue, {
          ...base,
          type: "content.delta",
          payload: {
            streamKind: "assistant_text",
            delta:
              assistantText.length > 0
                ? assistantText
                : "Antigravity returned no stdout for this print-mode run.",
          },
        });

        if (assistantText.length > 0) {
          session.transcript = trimTranscript([
            ...session.transcript,
            { role: "user", text: userPrompt },
            { role: "assistant", text: assistantText },
          ]);
        }

        const completedBase = yield* makeEventBase(session, turnId);
        yield* Queue.offer(runtimeEventQueue, {
          ...completedBase,
          type: "turn.completed",
          payload: { state: "completed" as const },
        });
      }).pipe(
        Effect.scoped,
        Effect.retry({
          times: 3,
          schedule: Schedule.exponential("1 second", 2),
          while: isRetriableAntigravityRequestFailure,
        }),
        Effect.timeout(ANTIGRAVITY_TURN_TIMEOUT_MS),
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
                  ? `Antigravity headless timed out after ${ANTIGRAVITY_TURN_TIMEOUT_MS / 1000}s.`
                  : squashed instanceof Error
                    ? squashed.message
                    : `Antigravity headless failed: ${String(squashed)}`;
                const base = yield* makeEventBase(session, turnId);
                yield* Queue.offer(runtimeEventQueue, {
                  ...base,
                  type: "runtime.error",
                  payload: { message, class: "provider_error" as const },
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

      return {
        threadId: turnInput.threadId,
        turnId,
        resumeCursor: antigravityResumeCursor(session.transcript),
      };
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
      capabilities: { sessionModelSwitch: "unsupported" },
      startSession,
      sendTurn,
      interruptTurn,
      respondToRequest: () => Effect.void,
      respondToUserInput: () => Effect.void,
      stopSession: (threadId) =>
        Effect.gen(function* () {
          const session = sessions.get(threadId);
          if (session) yield* stopSessionInternal(session);
        }),
      listSessions: () =>
        Effect.gen(function* () {
          const now = yield* makeIsoNow;
          return Array.from(sessions.values())
            .filter((s) => !s.stopped)
            .map((s) => {
              const providerSession: ProviderSession = {
                provider: DRIVER_KIND,
                providerInstanceId: s.providerInstanceId,
                status: "ready",
                runtimeMode: "full-access",
                threadId: s.threadId,
                createdAt: now,
                updatedAt: now,
                resumeCursor: antigravityResumeCursor(s.transcript),
              };
              return s.currentTurnId
                ? Object.assign(providerSession, { activeTurnId: s.currentTurnId })
                : providerSession;
            });
        }),
      hasSession: (threadId) =>
        Effect.succeed(Boolean(sessions.get(threadId) && !sessions.get(threadId)?.stopped)),
      readThread,
      rollbackThread: (threadId, _numTurns) => readThread(threadId),
      stopAll,
      get streamEvents() {
        return Stream.fromQueue(runtimeEventQueue);
      },
    } satisfies ProviderAdapterShape<ProviderAdapterError>;
  },
);
