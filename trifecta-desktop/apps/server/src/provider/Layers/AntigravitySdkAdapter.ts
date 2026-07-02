import * as Os from "node:os";

import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as Random from "effect/Random";
import * as Stream from "effect/Stream";

import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeItemId,
  RuntimeRequestId,
  TurnId as TurnIdSchema,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ThreadId,
  type TurnId,
} from "@belweave/contracts";

import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";

const DRIVER_KIND = ProviderDriverKind.make("antigravity");
const ANTIGRAVITY_SDK_RESUME_CURSOR_V = 1 as const;
const DEFAULT_PYTHON_COMMAND = "python3";
const DEFAULT_SAVE_DIR = `${Os.homedir() || "."}/.trifecta/antigravity-sdk`;

const nodeChildProcess = process.getBuiltinModule(
  "child_process",
) as typeof import("node:child_process");
const nodeReadline = process.getBuiltinModule("readline") as typeof import("node:readline");

type BridgeRequest =
  | {
      readonly type: "init";
      readonly id: string;
      readonly cwd: string;
      readonly saveDir: string;
      readonly conversationId?: string | undefined;
      readonly model?: string | undefined;
      readonly apiKey?: string | undefined;
    }
  | {
      readonly type: "chat";
      readonly id: string;
      readonly prompt: string;
    }
  | {
      readonly type: "cancel";
      readonly id: string;
    }
  | {
      readonly type: "approval_response";
      readonly id: string;
      readonly requestId: string;
      readonly allow: boolean;
    }
  | {
      readonly type: "user_input_response";
      readonly id: string;
      readonly requestId: string;
      readonly answers: Record<string, unknown>;
    }
  | {
      readonly type: "shutdown";
      readonly id: string;
    };

type BridgeMessage =
  | {
      readonly type: "ready";
      readonly id?: string;
      readonly conversationId?: string | null;
    }
  | {
      readonly type: "content_delta";
      readonly id?: string;
      readonly delta?: string;
    }
  | {
      readonly type: "thought_delta";
      readonly id?: string;
      readonly delta?: string;
    }
  | {
      readonly type: "tool_call";
      readonly id?: string;
      readonly toolCallId?: string | null;
      readonly name?: string;
      readonly args?: unknown;
    }
  | {
      readonly type: "approval_required";
      readonly id?: string;
      readonly requestId: string;
      readonly toolName?: string;
      readonly args?: unknown;
    }
  | {
      readonly type: "user_input_required";
      readonly id?: string;
      readonly requestId: string;
      readonly questions?: ReadonlyArray<{
        readonly id: string;
        readonly header: string;
        readonly question: string;
        readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>;
        readonly multiSelect?: boolean;
      }>;
    }
  | {
      readonly type: "done";
      readonly id?: string;
      readonly conversationId?: string | null;
    }
  | {
      readonly type: "cancelled";
      readonly id?: string;
      readonly conversationId?: string | null;
    }
  | {
      readonly type: "error";
      readonly id?: string;
      readonly message?: string;
      readonly detail?: string;
    };

interface AntigravitySdkResumeCursor {
  readonly v: typeof ANTIGRAVITY_SDK_RESUME_CURSOR_V;
  readonly antigravitySdk?: {
    readonly conversationId?: string | undefined;
    readonly saveDir?: string | undefined;
  };
}

interface AntigravitySdkSession {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly cwd: string;
  bridge: AntigravitySdkBridge;
  readonly saveDir: string;
  readonly activeToolItems: Map<
    string,
    { readonly itemType: ReturnType<typeof toolNameToItemType>; readonly title: string }
  >;
  currentTurnId: TurnId | undefined;
  conversationId: string | undefined;
  activeTurnFiber: Fiber.Fiber<void, never> | undefined;
  stopped: boolean;
}

export interface AntigravitySdkAdapterInput {
  readonly pythonPath?: string | undefined;
  readonly saveDirectory?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly environment: NodeJS.ProcessEnv;
  readonly instanceId: ProviderInstanceId;
}

const ANTIGRAVITY_SDK_BRIDGE_SOURCE = String.raw`
import asyncio
import json
import sys
import traceback
import uuid

try:
  from google.antigravity import Agent, CapabilitiesConfig, LocalAgentConfig
  from google.antigravity import types
  from google.antigravity.hooks import OnInteractionHook, policy
except Exception as exc:
  print(json.dumps({
      "type": "error",
      "message": "Unable to import google.antigravity. Install it with: pip install google-antigravity",
      "detail": repr(exc),
  }), flush=True)
  raise


command_queue = None
pending_approvals = {}
pending_questions = {}


def emit(payload):
  print(json.dumps(payload, separators=(",", ":")), flush=True)


def encode_args(args):
  try:
    json.dumps(args)
    return args
  except TypeError:
    return repr(args)


async def stdin_reader(loop):
  while True:
    line = await asyncio.to_thread(sys.stdin.readline)
    if line == "":
      await command_queue.put({"type": "shutdown", "id": "stdin-eof"})
      return
    try:
      message = json.loads(line)
    except Exception:
      continue
    message_type = message.get("type")
    if message_type == "approval_response":
      future = pending_approvals.pop(message.get("requestId"), None)
      if future and not future.done():
        future.set_result(bool(message.get("allow")))
      continue
    if message_type == "user_input_response":
      future = pending_questions.pop(message.get("requestId"), None)
      if future and not future.done():
        future.set_result(message.get("answers") or {})
      continue
    await command_queue.put(message)


async def approval_handler(tool_call):
  request_id = str(uuid.uuid4())
  future = asyncio.get_running_loop().create_future()
  pending_approvals[request_id] = future
  emit({
      "type": "approval_required",
      "requestId": request_id,
      "toolName": getattr(tool_call, "name", "unknown"),
      "args": encode_args(getattr(tool_call, "args", {})),
  })
  return await future


class QuestionBridgeHook(OnInteractionHook):
  async def run(self, context, data):
    request_id = str(uuid.uuid4())
    questions = []
    for index, question in enumerate(data.questions):
      questions.append({
          "id": f"q{index + 1}",
          "header": "Question",
          "question": question.question,
          "options": [
              {"label": option.text, "description": option.text}
              for option in question.options
          ],
          "multiSelect": bool(getattr(question, "is_multi_select", False)),
      })

    future = asyncio.get_running_loop().create_future()
    pending_questions[request_id] = future
    emit({
        "type": "user_input_required",
        "requestId": request_id,
        "questions": questions,
    })
    answers = await future

    responses = []
    for question in questions:
      raw_answer = answers.get(question["id"])
      if raw_answer is None or raw_answer == "":
        responses.append(types.QuestionResponse(skipped=True))
      elif isinstance(raw_answer, list):
        responses.append(types.QuestionResponse(
            selected_option_ids=[str(value) for value in raw_answer],
        ))
      else:
        responses.append(types.QuestionResponse(freeform_response=str(raw_answer)))
    return types.QuestionHookResult(responses=responses)


async def handle_chat(agent, message):
  response = await agent.chat(message.get("prompt") or "")
  async for chunk in response.chunks:
    if isinstance(chunk, types.Text):
      emit({"type": "content_delta", "id": message.get("id"), "delta": chunk.text})
    elif isinstance(chunk, types.Thought):
      emit({"type": "thought_delta", "id": message.get("id"), "delta": chunk.text})
    elif isinstance(chunk, types.ToolCall):
      emit({
          "type": "tool_call",
          "id": message.get("id"),
          "toolCallId": chunk.id,
          "name": chunk.name,
          "args": encode_args(chunk.args),
      })
  emit({
      "type": "done",
      "id": message.get("id"),
      "conversationId": agent.conversation_id,
  })


async def main():
  global command_queue
  command_queue = asyncio.Queue()
  loop = asyncio.get_running_loop()
  reader_task = asyncio.create_task(stdin_reader(loop))
  init = await command_queue.get()
  if init.get("type") != "init":
    emit({"type": "error", "id": init.get("id"), "message": "Expected init command."})
    return

  policies = [
      policy.ask_user("run_command", handler=approval_handler),
      policy.allow("*"),
  ]
  config = LocalAgentConfig(
      conversation_id=init.get("conversationId") or None,
      save_dir=init.get("saveDir") or None,
      app_data_dir=init.get("saveDir") or None,
      workspaces=[init.get("cwd")] if init.get("cwd") else [],
      model=None if init.get("model") in (None, "", "auto") else init.get("model"),
      api_key=init.get("apiKey") or None,
      capabilities=CapabilitiesConfig(),
      policies=policies,
      hooks=[QuestionBridgeHook()],
  )

  try:
    async with Agent(config) as agent:
      emit({
          "type": "ready",
          "id": init.get("id"),
          "conversationId": agent.conversation_id,
      })
      while True:
        message = await command_queue.get()
        message_type = message.get("type")
        try:
          if message_type == "chat":
            await handle_chat(agent, message)
          elif message_type == "cancel":
            await agent.conversation.cancel()
            emit({
                "type": "cancelled",
                "id": message.get("id"),
                "conversationId": agent.conversation_id,
            })
          elif message_type == "shutdown":
            return
        except Exception as exc:
          emit({
              "type": "error",
              "id": message.get("id"),
              "message": str(exc),
              "detail": traceback.format_exc(),
          })
  finally:
    reader_task.cancel()


if __name__ == "__main__":
  asyncio.run(main())
`;

function parseAntigravitySdkResume(input: unknown): {
  readonly conversationId?: string | undefined;
  readonly saveDir?: string | undefined;
} {
  if (input === null || typeof input !== "object") return {};
  const raw = (input as { antigravitySdk?: unknown }).antigravitySdk;
  if (raw === null || typeof raw !== "object") return {};
  const conversationId = (raw as { conversationId?: unknown }).conversationId;
  const saveDir = (raw as { saveDir?: unknown }).saveDir;
  return {
    ...(typeof conversationId === "string" && conversationId.trim()
      ? { conversationId: conversationId.trim() }
      : {}),
    ...(typeof saveDir === "string" && saveDir.trim() ? { saveDir: saveDir.trim() } : {}),
  };
}

function expandUserPath(path: string): string {
  if (path === "~") return Os.homedir() || path;
  if (path.startsWith("~/")) return `${Os.homedir() || "."}${path.slice(1)}`;
  return path;
}

function antigravitySdkResumeCursor(
  session: Pick<AntigravitySdkSession, "conversationId" | "saveDir">,
) {
  return {
    v: ANTIGRAVITY_SDK_RESUME_CURSOR_V,
    antigravitySdk: {
      ...(session.conversationId ? { conversationId: session.conversationId } : {}),
      saveDir: session.saveDir,
    },
  } satisfies AntigravitySdkResumeCursor;
}

function buildPromptText(input: ProviderSendTurnInput): string {
  const base = input.input?.trim() ?? "";
  if (input.attachments?.length) {
    const note =
      "\n\n[Note: Trifecta attached files in this turn; Antigravity SDK attachment forwarding is not wired yet. Only this text was sent.]";
    return base ? `${base}${note}` : note.trim();
  }
  return base;
}

function toolNameToItemType(toolName: string | undefined) {
  const normalized = toolName?.toLowerCase() ?? "";
  if (normalized.includes("run") || normalized.includes("command")) return "command_execution";
  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("create") ||
    normalized.includes("file")
  ) {
    return "file_change";
  }
  if (normalized.includes("search") || normalized.includes("find") || normalized.includes("list")) {
    return "dynamic_tool_call";
  }
  if (normalized.includes("question")) return "dynamic_tool_call";
  if (normalized.includes("subagent")) return "collab_agent_tool_call";
  if (normalized.includes("image")) return "image_view";
  return "dynamic_tool_call";
}

function toolNameToRequestType(toolName: string | undefined) {
  const normalized = toolName?.toLowerCase() ?? "";
  if (normalized.includes("run") || normalized.includes("command")) {
    return "command_execution_approval" as const;
  }
  if (normalized.includes("read") || normalized.includes("view")) {
    return "file_read_approval" as const;
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("create")
  ) {
    return "file_change_approval" as const;
  }
  return "unknown" as const;
}

function approvalDecisionToAllow(decision: ProviderApprovalDecision): boolean {
  return decision === "accept" || decision === "acceptForSession";
}

const makeEventId = Effect.gen(function* () {
  const ms = yield* Clock.currentTimeMillis;
  const uuid = yield* Random.nextUUIDv4;
  return EventId.make(`agysdk-${ms}-${uuid.slice(0, 8)}`);
});

const makeIsoNow = Effect.map(DateTime.now, DateTime.formatIso);

const makeEventBase = Effect.fn("makeAntigravitySdkEventBase")(function* (
  session: Pick<AntigravitySdkSession, "threadId" | "providerInstanceId">,
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

class AntigravitySdkBridge {
  readonly #child: import("node:child_process").ChildProcessWithoutNullStreams;
  readonly #stdout: import("node:readline").Interface;
  readonly #pending = new Map<
    string,
    { resolve: (message: BridgeMessage) => void; reject: (error: Error) => void }
  >();
  readonly #onEvent: (message: BridgeMessage) => void;
  #stderr = "";
  #closed = false;

  constructor(input: {
    readonly pythonPath: string;
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly onEvent: (message: BridgeMessage) => void;
  }) {
    this.#onEvent = input.onEvent;
    this.#child = nodeChildProcess.spawn(
      input.pythonPath,
      ["-u", "-c", ANTIGRAVITY_SDK_BRIDGE_SOURCE],
      {
        cwd: input.cwd,
        env: input.env,
        stdio: "pipe",
        shell: process.platform === "win32",
      },
    );
    this.#stdout = nodeReadline.createInterface({ input: this.#child.stdout });
    this.#stdout.on("line", (line) => this.#handleStdoutLine(line));
    this.#child.stderr.on("data", (chunk: Buffer) => {
      this.#stderr = `${this.#stderr}${chunk.toString("utf8")}`.slice(-16_384);
    });
    this.#child.once("error", (error) => this.#rejectAll(error));
    this.#child.once("exit", (code, signal) => {
      this.#closed = true;
      this.#rejectAll(
        new Error(
          `Antigravity SDK bridge exited with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}${
            this.#stderr.trim() ? `: ${this.#stderr.trim()}` : ""
          }`,
        ),
      );
    });
  }

  send(request: BridgeRequest): Promise<BridgeMessage> {
    if (this.#closed || !this.#child.stdin.writable) {
      return Promise.reject(new Error("Antigravity SDK bridge is not running."));
    }
    return new Promise((resolve, reject) => {
      this.#pending.set(request.id, { resolve, reject });
      this.#child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) return;
        this.#pending.delete(request.id);
        reject(error);
      });
    });
  }

  notify(request: BridgeRequest): void {
    if (this.#closed || !this.#child.stdin.writable) return;
    this.#child.stdin.write(`${JSON.stringify(request)}\n`);
  }

  close(): void {
    if (this.#closed) return;
    this.notify({ type: "shutdown", id: "shutdown" });
    this.#child.kill("SIGTERM");
    this.#stdout.close();
  }

  #handleStdoutLine(line: string): void {
    let parsed: BridgeMessage;
    try {
      parsed = JSON.parse(line) as BridgeMessage;
    } catch {
      return;
    }

    if (parsed.type === "error" && parsed.id) {
      const pending = this.#pending.get(parsed.id);
      if (pending) {
        this.#pending.delete(parsed.id);
        pending.reject(
          new Error(parsed.detail || parsed.message || "Antigravity SDK bridge error."),
        );
        return;
      }
    }

    if (
      (parsed.type === "ready" || parsed.type === "done" || parsed.type === "cancelled") &&
      parsed.id
    ) {
      const pending = this.#pending.get(parsed.id);
      if (pending) {
        this.#pending.delete(parsed.id);
        pending.resolve(parsed);
        return;
      }
    }

    this.#onEvent(parsed);
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

export const makeAntigravitySdkAdapter = Effect.fn("makeAntigravitySdkAdapter")(function* (
  input: AntigravitySdkAdapterInput,
) {
  const runtimeEventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();
  const runtimeContext = yield* Effect.context<never>();
  const runFork = Effect.runForkWith(runtimeContext);
  const sessions = new Map<ThreadId, AntigravitySdkSession>();
  const pendingApprovals = new Map<string, AntigravitySdkSession>();
  const pendingUserInputs = new Map<string, AntigravitySdkSession>();

  const emit = (event: ProviderRuntimeEvent): void => {
    runFork(Queue.offer(runtimeEventQueue, event).pipe(Effect.ignore));
  };

  const requireSession = Effect.fn("antigravitySdk.requireSession")(function* (threadId: ThreadId) {
    const session = sessions.get(threadId);
    if (!session || session.stopped) {
      return yield* new ProviderAdapterSessionNotFoundError({
        provider: DRIVER_KIND,
        threadId,
      });
    }
    return session;
  });

  const stopSessionInternal = Effect.fn("antigravitySdk.stopSessionInternal")(function* (
    session: AntigravitySdkSession,
  ) {
    if (session.stopped) return;
    session.stopped = true;
    sessions.delete(session.threadId);
    if (session.activeTurnFiber) {
      yield* Fiber.interrupt(session.activeTurnFiber).pipe(Effect.ignoreCause);
      session.activeTurnFiber = undefined;
    }
    session.bridge.close();
    const base = yield* makeEventBase(session);
    yield* Queue.offer(runtimeEventQueue, {
      ...base,
      type: "session.exited",
      payload: { reason: "Session stopped" },
    }).pipe(Effect.ignore);
  });

  const handleBridgeEvent = (session: AntigravitySdkSession, message: BridgeMessage): void => {
    if (message.type === "content_delta" && message.delta) {
      runFork(
        Effect.gen(function* () {
          const base = yield* makeEventBase(session, session.currentTurnId);
          yield* Queue.offer(runtimeEventQueue, {
            ...base,
            type: "content.delta",
            payload: { streamKind: "assistant_text", delta: message.delta ?? "" },
          });
        }),
      );
      return;
    }

    if (message.type === "thought_delta" && message.delta) {
      runFork(
        Effect.gen(function* () {
          const base = yield* makeEventBase(session, session.currentTurnId);
          yield* Queue.offer(runtimeEventQueue, {
            ...base,
            type: "content.delta",
            payload: { streamKind: "reasoning_text", delta: message.delta ?? "" },
          });
        }),
      );
      return;
    }

    if (message.type === "tool_call") {
      runFork(
        Effect.gen(function* () {
          const itemId = message.toolCallId || `tool-${message.name ?? "unknown"}`;
          const itemType = toolNameToItemType(message.name);
          const title = message.name || "Antigravity tool";
          session.activeToolItems.set(itemId, { itemType, title });
          const base = yield* makeEventBase(session, session.currentTurnId, itemId);
          yield* Queue.offer(runtimeEventQueue, {
            ...base,
            type: "item.started",
            payload: {
              itemType,
              status: "inProgress" as const,
              title,
              data: { args: message.args },
            },
          });
        }),
      );
      return;
    }

    if (message.type === "approval_required") {
      pendingApprovals.set(message.requestId, session);
      runFork(
        Effect.gen(function* () {
          const base = yield* makeEventBase(
            session,
            session.currentTurnId,
            undefined,
            message.requestId,
          );
          yield* Queue.offer(runtimeEventQueue, {
            ...base,
            type: "request.opened",
            payload: {
              requestType: toolNameToRequestType(message.toolName),
              detail: message.toolName || "Antigravity tool request",
              args: message.args,
            },
          });
        }),
      );
      return;
    }

    if (message.type === "user_input_required") {
      pendingUserInputs.set(message.requestId, session);
      runFork(
        Effect.gen(function* () {
          const base = yield* makeEventBase(
            session,
            session.currentTurnId,
            undefined,
            message.requestId,
          );
          yield* Queue.offer(runtimeEventQueue, {
            ...base,
            type: "user-input.requested",
            payload: { questions: [...(message.questions ?? [])] },
          });
        }),
      );
    }
  };

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

      const persisted = parseAntigravitySdkResume(sessionInput.resumeCursor);
      const cwd = sessionInput.cwd ?? process.cwd();
      const configuredSaveDir = input.saveDirectory?.trim();
      const saveDir = expandUserPath(persisted.saveDir ?? (configuredSaveDir || DEFAULT_SAVE_DIR));
      const session: AntigravitySdkSession = {
        threadId: sessionInput.threadId,
        providerInstanceId: input.instanceId,
        cwd,
        bridge: undefined as unknown as AntigravitySdkBridge,
        saveDir,
        activeToolItems: new Map(),
        conversationId: persisted.conversationId,
        currentTurnId: undefined,
        activeTurnFiber: undefined,
        stopped: false,
      };
      const bridge = new AntigravitySdkBridge({
        pythonPath: input.pythonPath?.trim() || DEFAULT_PYTHON_COMMAND,
        cwd,
        env: input.environment,
        onEvent: (message) => handleBridgeEvent(session, message),
      });
      Object.assign(session, { bridge });

      const initId = `init-${yield* Random.nextUUIDv4}`;
      const ready = yield* Effect.tryPromise({
        try: () =>
          bridge.send({
            type: "init",
            id: initId,
            cwd,
            saveDir,
            conversationId: persisted.conversationId,
            model:
              sessionInput.modelSelection?.model && sessionInput.modelSelection.model !== "auto"
                ? sessionInput.modelSelection.model
                : undefined,
            apiKey: input.apiKey?.trim() || input.environment.GEMINI_API_KEY,
          }),
        catch: (cause) =>
          new ProviderAdapterProcessError({
            provider: DRIVER_KIND,
            threadId: sessionInput.threadId,
            detail:
              cause instanceof Error
                ? cause.message
                : `Failed to start Antigravity SDK bridge: ${String(cause)}`,
            cause,
          }),
      });
      if (ready.type === "ready" && ready.conversationId) {
        session.conversationId = ready.conversationId;
      }
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
        cwd,
        ...(sessionInput.modelSelection?.model ? { model: sessionInput.modelSelection.model } : {}),
        threadId: sessionInput.threadId,
        createdAt: now,
        updatedAt: now,
        resumeCursor: antigravitySdkResumeCursor(session),
      } satisfies ProviderSession;
    });

  const sendTurn: ProviderAdapterShape<ProviderAdapterError>["sendTurn"] = Effect.fn(
    "antigravitySdk.sendTurn",
  )(function* (turnInput: ProviderSendTurnInput) {
    const session = yield* requireSession(turnInput.threadId);
    const ms = yield* Clock.currentTimeMillis;
    const uuid = yield* Random.nextUUIDv4;
    const turnId = TurnIdSchema.make(`agysdk-turn-${ms}-${uuid.slice(0, 8)}`);
    session.currentTurnId = turnId;

    const prompt = buildPromptText(turnInput);
    if (!prompt) {
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
      payload: {
        ...(turnInput.modelSelection?.model ? { model: turnInput.modelSelection.model } : {}),
      },
    });

    const turnEffect = Effect.tryPromise({
      try: () =>
        session.bridge.send({
          type: "chat",
          id: `chat-${uuid}`,
          prompt,
        }),
      catch: (cause) =>
        new ProviderAdapterRequestError({
          provider: DRIVER_KIND,
          method: "antigravity-sdk/chat",
          detail:
            cause instanceof Error
              ? cause.message
              : `Antigravity SDK chat failed: ${String(cause)}`,
          cause,
        }),
    }).pipe(
      Effect.flatMap((done) =>
        Effect.gen(function* () {
          if ((done.type === "done" || done.type === "cancelled") && done.conversationId) {
            session.conversationId = done.conversationId;
          }
          for (const [itemId, item] of session.activeToolItems) {
            const itemBase = yield* makeEventBase(session, turnId, itemId);
            yield* Queue.offer(runtimeEventQueue, {
              ...itemBase,
              type: "item.completed",
              payload: {
                itemType: item.itemType,
                status: "completed" as const,
                title: item.title,
              },
            });
          }
          session.activeToolItems.clear();
          const completedBase = yield* makeEventBase(session, turnId);
          yield* Queue.offer(runtimeEventQueue, {
            ...completedBase,
            type: "turn.completed",
            payload: { state: done.type === "cancelled" ? "interrupted" : "completed" },
          });
        }),
      ),
      Effect.catch((error: ProviderAdapterRequestError) =>
        Effect.gen(function* () {
          const base = yield* makeEventBase(session, turnId);
          yield* Queue.offer(runtimeEventQueue, {
            ...base,
            type: "runtime.error",
            payload: { message: error.detail, class: "provider_error" as const },
          });
          const completedBase = yield* makeEventBase(session, turnId);
          yield* Queue.offer(runtimeEventQueue, {
            ...completedBase,
            type: "turn.completed",
            payload: { state: "completed" as const, errorMessage: error.detail },
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
      resumeCursor: antigravitySdkResumeCursor(session),
    };
  });

  const interruptTurn: ProviderAdapterShape<ProviderAdapterError>["interruptTurn"] = (threadId) =>
    requireSession(threadId).pipe(
      Effect.flatMap((session) =>
        Effect.gen(function* () {
          session.bridge.notify({ type: "cancel", id: `cancel-${yield* Random.nextUUIDv4}` });
          if (session.activeTurnFiber) {
            yield* Fiber.interrupt(session.activeTurnFiber).pipe(Effect.ignoreCause);
            session.activeTurnFiber = undefined;
          }
          // Emit a terminating turn.completed so the orchestration layer
          // reconciles the thread out of the "running" state even when the
          // agent's prompt fiber was interrupted before it could emit one.
          if (session.currentTurnId) {
            const completedBase = yield* makeEventBase(session, session.currentTurnId);
            yield* Queue.offer(runtimeEventQueue, {
              ...completedBase,
              type: "turn.completed",
              payload: { state: "interrupted" },
            });
            session.currentTurnId = undefined;
          }
        }),
      ),
    );

  const respondToRequest: ProviderAdapterShape<ProviderAdapterError>["respondToRequest"] =
    Effect.fn("antigravitySdk.respondToRequest")(function* (threadId, requestId, decision) {
      const session = yield* requireSession(threadId);
      const pendingSession = pendingApprovals.get(requestId);
      if (pendingSession !== session) {
        return yield* new ProviderAdapterRequestError({
          provider: DRIVER_KIND,
          method: "antigravity-sdk/approval",
          detail: `Unknown pending Antigravity approval request: ${requestId}`,
        });
      }
      pendingApprovals.delete(requestId);
      session.bridge.notify({
        type: "approval_response",
        id: `approval-${yield* Random.nextUUIDv4}`,
        requestId,
        allow: approvalDecisionToAllow(decision),
      });
      const base = yield* makeEventBase(session, session.currentTurnId, undefined, requestId);
      yield* Queue.offer(runtimeEventQueue, {
        ...base,
        type: "request.resolved",
        payload: {
          requestType: "unknown" as const,
          decision,
        },
      });
    });

  const respondToUserInput: ProviderAdapterShape<ProviderAdapterError>["respondToUserInput"] =
    Effect.fn("antigravitySdk.respondToUserInput")(function* (threadId, requestId, answers) {
      const session = yield* requireSession(threadId);
      const pendingSession = pendingUserInputs.get(requestId);
      if (pendingSession !== session) {
        return yield* new ProviderAdapterRequestError({
          provider: DRIVER_KIND,
          method: "antigravity-sdk/user-input",
          detail: `Unknown pending Antigravity user-input request: ${requestId}`,
        });
      }
      pendingUserInputs.delete(requestId);
      session.bridge.notify({
        type: "user_input_response",
        id: `question-${yield* Random.nextUUIDv4}`,
        requestId,
        answers: answers as Record<string, unknown>,
      });
      const base = yield* makeEventBase(session, session.currentTurnId, undefined, requestId);
      yield* Queue.offer(runtimeEventQueue, {
        ...base,
        type: "user-input.resolved",
        payload: { answers },
      });
    });

  const readThread: ProviderAdapterShape<ProviderAdapterError>["readThread"] = (threadId) =>
    requireSession(threadId).pipe(
      Effect.map((s) => ({ threadId: s.threadId, turns: [] }) satisfies ProviderThreadSnapshot),
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
    respondToRequest,
    respondToUserInput,
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
              cwd: s.cwd,
              threadId: s.threadId,
              createdAt: now,
              updatedAt: now,
              resumeCursor: antigravitySdkResumeCursor(s),
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
});
