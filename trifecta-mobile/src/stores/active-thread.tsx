import type { ModelSelection, ThreadId } from "@/types/thread";
import React, { createContext, use, useCallback, useState, useEffect } from "react";
import { useWsClient } from "./ws-client";
import * as SecureStore from "expo-secure-store";

interface ActiveThreadContextValue {
  activeThreadId: ThreadId | null;
  /** True when user explicitly started a new chat (composer shows, no redirect to /chats) */
  newChatMode: boolean;
  /** Project ID to create new thread under */
  newChatProjectId: string | null;
  setActiveThreadId: (id: ThreadId | null) => void;
  /** Switch to a new empty chat for the given project */
  startNewChat: (projectId?: string | null) => void;
  createThread: (
    projectId: string,
    text: string,
    modelSelection: ModelSelection,
  ) => Promise<ThreadId>;
  dispatchTurnStart: (
    threadId: ThreadId,
    text: string,
    modelSelection: ModelSelection,
    runtimeMode?: string,
    interactionMode?: string,
  ) => Promise<void>;
}

const ActiveThreadContext = createContext<ActiveThreadContextValue | null>(null);
const THREAD_ID_KEY = "trifecta_active_thread_id";

function randomId(): string {
  let result = "";
  while (result.length < 32) {
    result += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0");
  }
  return result.slice(0, 32);
}

function nowISO(): string {
  return new Date().toISOString();
}

export function ActiveThreadProvider({ children }: { children: React.ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<ThreadId | null>(null);
  const [newChatMode, setNewChatMode] = useState(false);
  const [newChatProjectId, setNewChatProjectId] = useState<string | null>(null);
  const { request, status } = useWsClient();

  // Persist active thread ID to survive connection drops
  useEffect(() => {
    async function load() {
      try {
        const saved = await SecureStore.getItemAsync(THREAD_ID_KEY);
        if (saved) {
          setActiveThreadId(saved as ThreadId);
        }
      } catch {}
    }
    load();
  }, []);

  useEffect(() => {
    async function save() {
      try {
        if (activeThreadId) {
          await SecureStore.setItemAsync(THREAD_ID_KEY, activeThreadId);
        } else {
          await SecureStore.deleteItemAsync(THREAD_ID_KEY);
        }
      } catch {}
    }
    save();
  }, [activeThreadId]);

  const startNewChat = useCallback((projectId?: string | null) => {
    setActiveThreadId(null);
    setNewChatProjectId(projectId ?? null);
    setNewChatMode(true);
  }, []);

  const dispatchTurnStart = useCallback(
    async (
      threadId: ThreadId,
      text: string,
      modelSelection: ModelSelection,
      runtimeMode = "full-access",
      interactionMode = "default",
    ) => {
      // Don't attempt to dispatch if not connected
      if (status !== "connected") {
        console.warn("Cannot dispatch turn - not connected");
        return;
      }
      
      const payload: Record<string, unknown> = {
        type: "thread.turn.start",
        commandId: randomId(),
        threadId,
        message: {
          messageId: randomId(),
          role: "user",
          text,
          attachments: [],
        },
        modelSelection,
        runtimeMode,
        interactionMode,
        createdAt: nowISO(),
      };
      await request("orchestration.dispatchCommand", payload);
    },
    [request, status],
  );

  const createThread = useCallback(
    async (
      projectId: string,
      text: string,
      modelSelection: ModelSelection,
      runtimeMode = "full-access",
      interactionMode = "default",
    ): Promise<ThreadId> => {
      // Don't attempt to create thread if not connected
      if (status !== "connected") {
        console.warn("Cannot create thread - not connected");
        throw new Error("Not connected");
      }
      
      const threadId = randomId();
      const now = nowISO();
      const titleSeed = text.slice(0, 80).trim();

      const payload: Record<string, unknown> = {
        type: "thread.turn.start",
        commandId: randomId(),
        threadId,
        message: {
          messageId: randomId(),
          role: "user",
          text,
          attachments: [],
        },
        modelSelection,
        titleSeed,
        runtimeMode,
        interactionMode,
        bootstrap: {
          createThread: {
            projectId,
            title: titleSeed,
            modelSelection,
            runtimeMode,
            interactionMode,
            branch: null,
            worktreePath: null,
            createdAt: now,
          },
        },
        createdAt: now,
      };

      await request("orchestration.dispatchCommand", payload);
      setActiveThreadId(threadId);
      setNewChatMode(false);
      setNewChatProjectId(null);
      return threadId;
    },
    [request, status],
  );

  const handleSetActiveThreadId = useCallback((id: ThreadId | null) => {
    setActiveThreadId(id);
    if (id !== null) {
      setNewChatMode(false);
      setNewChatProjectId(null);
    }
  }, []);

  return (
    <ActiveThreadContext
      value={{
        activeThreadId,
        newChatMode,
        newChatProjectId,
        setActiveThreadId: handleSetActiveThreadId,
        startNewChat,
        createThread,
        dispatchTurnStart,
      }}
    >
      {children}
    </ActiveThreadContext>
  );
}

export function useActiveThread() {
  const ctx = use(ActiveThreadContext);
  if (!ctx)
    throw new Error("useActiveThread must be used within ActiveThreadProvider");
  return ctx;
}
