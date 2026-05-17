/**
 * HermesAdapter — ACP stdio adapter for the Hermes provider.
 *
 * Each session spawns a dedicated `hermes acp` subprocess. ACP `session/update`
 * notifications are mapped to canonical `ProviderRuntimeEvent`s and pushed onto
 * a shared queue consumed by `streamEvents`.
 *
 * Permission requests bridge the ACP callback model to Trifecta's event/decision
 * flow: incoming `session/request_permission` pushes a `request.opened` event and
 * suspends until `respondToRequest` resolves the accompanying `Deferred`.
 *
 * @module provider/Layers/HermesAdapter
 */
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Random from "effect/Random";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  type ApprovalRequestId,
  type CanonicalItemType,
  type HermesSettings,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderSendTurnInput,
  type ProviderUserInputAnswers,
  type ThreadId,
  type TurnId,
  ApprovalRequestId as ApprovalRequestIdSchema,
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeItemId,
  RuntimeRequestId,
  TurnId as TurnIdSchema,
} from "@belweave/contracts";

import * as AcpClient from "effect-acp/client";
import type * as AcpSchema from "effect-acp/schema";
import { AGENT_METHODS } from "effect-acp/schema";

import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import {
  decodeHermesInitializeResponse,
  decodeHermesNewSessionResponse,
} from "../hermes/HermesAcpWire.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";

const PROVIDER = ProviderDriverKind.make("hermesAgent");

/** `session/set_model` via transport `raw.request`: avoids RpcClient success/error decoding that can defect on Hermes. */
function bestEffortHermesSetSessionModel(
  client: AcpClient.AcpClientShape,
  sessionId: string,
  modelId: string,
): Effect.Effect<void, never> {
  return client.raw
    .request(AGENT_METHODS.session_set_model, {
      sessionId,
      modelId,
    })
    .pipe(Effect.ignoreCause);
}

export interface HermesAdapterOptions {
  readonly instanceId?: ProviderInstanceId;
  readonly environment?: NodeJS.ProcessEnv;
}

interface HermesAdapterSession {
  readonly threadId: ThreadId;
  readonly sessionId: string;
  readonly scope: Scope.Closeable;
  readonly client: AcpClient.AcpClientShape;
  readonly providerInstanceId: ProviderInstanceId;
  readonly pendingRequests: Map<
    ApprovalRequestId,
    Deferred.Deferred<ProviderApprovalDecision, never>
  >;
  currentTurnId: TurnId | undefined;
  activeTurnFiber: Fiber.Fiber<void, never> | undefined;
  stopped: boolean;
}

const makeEventId = Effect.gen(function* () {
  const ms = yield* Clock.currentTimeMillis;
  const uuid = yield* Random.nextUUIDv4;
  return EventId.make(`hermes-${ms}-${uuid.slice(0, 8)}`);
});

const makeIsoNow = Effect.map(DateTime.now, DateTime.formatIso);

const makeEventBase = Effect.fn("makeEventBase")(function* (
  session: HermesAdapterSession,
  turnId?: TurnId,
  itemId?: string,
  requestId?: string,
): Effect.fn.Return<Omit<ProviderRuntimeEvent, "type" | "payload">> {
  const eventId = yield* makeEventId;
  const createdAt = yield* makeIsoNow;
  return {
    eventId,
    provider: PROVIDER,
    providerInstanceId: session.providerInstanceId,
    threadId: session.threadId,
    createdAt,
    ...(turnId ? { turnId } : {}),
    ...(itemId ? { itemId: RuntimeItemId.make(itemId) } : {}),
    ...(requestId ? { requestId: RuntimeRequestId.make(requestId) } : {}),
  };
});

function toolCallKindToItemType(kind: string | undefined): CanonicalItemType {
  switch (kind) {
    case "read":
      return "file_change";
    case "edit":
      return "file_change";
    case "execute":
      return "command_execution";
    case "fetch":
      return "web_search";
    case "think":
      return "reasoning";
    default:
      return "dynamic_tool_call";
  }
}

function mapAcpUpdate(
  notification: AcpSchema.SessionNotification,
  session: HermesAdapterSession,
  queue: Queue.Queue<ProviderRuntimeEvent>,
): Effect.Effect<void> {
  const turnId = session.currentTurnId;
  const update = notification.update;

  if (update.sessionUpdate === "agent_message_chunk") {
    const content = update.content;
    if (content.type !== "text" || !content.text) return Effect.void;
    return Effect.gen(function* () {
      const base = yield* makeEventBase(session, turnId);
      yield* Queue.offer(queue, {
        ...base,
        type: "content.delta",
        payload: {
          streamKind: "assistant_text",
          delta: content.text,
        },
      });
    });
  }

  if (update.sessionUpdate === "agent_thought_chunk") {
    const content = update.content;
    if (content.type !== "text" || !content.text) return Effect.void;
    return Effect.gen(function* () {
      const base = yield* makeEventBase(session, turnId);
      yield* Queue.offer(queue, {
        ...base,
        type: "content.delta",
        payload: {
          streamKind: "reasoning_text",
          delta: content.text,
        },
      });
    });
  }

  if (update.sessionUpdate === "tool_call") {
    const itemId = update.toolCallId;
    const itemType = toolCallKindToItemType(update.kind ?? undefined);
    return Effect.gen(function* () {
      const base = yield* makeEventBase(session, turnId, itemId);
      yield* Queue.offer(queue, {
        ...base,
        type: "item.started",
        payload: {
          itemType,
          status: "inProgress" as const,
          ...(update.title ? { title: update.title } : {}),
        },
      });
    });
  }

  if (update.sessionUpdate === "tool_call_update") {
    const itemId = update.toolCallId;
    const status = update.status;
    if (status !== "completed" && status !== "failed") return Effect.void;
    const itemType = toolCallKindToItemType(update.kind ?? undefined);
    return Effect.gen(function* () {
      const base = yield* makeEventBase(session, turnId, itemId);
      yield* Queue.offer(queue, {
        ...base,
        type: "item.completed",
        payload: {
          itemType,
          status: "completed" as const,
          ...(update.title ? { detail: update.title } : {}),
        },
      });
    });
  }

  if (update.sessionUpdate === "plan") {
    return Effect.gen(function* () {
      const base = yield* makeEventBase(session, turnId);
      yield* Queue.offer(queue, {
        ...base,
        type: "turn.plan.updated",
        payload: {
          plan: update.entries.map((entry) => ({
            step: entry.content,
            status: "pending" as const,
          })),
        },
      });
    });
  }

  if (update.sessionUpdate === "session_info_update" && update.title) {
    return Effect.gen(function* () {
      const base = yield* makeEventBase(session, turnId);
      yield* Queue.offer(queue, {
        ...base,
        type: "thread.metadata.updated",
        payload: {
          name: update.title ?? undefined,
        },
      });
    });
  }

  if (update.sessionUpdate === "usage_update") {
    return Effect.gen(function* () {
      const base = yield* makeEventBase(session, turnId);
      yield* Queue.offer(queue, {
        ...base,
        type: "thread.token-usage.updated",
        payload: {
          usage: {
            usedTokens: update.used,
            maxTokens: update.size,
            compactsAutomatically: false,
          },
        },
      });
    });
  }

  return Effect.void;
}

export const makeHermesAdapter = Effect.fn("makeHermesAdapter")(function* (
  hermesConfig: HermesSettings,
  options?: HermesAdapterOptions,
) {
  const boundInstanceId = options?.instanceId ?? ProviderInstanceId.make("hermesAgent");
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const runtimeEventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();
  const sessions = new Map<ThreadId, HermesAdapterSession>();
  const binaryPath = hermesConfig.binaryPath || "hermes";
  const processEnv = options?.environment ?? process.env;

  const requireSession = Effect.fn("requireSession")(function* (threadId: ThreadId) {
    const session = sessions.get(threadId);
    if (!session || session.stopped) {
      return yield* new ProviderAdapterSessionNotFoundError({
        provider: PROVIDER,
        threadId,
      });
    }
    return session;
  });

  const stopSessionInternal = Effect.fn("stopSessionInternal")(function* (
    session: HermesAdapterSession,
  ) {
    if (session.stopped) return;
    session.stopped = true;
    sessions.delete(session.threadId);
    if (session.activeTurnFiber) {
      yield* Fiber.interrupt(session.activeTurnFiber).pipe(Effect.ignore);
    }
    yield* Scope.close(session.scope, Exit.void).pipe(Effect.ignore);
    const base = yield* makeEventBase(session);
    yield* Queue.offer(runtimeEventQueue, {
      ...base,
      type: "session.exited",
      payload: { reason: "Session stopped" },
    }).pipe(Effect.ignore);
  });

  const startSession: ProviderAdapterShape<ProviderAdapterError>["startSession"] = (input) =>
    Effect.scoped(
      Effect.gen(function* () {
        if (input.provider !== undefined && input.provider !== PROVIDER) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "startSession",
            issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
          });
        }

        const existing = sessions.get(input.threadId);
        if (existing && !existing.stopped) {
          yield* Effect.suspend(() => stopSessionInternal(existing));
        }

        const sessionScope = yield* Scope.make("sequential");
        let sessionScopeTransferred = false;
        yield* Effect.addFinalizer(() =>
          sessionScopeTransferred ? Effect.void : Scope.close(sessionScope, Exit.void),
        );

        const command = ChildProcess.make(binaryPath, ["acp"], {
          cwd: input.cwd ?? process.cwd(),
          env: processEnv,
          shell: process.platform === "win32",
        });

        const handle = yield* spawner.spawn(command).pipe(
          Effect.provideService(Scope.Scope, sessionScope),
          Effect.mapError(
            (cause) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: input.threadId,
                detail: `Failed to spawn hermes acp: ${cause.message}`,
                cause,
              }),
          ),
        );

        const acpLayer = AcpClient.layerChildProcess(handle);
        const acpContext = yield* Layer.build(acpLayer).pipe(
          Effect.provideService(Scope.Scope, sessionScope),
          Effect.mapError(
            (cause) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: input.threadId,
                detail: `Failed to build ACP client: ${String(cause)}`,
                cause: cause as Error,
              }),
          ),
        );
        const acpClient = Context.get(acpContext, AcpClient.AcpClient);

        const rawInitialize = yield* acpClient.raw
          .request(AGENT_METHODS.initialize, {
            protocolVersion: 1 as const,
            clientCapabilities: {
              fs: { readTextFile: false, writeTextFile: false },
              terminal: false,
            },
            clientInfo: { name: "trifecta-desktop", version: "1.0.0" },
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: input.threadId,
                  detail: `ACP initialize transport failed: ${cause.message ?? String(cause)}`,
                  cause: new Error(String(cause)),
                }),
            ),
          );

        yield* decodeHermesInitializeResponse(rawInitialize).pipe(
          Effect.mapError(
            (e) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: input.threadId,
                detail: `ACP initialize response decode failed: ${e.message}`,
                cause: new Error(e.message),
              }),
          ),
        );

        const createPayload = {
          cwd: input.cwd ?? process.cwd(),
          mcpServers: [],
        } satisfies AcpSchema.NewSessionRequest;

        const rawSession = yield* acpClient.raw
          .request(AGENT_METHODS.session_new, createPayload)
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: input.threadId,
                  detail: `ACP session/new transport failed: ${cause.message ?? String(cause)}`,
                  cause: new Error(String(cause)),
                }),
            ),
          );

        const sessionResponse = yield* decodeHermesNewSessionResponse(rawSession).pipe(
          Effect.mapError(
            (e) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: input.threadId,
                detail: `ACP session/new response decode failed: ${e.message}`,
                cause: new Error(e.message),
              }),
          ),
        );

        const session: HermesAdapterSession = {
          threadId: input.threadId,
          sessionId: sessionResponse.sessionId,
          scope: sessionScope,
          client: acpClient,
          providerInstanceId: boundInstanceId,
          pendingRequests: new Map(),
          currentTurnId: undefined,
          activeTurnFiber: undefined,
          stopped: false,
        };

        // Register session update handler (once, routes by session.currentTurnId)
        yield* acpClient.handleSessionUpdate((notification) =>
          mapAcpUpdate(notification, session, runtimeEventQueue),
        );

        // Bridge permission requests to Trifecta's event/decision flow
        yield* acpClient.handleRequestPermission((request) =>
          Effect.gen(function* () {
            const ms = yield* Clock.currentTimeMillis;
            const uuid = yield* Random.nextUUIDv4;
            const reqId = ApprovalRequestIdSchema.make(`hermes-req-${ms}-${uuid.slice(0, 8)}`);
            const deferred = yield* Deferred.make<ProviderApprovalDecision, never>();
            session.pendingRequests.set(reqId, deferred);

            const permTitle = request.toolCall?.title ?? undefined;
            const base = yield* makeEventBase(session, session.currentTurnId, undefined, reqId);
            yield* Queue.offer(runtimeEventQueue, {
              ...base,
              requestId: RuntimeRequestId.make(reqId),
              type: "request.opened",
              payload: {
                requestType: "command_execution_approval" as const,
                ...(permTitle ? { detail: permTitle } : {}),
              },
            });

            const decision = yield* Deferred.await(deferred);
            session.pendingRequests.delete(reqId);

            if (decision === "cancel") {
              return {
                outcome: { outcome: "cancelled" as const },
              } satisfies AcpSchema.RequestPermissionResponse;
            }

            // Find the matching option from the request's options list
            const wantAlways = decision === "acceptForSession";
            const wantReject = decision === "decline";
            const targetKind = wantReject
              ? wantAlways
                ? "reject_always"
                : "reject_once"
              : wantAlways
                ? "allow_always"
                : "allow_once";
            const matchingOption =
              request.options.find((o) => o.kind === targetKind) ??
              request.options.find((o) =>
                wantReject ? o.kind.startsWith("reject") : o.kind.startsWith("allow"),
              ) ??
              request.options[0];

            if (!matchingOption) {
              return {
                outcome: { outcome: "cancelled" as const },
              } satisfies AcpSchema.RequestPermissionResponse;
            }

            return {
              outcome: { outcome: "selected" as const, optionId: matchingOption.optionId },
            } satisfies AcpSchema.RequestPermissionResponse;
          }),
        );

        // Apply model selection if provided
        if (input.modelSelection?.model) {
          yield* bestEffortHermesSetSessionModel(
            acpClient,
            session.sessionId,
            input.modelSelection.model,
          );
        }

        sessions.set(input.threadId, session);
        sessionScopeTransferred = true;

        const startedBase = yield* makeEventBase(session);
        yield* Queue.offer(runtimeEventQueue, {
          ...startedBase,
          type: "session.started",
          payload: {},
        });

        const now = yield* makeIsoNow;
        return {
          provider: PROVIDER,
          providerInstanceId: boundInstanceId,
          status: "ready" as const,
          runtimeMode: input.runtimeMode ?? "full-access",
          threadId: input.threadId,
          createdAt: now,
          updatedAt: now,
        } satisfies ProviderSession;
      }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)),
    );

  const sendTurn: ProviderAdapterShape<ProviderAdapterError>["sendTurn"] = Effect.fn("sendTurn")(
    function* (input: ProviderSendTurnInput) {
      const session = yield* requireSession(input.threadId);
      const ms = yield* Clock.currentTimeMillis;
      const uuid = yield* Random.nextUUIDv4;
      const turnId = TurnIdSchema.make(`hermes-turn-${ms}-${uuid.slice(0, 8)}`);
      session.currentTurnId = turnId;

      const startedBase = yield* makeEventBase(session, turnId);
      yield* Queue.offer(runtimeEventQueue, {
        ...startedBase,
        type: "turn.started",
        payload: {},
      });

      // Apply model switch if requested
      if (input.modelSelection?.model) {
        yield* bestEffortHermesSetSessionModel(
          session.client,
          session.sessionId,
          input.modelSelection.model,
        );
      }

      const promptContent: ReadonlyArray<AcpSchema.ContentBlock> = input.input
        ? [{ type: "text" as const, text: input.input }]
        : [];

      const turnEffect = Effect.gen(function* () {
        const result = yield* session.client.agent
          .prompt({
            sessionId: session.sessionId,
            prompt: promptContent,
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterRequestError({
                  provider: PROVIDER,
                  method: "session/prompt",
                  detail: cause.message ?? String(cause),
                  cause: new Error(String(cause)),
                }),
            ),
            Effect.catchDefect((defect: unknown) =>
              Effect.fail(
                new ProviderAdapterRequestError({
                  provider: PROVIDER,
                  method: "session/prompt",
                  detail: defect instanceof Error ? defect.message : String(defect),
                  cause: defect instanceof Error ? defect : new Error(String(defect)),
                }),
              ),
            ),
          );

        const turnState =
          result.stopReason === "end_turn"
            ? ("completed" as const)
            : result.stopReason === "cancelled"
              ? ("cancelled" as const)
              : ("completed" as const);

        const completedBase = yield* makeEventBase(session, turnId);
        yield* Queue.offer(runtimeEventQueue, {
          ...completedBase,
          type: "turn.completed",
          payload: { state: turnState },
        });
      }).pipe(
        Effect.mapError((err: ProviderAdapterError) =>
          Effect.gen(function* () {
            const errBase = yield* makeEventBase(session, turnId);
            yield* Queue.offer(runtimeEventQueue, {
              ...errBase,
              type: "runtime.error",
              payload: {
                message: err.message ?? "Hermes ACP turn error",
                class: "provider_error" as const,
              },
            });
          }),
        ),
        Effect.ignoreCause,
        Effect.forkDetach,
      );

      const turnFiber = yield* turnEffect;
      session.activeTurnFiber = turnFiber as Fiber.Fiber<void, never>;

      return {
        threadId: input.threadId,
        turnId,
      };
    },
  );

  const interruptTurn: ProviderAdapterShape<ProviderAdapterError>["interruptTurn"] = (
    threadId,
    _turnId,
  ) =>
    requireSession(threadId).pipe(
      Effect.flatMap((session) =>
        Effect.gen(function* () {
          yield* session.client.agent
            .cancel({ sessionId: session.sessionId })
            .pipe(Effect.ignoreCause);
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
              provider: PROVIDER,
              method: "session/cancel",
              detail: cause.message,
              cause,
            }),
      ),
    );

  const respondToRequest: ProviderAdapterShape<ProviderAdapterError>["respondToRequest"] = (
    threadId,
    requestId,
    decision,
  ) =>
    requireSession(threadId).pipe(
      Effect.flatMap((session) =>
        Effect.suspend(() => {
          const deferred = session.pendingRequests.get(requestId);
          if (!deferred) return Effect.void;
          return Deferred.complete(deferred, Effect.succeed(decision));
        }),
      ),
      Effect.mapError((cause) =>
        cause._tag === "ProviderAdapterSessionNotFoundError"
          ? cause
          : new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "respondToRequest",
              detail: cause.message,
              cause,
            }),
      ),
    );

  const respondToUserInput: ProviderAdapterShape<ProviderAdapterError>["respondToUserInput"] = (
    _threadId,
    _requestId,
    _answers: ProviderUserInputAnswers,
  ) => Effect.void;

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
        .map((s) => ({
          provider: PROVIDER,
          providerInstanceId: s.providerInstanceId,
          status: "ready" as const,
          runtimeMode: "full-access" as const,
          threadId: s.threadId,
          ...(s.currentTurnId ? { activeTurnId: s.currentTurnId } : {}),
          createdAt: now,
          updatedAt: now,
        }));
    });

  const hasSession: ProviderAdapterShape<ProviderAdapterError>["hasSession"] = (threadId) =>
    Effect.succeed(Boolean(sessions.get(threadId) && !sessions.get(threadId)?.stopped));

  const readThread: ProviderAdapterShape<ProviderAdapterError>["readThread"] = (threadId) =>
    requireSession(threadId).pipe(
      Effect.map(
        (session) => ({ threadId: session.threadId, turns: [] }) satisfies ProviderThreadSnapshot,
      ),
      Effect.mapError((cause) =>
        cause._tag === "ProviderAdapterSessionNotFoundError"
          ? cause
          : new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "readThread",
              detail: cause.message,
              cause,
            }),
      ),
    );

  const rollbackThread: ProviderAdapterShape<ProviderAdapterError>["rollbackThread"] = (
    threadId,
    _numTurns,
  ) =>
    requireSession(threadId).pipe(
      Effect.map(
        (session) => ({ threadId: session.threadId, turns: [] }) satisfies ProviderThreadSnapshot,
      ),
      Effect.mapError((cause) =>
        cause._tag === "ProviderAdapterSessionNotFoundError"
          ? cause
          : new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "rollbackThread",
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
    provider: PROVIDER,
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
