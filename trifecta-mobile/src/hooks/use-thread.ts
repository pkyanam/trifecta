import type {
  Message,
  ModelSelection,
  OrchestrationSession,
  ThreadDetail,
  ThreadId,
} from "@/types/thread";
import { useCallback, useEffect, useState } from "react";
import { useActiveThread } from "@/stores/active-thread";
import { useWsClient } from "@/stores/ws-client";

function randomId(): string {
  let result = "";
  while (result.length < 32) {
    result += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0");
  }
  return result.slice(0, 32);
}

export interface UseThreadResult {
  detail: ThreadDetail | null;
  messages: Message[];
  session: OrchestrationSession | null;
  isTurnRunning: boolean;
  isSending: boolean;
  sendMessage: (
    text: string,
    modelSelection: ModelSelection,
  ) => Promise<void>;
  interruptTurn: () => Promise<void>;
}

export function useThread(threadId: ThreadId | null): UseThreadResult {
  const { subscribe, request } = useWsClient();
  const { dispatchTurnStart } = useActiveThread();

  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<OrchestrationSession | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!threadId) {
      setDetail(null);
      setMessages([]);
      setSession(null);
      return;
    }

    setDetail(null);
    setMessages([]);
    setSession(null);

    const unsubscribe = subscribe(
      "orchestration.subscribeThread",
      { threadId },
      (value) => {
        const item = value as Record<string, unknown>;
        const kind = item.kind as string;

        if (kind === "snapshot") {
          const snap = item.snapshot as Record<string, unknown>;
          const thread = (snap.thread ?? {}) as Record<string, unknown>;
          const rawMessages = (thread.messages as Message[]) ?? [];
          const sorted = [...rawMessages].sort(
            (a, b) => (a.createdAt > b.createdAt ? 1 : -1),
          );
          setMessages(sorted);
          setSession((thread.session as OrchestrationSession) ?? null);
          setDetail(thread as unknown as ThreadDetail);
        } else if (kind === "event") {
          const event = item.event as Record<string, unknown>;
          const type = event.type as string;
          const payload = (event.payload ?? {}) as Record<string, unknown>;

          if (type === "thread.message-sent") {
            applyMessageSent(payload);
          } else if (type === "thread.session-set") {
            const sessionData = payload.session as OrchestrationSession | undefined;
            if (sessionData) setSession(sessionData);
          } else if (type === "thread.meta-updated") {
            setDetail((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                ...(payload.title != null && { title: payload.title as string }),
              };
            });
          }
        }
      },
    );

    return unsubscribe;
  }, [threadId, subscribe]);

  function applyMessageSent(fields: Record<string, unknown>) {
    // Merge top-level fields with nested message object
    const inner = (fields.message ?? {}) as Record<string, unknown>;
    const merged = { ...fields, ...inner };

    const msgId = (merged.messageId ?? merged.id) as string | undefined;
    const role = merged.role as string | undefined;
    if (!msgId || !role) return;

    const payloadText = (merged.text as string) ?? "";
    const streaming = (merged.streaming as boolean) ?? false;
    const createdAt = (merged.createdAt as string) ?? new Date().toISOString();
    const updatedAt = (merged.updatedAt as string) ?? createdAt;
    const turnId = merged.turnId as string | undefined;

    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx >= 0) {
        const updated = [...prev];
        const existing = updated[idx];
        updated[idx] = {
          ...existing,
          // streaming=true → delta append; streaming=false + text → replace; streaming=false + no text → keep accumulated
          text: streaming
            ? existing.text + payloadText
            : payloadText || existing.text,
          streaming,
          updatedAt,
        };
        return updated;
      } else {
        const msg: Message = {
          id: msgId,
          role: role as Message["role"],
          text: payloadText,
          streaming,
          turnId,
          createdAt,
          updatedAt,
        };
        const next = [...prev, msg].sort(
          (a, b) => (a.createdAt > b.createdAt ? 1 : -1),
        );
        return next;
      }
    });
  }

  const sendMessage = useCallback(
    async (text: string, modelSelection: ModelSelection) => {
      if (!threadId || !text.trim()) return;
      setIsSending(true);
      try {
        await dispatchTurnStart(threadId, text, modelSelection);
      } finally {
        setIsSending(false);
      }
    },
    [threadId, dispatchTurnStart],
  );

  const interruptTurn = useCallback(async () => {
    if (!threadId) return;
    try {
      await request("orchestration.dispatchCommand", {
        type: "thread.turn.interrupt",
        commandId: randomId(),
        threadId,
        createdAt: new Date().toISOString(),
      });
    } catch {}
  }, [threadId, request]);

  const isTurnRunning =
    session?.status === "running" ||
    detail?.latestTurn?.state === "running" ||
    isSending;

  return { detail, messages, session, isTurnRunning, isSending, sendMessage, interruptTurn };
}
