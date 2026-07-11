import { useActiveThread } from "@/stores/active-thread";
import { useWsClient } from "@/stores/ws-client";
import { secureRandomId } from "@/utils/secure-id";
import type {
  CheckpointSummary,
  Message,
  ModelSelection,
  OrchestrationSession,
  ProposedPlan,
  ThreadActivity,
  ThreadDetail,
  ThreadId,
  UploadChatAttachment,
} from "@/types/thread";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseThreadResult {
  detail: ThreadDetail | null;
  messages: Message[];
  session: OrchestrationSession | null;
  isTurnRunning: boolean;
  isSending: boolean;
  error: string | null;
  sendMessage: (
    text: string,
    modelSelection: ModelSelection,
    attachments?: UploadChatAttachment[],
  ) => Promise<void>;
  interruptTurn: () => Promise<void>;
}

function byCreatedAt<T extends { createdAt: string; id: string }>(a: T, b: T) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = { ...next[index], ...item };
  return next;
}

function normalizeThread(raw: Record<string, unknown>): ThreadDetail {
  return {
    ...(raw as unknown as ThreadDetail),
    branch: typeof raw.branch === "string" ? raw.branch : null,
    worktreePath:
      typeof raw.worktreePath === "string" ? raw.worktreePath : null,
    latestTurn: (raw.latestTurn as ThreadDetail["latestTurn"]) ?? null,
    archivedAt: typeof raw.archivedAt === "string" ? raw.archivedAt : null,
    deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : null,
    messages: Array.isArray(raw.messages)
      ? ([...raw.messages] as Message[]).sort(byCreatedAt)
      : [],
    proposedPlans: Array.isArray(raw.proposedPlans)
      ? (raw.proposedPlans as ProposedPlan[])
      : [],
    activities: Array.isArray(raw.activities)
      ? (raw.activities as ThreadActivity[])
      : [],
    checkpoints: Array.isArray(raw.checkpoints)
      ? (raw.checkpoints as CheckpointSummary[])
      : [],
    session: (raw.session as OrchestrationSession) ?? null,
  };
}

function reduceEvent(
  thread: ThreadDetail,
  event: Record<string, unknown>,
): ThreadDetail | null {
  const type = event.type;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "thread.deleted":
      return null;
    case "thread.archived":
      return {
        ...thread,
        archivedAt: payload.archivedAt as string,
        updatedAt: (payload.updatedAt as string) ?? thread.updatedAt,
      };
    case "thread.unarchived":
      return {
        ...thread,
        archivedAt: null,
        updatedAt: (payload.updatedAt as string) ?? thread.updatedAt,
      };
    case "thread.meta-updated":
      return {
        ...thread,
        ...(typeof payload.title === "string" ? { title: payload.title } : {}),
        ...(payload.modelSelection
          ? { modelSelection: payload.modelSelection as ModelSelection }
          : {}),
        ...(Object.hasOwn(payload, "branch")
          ? { branch: (payload.branch as string | null) ?? null }
          : {}),
        ...(Object.hasOwn(payload, "worktreePath")
          ? { worktreePath: (payload.worktreePath as string | null) ?? null }
          : {}),
        updatedAt: (payload.updatedAt as string) ?? thread.updatedAt,
      };
    case "thread.runtime-mode-set":
      return {
        ...thread,
        runtimeMode: payload.runtimeMode as ThreadDetail["runtimeMode"],
        updatedAt: (payload.updatedAt as string) ?? thread.updatedAt,
      };
    case "thread.interaction-mode-set":
      return {
        ...thread,
        interactionMode:
          payload.interactionMode as ThreadDetail["interactionMode"],
        updatedAt: (payload.updatedAt as string) ?? thread.updatedAt,
      };
    case "thread.message-sent": {
      const message: Message = {
        id: payload.messageId as string,
        role: payload.role as Message["role"],
        text: (payload.text as string) ?? "",
        attachments: Array.isArray(payload.attachments)
          ? (payload.attachments as Message["attachments"])
          : undefined,
        turnId: (payload.turnId as string | null) ?? null,
        streaming: payload.streaming === true,
        createdAt: payload.createdAt as string,
        updatedAt: payload.updatedAt as string,
      };
      const existing = thread.messages.find((item) => item.id === message.id);
      if (existing && message.streaming) {
        message.text = existing.text + message.text;
      } else if (existing && !message.text) {
        message.text = existing.text;
      }
      return {
        ...thread,
        messages: upsert(thread.messages, message).sort(byCreatedAt),
      };
    }
    case "thread.session-set":
      {
        const session = payload.session as OrchestrationSession;
        const latestTurn =
          session.activeTurnId &&
          (!thread.latestTurn || thread.latestTurn.turnId !== session.activeTurnId)
            ? {
                turnId: session.activeTurnId,
                state: "running" as const,
                requestedAt: session.updatedAt,
                startedAt: session.updatedAt,
                completedAt: null,
                assistantMessageId: null,
              }
            : thread.latestTurn && session.status !== "running" && thread.latestTurn.state === "running"
              ? {
                  ...thread.latestTurn,
                  state: session.status === "error" ? ("error" as const) : ("completed" as const),
                  completedAt: session.updatedAt,
                }
              : thread.latestTurn;
        return {
        ...thread,
          session,
          latestTurn,
        };
      }
    case "thread.proposed-plan-upserted": {
      const proposedPlan = payload.proposedPlan as ProposedPlan;
      return {
        ...thread,
        proposedPlans: upsert(thread.proposedPlans, proposedPlan),
      };
    }
    case "thread.turn-diff-completed": {
      const checkpoint: CheckpointSummary = {
        turnId: payload.turnId as string,
        checkpointTurnCount: payload.checkpointTurnCount as number,
        checkpointRef: payload.checkpointRef as string,
        status: payload.status as CheckpointSummary["status"],
        files: (payload.files as CheckpointSummary["files"]) ?? [],
        assistantMessageId: (payload.assistantMessageId as string | null) ?? null,
        completedAt: payload.completedAt as string,
      };
      const index = thread.checkpoints.findIndex(
        (item) => item.turnId === checkpoint.turnId,
      );
      const checkpoints = [...thread.checkpoints];
      if (index < 0) checkpoints.push(checkpoint);
      else checkpoints[index] = checkpoint;
      return {
        ...thread,
        checkpoints,
        latestTurn:
          thread.latestTurn?.turnId === checkpoint.turnId
            ? {
                ...thread.latestTurn,
                state: "completed",
                completedAt: checkpoint.completedAt,
                assistantMessageId: checkpoint.assistantMessageId,
              }
            : thread.latestTurn,
      };
    }
    case "thread.activity-appended": {
      const activity = payload.activity as ThreadActivity;
      return { ...thread, activities: upsert(thread.activities, activity) };
    }
    case "thread.reverted": {
      const turnCount = payload.turnCount as number;
      const retainedTurnIds = new Set(
        thread.checkpoints
          .filter((checkpoint) => checkpoint.checkpointTurnCount <= turnCount)
          .map((checkpoint) => checkpoint.turnId),
      );
      return {
        ...thread,
        messages: thread.messages.filter(
          (message) => message.turnId === null || retainedTurnIds.has(message.turnId),
        ),
        activities: thread.activities.filter(
          (activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId),
        ),
        proposedPlans: thread.proposedPlans.filter(
          (plan) => plan.turnId === null || retainedTurnIds.has(plan.turnId),
        ),
        checkpoints: thread.checkpoints.filter(
          (checkpoint) => checkpoint.checkpointTurnCount <= turnCount,
        ),
      };
    }
    default:
      return thread;
  }
}

export function useThread(threadId: ThreadId | null): UseThreadResult {
  const { subscribe, request } = useWsClient();
  const { dispatchTurnStart } = useActiveThread();
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!threadId) return;
    return subscribe("orchestration.subscribeThread", { threadId }, (value) => {
      if (generation !== generationRef.current) return;
      const item = value as Record<string, unknown>;
      if (item.kind === "snapshot") {
        const snapshot = item.snapshot as Record<string, unknown>;
        const raw = snapshot.thread as Record<string, unknown>;
        setDetail(normalizeThread(raw));
      } else if (item.kind === "event") {
        const event = item.event as Record<string, unknown>;
        setDetail((current) => (current ? reduceEvent(current, event) : current));
      }
    });
  }, [threadId, subscribe]);

  const sendMessage = useCallback(
    async (
      text: string,
      modelSelection: ModelSelection,
      attachments: UploadChatAttachment[] = [],
    ) => {
      if (!threadId || (!text.trim() && attachments.length === 0)) return;
      setIsSending(true);
      setError(null);
      try {
        await dispatchTurnStart(
          threadId,
          text,
          modelSelection,
          detail?.runtimeMode,
          detail?.interactionMode,
          attachments,
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to send message");
        throw cause;
      } finally {
        setIsSending(false);
      }
    },
    [detail, dispatchTurnStart, threadId],
  );

  const interruptTurn = useCallback(async () => {
    if (!threadId) return;
    await request("orchestration.dispatchCommand", {
      type: "thread.turn.interrupt",
      commandId: secureRandomId(),
      threadId,
      ...(detail?.latestTurn?.turnId
        ? { turnId: detail.latestTurn.turnId }
        : {}),
      createdAt: new Date().toISOString(),
    });
  }, [detail, request, threadId]);

  const messages = detail?.messages ?? [];
  const session = detail?.session ?? null;
  const isTurnRunning =
    session?.status === "running" ||
    detail?.latestTurn?.state === "running" ||
    isSending;

  return {
    detail,
    messages,
    session,
    isTurnRunning,
    isSending,
    error,
    sendMessage,
    interruptTurn,
  };
}
