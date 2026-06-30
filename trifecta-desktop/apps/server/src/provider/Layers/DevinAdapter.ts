/**
 * DevinAdapter — Devin CLI (`devin acp`) via the shared {@link AcpSessionRuntime}.
 *
 * Devin is a full ACP agent. This adapter migrates Devin onto the same shared
 * runtime used by Cursor and Grok, giving it: session resume (`session/load`),
 * native session modes (Code / Ask / Plan / Bypass), model selection via the
 * `model` config option, image prompt attachments, reasoning + token-usage
 * streaming, session rename, MCP server injection, and slash-command discovery.
 *
 * Permission requests are bridged to Trifecta's event/decision flow. Under the
 * `full-access` runtime mode the adapter both selects Devin's `bypass` session
 * mode (so the agent stops prompting) and auto-approves any residual permission
 * request as a safety net.
 *
 * @module provider/Layers/DevinAdapter
 */
import {
  ApprovalRequestId,
  type DevinSettings,
  EventId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  type ThreadId,
  TurnId,
} from "@belweave/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Random from "effect/Random";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";
import type * as EffectAcpSchema from "effect-acp/schema";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { acpPermissionOutcome, mapAcpToAdapterError } from "../acp/AcpAdapterSupport.ts";
import { type AcpSessionRuntimeShape } from "../acp/AcpSessionRuntime.ts";
import {
  makeAcpAssistantItemEvent,
  makeAcpContentDeltaEvent,
  makeAcpPlanUpdatedEvent,
  makeAcpReasoningDeltaEvent,
  makeAcpRequestOpenedEvent,
  makeAcpRequestResolvedEvent,
  makeAcpSessionInfoUpdatedEvent,
  makeAcpToolCallEvent,
  makeAcpUsageUpdatedEvent,
} from "../acp/AcpCoreRuntimeEvents.ts";
import { type AcpAvailableCommand, parsePermissionRequest } from "../acp/AcpRuntimeModel.ts";
import { makeAcpNativeLoggers } from "../acp/AcpNativeLogging.ts";
import {
  currentDevinModelIdFromSessionSetup,
  makeDevinAcpRuntime,
  resolveDevinSessionModeId,
} from "../acp/DevinAcpSupport.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";
import { type EventNdjsonLogger } from "./EventNdjsonLogger.ts";

const PROVIDER = ProviderDriverKind.make("devinAgent");
const DEVIN_RESUME_VERSION = 1 as const;

export interface DevinAdapterOptions {
  readonly instanceId?: ProviderInstanceId;
  readonly environment?: NodeJS.ProcessEnv;
  readonly nativeEventLogger?: EventNdjsonLogger;
  /**
   * Resolver for the MCP servers exposed to each Devin session. Yielded at the
   * start of every session so registry edits apply to subsequent sessions
   * without rebuilding the adapter. Defaults to "no MCP servers".
   */
  readonly resolveMcpServers?: Effect.Effect<ReadonlyArray<EffectAcpSchema.McpServer>>;
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>;
}

interface DevinSessionContext {
  readonly threadId: ThreadId;
  session: ProviderSession;
  readonly scope: Scope.Closeable;
  readonly acp: AcpSessionRuntimeShape;
  notificationFiber: Fiber.Fiber<void, never> | undefined;
  readonly pendingApprovals: Map<ApprovalRequestId, PendingApproval>;
  readonly turns: Array<{ id: TurnId; items: Array<unknown> }>;
  lastPlanFingerprint: string | undefined;
  activeTurnId: TurnId | undefined;
  currentModeId: string | undefined;
  availableCommands: ReadonlyArray<AcpAvailableCommand>;
  stopped: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDevinResume(raw: unknown): { sessionId: string } | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== DEVIN_RESUME_VERSION) return undefined;
  if (typeof raw.sessionId !== "string" || !raw.sessionId.trim()) return undefined;
  return { sessionId: raw.sessionId.trim() };
}

function selectAutoApprovedPermissionOption(
  request: EffectAcpSchema.RequestPermissionRequest,
): string | undefined {
  const allowAlways = request.options.find((option) => option.kind === "allow_always");
  if (typeof allowAlways?.optionId === "string" && allowAlways.optionId.trim()) {
    return allowAlways.optionId.trim();
  }
  const allowOnce = request.options.find((option) => option.kind === "allow_once");
  if (typeof allowOnce?.optionId === "string" && allowOnce.optionId.trim()) {
    return allowOnce.optionId.trim();
  }
  return undefined;
}

function settlePendingApprovalsAsCancelled(
  pendingApprovals: ReadonlyMap<ApprovalRequestId, PendingApproval>,
): Effect.Effect<void> {
  return Effect.forEach(
    Array.from(pendingApprovals.values()),
    (pending) => Deferred.succeed(pending.decision, "cancel").pipe(Effect.ignore),
    { discard: true },
  );
}

/** Align Devin's native session mode with the requested runtime/interaction mode. */
function applyDevinModeSelection(
  ctx: DevinSessionContext,
  input: {
    readonly runtimeMode: ProviderSession["runtimeMode"];
    readonly interactionMode?: "default" | "plan" | undefined;
  },
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const modeState = yield* ctx.acp.getModeState;
    const targetModeId = resolveDevinSessionModeId({
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      availableModeIds: modeState?.availableModes.map((mode) => mode.id) ?? [],
    });
    if (!targetModeId || targetModeId === ctx.currentModeId) {
      return;
    }
    yield* Effect.ignore(ctx.acp.setMode(targetModeId));
    ctx.currentModeId = targetModeId;
  });
}

/** Apply a requested model selection to a Devin session (best effort). */
function applyDevinModelSelection(
  ctx: DevinSessionContext,
  requestedModelId: string | undefined,
): Effect.Effect<string | undefined, ProviderAdapterError> {
  return Effect.gen(function* () {
    const current = ctx.session.model;
    if (!requestedModelId || requestedModelId === current) {
      return current;
    }
    yield* ctx.acp
      .setModel(requestedModelId)
      .pipe(
        Effect.mapError((cause) =>
          mapAcpToAdapterError(PROVIDER, ctx.threadId, "session/set_model", cause),
        ),
      );
    return requestedModelId;
  });
}

export const makeDevinAdapter = Effect.fn("makeDevinAdapter")(function* (
  devinConfig: DevinSettings,
  options?: DevinAdapterOptions,
) {
  const boundInstanceId = options?.instanceId ?? ProviderInstanceId.make("devinAgent");
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const serverConfig = yield* Effect.service(ServerConfig);
  const nativeEventLogger = options?.nativeEventLogger;
  const processEnv = options?.environment ?? process.env;
  const resolveMcpServers = options?.resolveMcpServers ?? Effect.succeed([]);

  const sessions = new Map<ThreadId, DevinSessionContext>();
  const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();

  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
  const nextEventId = Effect.map(Random.nextUUIDv4, (id) => EventId.make(id));
  const makeEventStamp = () => Effect.all({ eventId: nextEventId, createdAt: nowIso });

  const offerRuntimeEvent = (event: ProviderRuntimeEvent) =>
    PubSub.publish(runtimeEventPubSub, event).pipe(Effect.asVoid);

  const requireSession = (
    threadId: ThreadId,
  ): Effect.Effect<DevinSessionContext, ProviderAdapterSessionNotFoundError> => {
    const ctx = sessions.get(threadId);
    if (!ctx || ctx.stopped) {
      return Effect.fail(new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId }));
    }
    return Effect.succeed(ctx);
  };

  const emitPlanUpdate = (
    ctx: DevinSessionContext,
    payload: {
      readonly explanation?: string | null;
      readonly plan: ReadonlyArray<{
        readonly step: string;
        readonly status: "pending" | "inProgress" | "completed";
      }>;
    },
    rawPayload: unknown,
  ) =>
    Effect.gen(function* () {
      const fingerprint = `${ctx.activeTurnId ?? "no-turn"}:${payload.explanation ?? ""}:${payload.plan
        .map((entry) => `${entry.status}|${entry.step}`)
        .join("\n")}`;
      if (ctx.lastPlanFingerprint === fingerprint) {
        return;
      }
      ctx.lastPlanFingerprint = fingerprint;
      yield* offerRuntimeEvent(
        makeAcpPlanUpdatedEvent({
          stamp: yield* makeEventStamp(),
          provider: PROVIDER,
          threadId: ctx.threadId,
          turnId: ctx.activeTurnId,
          payload,
          source: "acp.jsonrpc",
          method: "session/update",
          rawPayload,
        }),
      );
    });

  const stopSessionInternal = (ctx: DevinSessionContext) =>
    Effect.gen(function* () {
      if (ctx.stopped) return;
      ctx.stopped = true;
      yield* settlePendingApprovalsAsCancelled(ctx.pendingApprovals);
      if (ctx.notificationFiber) {
        yield* Fiber.interrupt(ctx.notificationFiber);
      }
      yield* Effect.ignore(Scope.close(ctx.scope, Exit.void));
      sessions.delete(ctx.threadId);
      yield* offerRuntimeEvent({
        type: "session.exited",
        ...(yield* makeEventStamp()),
        provider: PROVIDER,
        threadId: ctx.threadId,
        payload: { exitKind: "graceful" },
      });
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

        const cwd = path.resolve(input.cwd?.trim() || process.cwd());
        const modelSelection =
          input.modelSelection?.instanceId === boundInstanceId ? input.modelSelection : undefined;

        const existing = sessions.get(input.threadId);
        if (existing && !existing.stopped) {
          yield* stopSessionInternal(existing);
        }

        const pendingApprovals = new Map<ApprovalRequestId, PendingApproval>();
        const sessionScope = yield* Scope.make("sequential");
        let sessionScopeTransferred = false;
        yield* Effect.addFinalizer(() =>
          sessionScopeTransferred ? Effect.void : Scope.close(sessionScope, Exit.void),
        );
        let ctx!: DevinSessionContext;

        const mcpServers = yield* resolveMcpServers;
        const resumeSessionId = parseDevinResume(input.resumeCursor)?.sessionId;
        const acpNativeLoggers = makeAcpNativeLoggers({
          nativeEventLogger,
          provider: PROVIDER,
          threadId: input.threadId,
        });

        const acp = yield* makeDevinAcpRuntime({
          devinSettings: devinConfig,
          environment: processEnv,
          childProcessSpawner,
          cwd,
          mcpServers,
          ...(resumeSessionId ? { resumeSessionId } : {}),
          clientInfo: { name: "trifecta", version: "0.0.0" },
          ...acpNativeLoggers,
        }).pipe(
          Effect.provideService(Scope.Scope, sessionScope),
          Effect.mapError(
            (cause) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: input.threadId,
                detail: cause.message,
                cause,
              }),
          ),
        );

        const started = yield* Effect.gen(function* () {
          yield* acp.handleRequestPermission((params) =>
            Effect.gen(function* () {
              if (input.runtimeMode === "full-access") {
                const autoApprovedOptionId = selectAutoApprovedPermissionOption(params);
                if (autoApprovedOptionId !== undefined) {
                  return {
                    outcome: { outcome: "selected" as const, optionId: autoApprovedOptionId },
                  };
                }
              }
              const permissionRequest = parsePermissionRequest(params);
              const requestId = ApprovalRequestId.make(crypto.randomUUID());
              const runtimeRequestId = RuntimeRequestId.make(requestId);
              const decision = yield* Deferred.make<ProviderApprovalDecision>();
              pendingApprovals.set(requestId, { decision });
              yield* offerRuntimeEvent(
                makeAcpRequestOpenedEvent({
                  stamp: yield* makeEventStamp(),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: ctx?.activeTurnId,
                  requestId: runtimeRequestId,
                  permissionRequest,
                  detail: permissionRequest.detail ?? "Devin requested permission",
                  args: params,
                  source: "acp.jsonrpc",
                  method: "session/request_permission",
                  rawPayload: params,
                }),
              );
              const resolved = yield* Deferred.await(decision);
              pendingApprovals.delete(requestId);
              yield* offerRuntimeEvent(
                makeAcpRequestResolvedEvent({
                  stamp: yield* makeEventStamp(),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: ctx?.activeTurnId,
                  requestId: runtimeRequestId,
                  permissionRequest,
                  decision: resolved,
                }),
              );
              return {
                outcome:
                  resolved === "cancel"
                    ? ({ outcome: "cancelled" } as const)
                    : { outcome: "selected" as const, optionId: acpPermissionOutcome(resolved) },
              };
            }),
          );
          return yield* acp.start();
        }).pipe(
          Effect.mapError((error) =>
            mapAcpToAdapterError(PROVIDER, input.threadId, "session/start", error),
          ),
        );

        const initialModeState = yield* acp.getModeState;
        const startModelId =
          modelSelection?.model ?? currentDevinModelIdFromSessionSetup(started.sessionSetupResult);

        const now = yield* nowIso;
        const session: ProviderSession = {
          provider: PROVIDER,
          providerInstanceId: boundInstanceId,
          status: "ready",
          runtimeMode: input.runtimeMode,
          cwd,
          ...(startModelId ? { model: startModelId } : {}),
          threadId: input.threadId,
          resumeCursor: {
            schemaVersion: DEVIN_RESUME_VERSION,
            sessionId: started.sessionId,
          },
          createdAt: now,
          updatedAt: now,
        };

        ctx = {
          threadId: input.threadId,
          session,
          scope: sessionScope,
          acp,
          notificationFiber: undefined,
          pendingApprovals,
          turns: [],
          lastPlanFingerprint: undefined,
          activeTurnId: undefined,
          currentModeId: initialModeState?.currentModeId,
          availableCommands: [],
          stopped: false,
        };

        // Apply the requested model selection up-front (best effort).
        if (modelSelection?.model) {
          const boundModelId = yield* applyDevinModelSelection(ctx, modelSelection.model);
          ctx.session = { ...ctx.session, ...(boundModelId ? { model: boundModelId } : {}) };
        }
        // Align Devin's native session mode with the requested runtime mode.
        yield* applyDevinModeSelection(ctx, { runtimeMode: input.runtimeMode });

        const nf = yield* Stream.runDrain(
          Stream.mapEffect(acp.getEvents(), (event) =>
            Effect.gen(function* () {
              switch (event._tag) {
                case "ModeChanged":
                  ctx.currentModeId = event.modeId;
                  return;
                case "CommandsUpdated":
                  ctx.availableCommands = event.commands;
                  return;
                case "AssistantItemStarted":
                  yield* offerRuntimeEvent(
                    makeAcpAssistantItemEvent({
                      stamp: yield* makeEventStamp(),
                      provider: PROVIDER,
                      threadId: ctx.threadId,
                      turnId: ctx.activeTurnId,
                      itemId: event.itemId,
                      lifecycle: "item.started",
                    }),
                  );
                  return;
                case "AssistantItemCompleted":
                  yield* offerRuntimeEvent(
                    makeAcpAssistantItemEvent({
                      stamp: yield* makeEventStamp(),
                      provider: PROVIDER,
                      threadId: ctx.threadId,
                      turnId: ctx.activeTurnId,
                      itemId: event.itemId,
                      lifecycle: "item.completed",
                    }),
                  );
                  return;
                case "PlanUpdated":
                  yield* emitPlanUpdate(ctx, event.payload, event.rawPayload);
                  return;
                case "ToolCallUpdated":
                  yield* offerRuntimeEvent(
                    makeAcpToolCallEvent({
                      stamp: yield* makeEventStamp(),
                      provider: PROVIDER,
                      threadId: ctx.threadId,
                      turnId: ctx.activeTurnId,
                      toolCall: event.toolCall,
                      rawPayload: event.rawPayload,
                    }),
                  );
                  return;
                case "ContentDelta":
                  yield* offerRuntimeEvent(
                    makeAcpContentDeltaEvent({
                      stamp: yield* makeEventStamp(),
                      provider: PROVIDER,
                      threadId: ctx.threadId,
                      turnId: ctx.activeTurnId,
                      ...(event.itemId ? { itemId: event.itemId } : {}),
                      text: event.text,
                      rawPayload: event.rawPayload,
                    }),
                  );
                  return;
                case "ReasoningDelta":
                  yield* offerRuntimeEvent(
                    makeAcpReasoningDeltaEvent({
                      stamp: yield* makeEventStamp(),
                      provider: PROVIDER,
                      threadId: ctx.threadId,
                      turnId: ctx.activeTurnId,
                      text: event.text,
                      rawPayload: event.rawPayload,
                    }),
                  );
                  return;
                case "UsageUpdated":
                  yield* offerRuntimeEvent(
                    makeAcpUsageUpdatedEvent({
                      stamp: yield* makeEventStamp(),
                      provider: PROVIDER,
                      threadId: ctx.threadId,
                      turnId: ctx.activeTurnId,
                      usage: event.usage,
                      rawPayload: event.rawPayload,
                    }),
                  );
                  return;
                case "SessionInfoUpdated":
                  if (event.title) {
                    yield* offerRuntimeEvent(
                      makeAcpSessionInfoUpdatedEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: ctx.threadId,
                        turnId: ctx.activeTurnId,
                        title: event.title,
                        rawPayload: event.rawPayload,
                      }),
                    );
                  }
                  return;
              }
            }),
          ),
        ).pipe(Effect.forkChild);

        ctx.notificationFiber = nf;
        sessions.set(input.threadId, ctx);
        sessionScopeTransferred = true;

        yield* offerRuntimeEvent({
          type: "session.started",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          threadId: input.threadId,
          payload: { resume: started.initializeResult },
        });
        yield* offerRuntimeEvent({
          type: "session.state.changed",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          threadId: input.threadId,
          payload: { state: "ready", reason: "Devin ACP session ready" },
        });
        yield* offerRuntimeEvent({
          type: "thread.started",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          threadId: input.threadId,
          payload: { providerThreadId: started.sessionId },
        });

        return ctx.session;
      }),
    );

  const sendTurn: ProviderAdapterShape<ProviderAdapterError>["sendTurn"] = (input) =>
    Effect.gen(function* () {
      const ctx = yield* requireSession(input.threadId);
      const turnId = TurnId.make(crypto.randomUUID());
      const modelSelection =
        input.modelSelection?.instanceId === boundInstanceId ? input.modelSelection : undefined;

      // Apply model + mode selection before prompting.
      const boundModelId = yield* applyDevinModelSelection(ctx, modelSelection?.model);
      yield* applyDevinModeSelection(ctx, {
        runtimeMode: ctx.session.runtimeMode,
        interactionMode: input.interactionMode,
      });

      ctx.activeTurnId = turnId;
      ctx.lastPlanFingerprint = undefined;
      ctx.session = {
        ...ctx.session,
        activeTurnId: turnId,
        updatedAt: yield* nowIso,
        ...(boundModelId ? { model: boundModelId } : {}),
      };

      yield* offerRuntimeEvent({
        type: "turn.started",
        ...(yield* makeEventStamp()),
        provider: PROVIDER,
        threadId: input.threadId,
        turnId,
        payload: boundModelId ? { model: boundModelId } : {},
      });

      const promptParts: Array<EffectAcpSchema.ContentBlock> = [];
      if (input.input?.trim()) {
        promptParts.push({ type: "text", text: input.input.trim() });
      }
      if (input.attachments && input.attachments.length > 0) {
        for (const attachment of input.attachments) {
          const attachmentPath = resolveAttachmentPath({
            attachmentsDir: serverConfig.attachmentsDir,
            attachment,
          });
          if (!attachmentPath) {
            return yield* new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "session/prompt",
              detail: `Invalid attachment id '${attachment.id}'.`,
            });
          }
          const bytes = yield* fileSystem.readFile(attachmentPath).pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterRequestError({
                  provider: PROVIDER,
                  method: "session/prompt",
                  detail: cause.message,
                  cause,
                }),
            ),
          );
          promptParts.push({
            type: "image",
            data: Buffer.from(bytes).toString("base64"),
            mimeType: attachment.mimeType,
          });
        }
      }

      if (promptParts.length === 0) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: "Turn requires non-empty text or attachments.",
        });
      }

      const result = yield* ctx.acp
        .prompt({ prompt: promptParts })
        .pipe(
          Effect.mapError((error) =>
            mapAcpToAdapterError(PROVIDER, input.threadId, "session/prompt", error),
          ),
        );

      ctx.turns.push({ id: turnId, items: [{ prompt: promptParts, result }] });
      ctx.session = { ...ctx.session, activeTurnId: turnId, updatedAt: yield* nowIso };

      yield* offerRuntimeEvent({
        type: "turn.completed",
        ...(yield* makeEventStamp()),
        provider: PROVIDER,
        threadId: input.threadId,
        turnId,
        payload: {
          state: result.stopReason === "cancelled" ? "cancelled" : "completed",
          stopReason: result.stopReason ?? null,
        },
      });

      return { threadId: input.threadId, turnId, resumeCursor: ctx.session.resumeCursor };
    });

  const interruptTurn: ProviderAdapterShape<ProviderAdapterError>["interruptTurn"] = (threadId) =>
    Effect.gen(function* () {
      const ctx = yield* requireSession(threadId);
      yield* settlePendingApprovalsAsCancelled(ctx.pendingApprovals);
      yield* Effect.ignore(
        ctx.acp.cancel.pipe(
          Effect.mapError((error) =>
            mapAcpToAdapterError(PROVIDER, threadId, "session/cancel", error),
          ),
        ),
      );
    });

  const respondToRequest: ProviderAdapterShape<ProviderAdapterError>["respondToRequest"] = (
    threadId,
    requestId,
    decision,
  ) =>
    Effect.gen(function* () {
      const ctx = yield* requireSession(threadId);
      const pending = ctx.pendingApprovals.get(requestId);
      if (!pending) {
        return yield* new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "session/request_permission",
          detail: `Unknown pending approval request: ${requestId}`,
        });
      }
      yield* Deferred.succeed(pending.decision, decision);
    });

  const stopSession: ProviderAdapterShape<ProviderAdapterError>["stopSession"] = (threadId) =>
    Effect.gen(function* () {
      const ctx = sessions.get(threadId);
      if (!ctx) return;
      yield* stopSessionInternal(ctx);
    });

  const listSessions: ProviderAdapterShape<ProviderAdapterError>["listSessions"] = () =>
    Effect.sync(() => {
      const result: ProviderSession[] = [];
      for (const ctx of sessions.values()) {
        if (!ctx.stopped) result.push({ ...ctx.session });
      }
      return result;
    });

  const hasSession: ProviderAdapterShape<ProviderAdapterError>["hasSession"] = (threadId) =>
    Effect.sync(() => {
      const ctx = sessions.get(threadId);
      return ctx !== undefined && !ctx.stopped;
    });

  const readThread: ProviderAdapterShape<ProviderAdapterError>["readThread"] = (threadId) =>
    requireSession(threadId).pipe(
      Effect.map(
        (ctx) => ({ threadId: ctx.threadId, turns: ctx.turns }) satisfies ProviderThreadSnapshot,
      ),
    );

  const rollbackThread: ProviderAdapterShape<ProviderAdapterError>["rollbackThread"] = (
    threadId,
    numTurns,
  ) =>
    Effect.gen(function* () {
      const ctx = yield* requireSession(threadId);
      if (!Number.isInteger(numTurns) || numTurns < 1) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "rollbackThread",
          issue: "numTurns must be an integer >= 1.",
        });
      }
      const nextLength = Math.max(0, ctx.turns.length - numTurns);
      ctx.turns.splice(nextLength);
      return { threadId, turns: ctx.turns } satisfies ProviderThreadSnapshot;
    });

  const stopAll: ProviderAdapterShape<ProviderAdapterError>["stopAll"] = () =>
    Effect.forEach(Array.from(sessions.values()), stopSessionInternal, { discard: true });

  yield* Effect.acquireRelease(Effect.void, () =>
    Effect.forEach(Array.from(sessions.values()), stopSessionInternal, { discard: true }).pipe(
      Effect.andThen(PubSub.shutdown(runtimeEventPubSub)),
      Effect.ignore,
    ),
  );

  return {
    provider: PROVIDER,
    capabilities: { sessionModelSwitch: "in-session" },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    // Devin has no structured user-input (elicitation) extension; no-op.
    respondToUserInput: () => Effect.void,
    stopSession,
    listSessions,
    hasSession,
    readThread,
    rollbackThread,
    stopAll,
    streamEvents: Stream.fromPubSub(runtimeEventPubSub),
  } satisfies ProviderAdapterShape<ProviderAdapterError>;
});
