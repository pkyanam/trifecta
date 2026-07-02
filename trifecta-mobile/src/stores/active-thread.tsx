import type { ModelSelection, ThreadId } from "@/types/thread";
import { secureRandomId } from "@/utils/secure-id";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useWsClient } from "./ws-client";

interface ActiveThreadContextValue {
  activeThreadId: ThreadId | null;
  activeThreadHydrated: boolean;
  /** True when user explicitly started a new chat (composer shows, no redirect to /chats) */
  newChatMode: boolean;
  /** Project ID to create new thread under */
  newChatProjectId: string | null;
  setActiveThreadId: (id: ThreadId | null) => void;
  /** Switch to a new empty chat for the given project */
  startNewChat: (projectId?: string | null) => void;
  /** Clear all thread state (called on manual disconnect) */
  clearThreadState: () => void;
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
const ACTIVE_THREAD_KEY = "trifecta.activeThreadId";
const LEGACY_ACTIVE_THREAD_KEY = "trifecta_active_thread_id";

function nowISO(): string {
  return new Date().toISOString();
}

export function ActiveThreadProvider({ children }: { children: React.ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<ThreadId | null>(null);
  const [activeThreadHydrated, setActiveThreadHydrated] = useState(false);
  const [newChatMode, setNewChatMode] = useState(false);
  const [newChatProjectId, setNewChatProjectId] = useState<string | null>(null);
  const { request } = useWsClient();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      SecureStore.getItemAsync(ACTIVE_THREAD_KEY),
      SecureStore.getItemAsync(LEGACY_ACTIVE_THREAD_KEY),
    ])
      .then((storedThreadId) => {
        if (cancelled) return;
        const [currentKeyThreadId, legacyKeyThreadId] = storedThreadId;
        const restoredThreadId = currentKeyThreadId ?? legacyKeyThreadId;
        if (restoredThreadId) {
          setActiveThreadId(restoredThreadId);
        }
      })
      .catch((error) => {
        console.warn("Failed to restore active thread:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setActiveThreadHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persistActiveThreadId = useCallback((id: ThreadId | null) => {
    if (id) {
      void SecureStore.setItemAsync(ACTIVE_THREAD_KEY, id).catch((error) => {
        console.warn("Failed to persist active thread:", error);
      });
      void SecureStore.setItemAsync(LEGACY_ACTIVE_THREAD_KEY, id).catch(() => {});
    } else {
      void SecureStore.deleteItemAsync(ACTIVE_THREAD_KEY).catch((error) => {
        console.warn("Failed to clear active thread:", error);
      });
      void SecureStore.deleteItemAsync(LEGACY_ACTIVE_THREAD_KEY).catch(() => {});
    }
  }, []);

  const startNewChat = useCallback((projectId?: string | null) => {
    setActiveThreadId(null);
    persistActiveThreadId(null);
    setNewChatProjectId(projectId ?? null);
    setNewChatMode(true);
  }, [persistActiveThreadId]);

  const dispatchTurnStart = useCallback(
    async (
      threadId: ThreadId,
      text: string,
      modelSelection: ModelSelection,
      runtimeMode = "full-access",
      interactionMode = "default",
    ) => {
      const payload: Record<string, unknown> = {
        type: "thread.turn.start",
        commandId: secureRandomId(),
        threadId,
        message: {
          messageId: secureRandomId(),
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
    [request],
  );

  const createThread = useCallback(
    async (
      projectId: string,
      text: string,
      modelSelection: ModelSelection,
      runtimeMode = "full-access",
      interactionMode = "default",
    ): Promise<ThreadId> => {
      const threadId = secureRandomId();
      const now = nowISO();
      const titleSeed = text.slice(0, 80).trim();

      const payload: Record<string, unknown> = {
        type: "thread.turn.start",
        commandId: secureRandomId(),
        threadId,
        message: {
          messageId: secureRandomId(),
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
      persistActiveThreadId(threadId);
      setNewChatMode(false);
      setNewChatProjectId(null);
      return threadId;
    },
    [persistActiveThreadId, request],
  );

  const handleSetActiveThreadId = useCallback((id: ThreadId | null) => {
    setActiveThreadId(id);
    persistActiveThreadId(id);
    if (id !== null) {
      setNewChatMode(false);
      setNewChatProjectId(null);
    }
  }, [persistActiveThreadId]);

  const clearThreadState = useCallback(() => {
    setActiveThreadId(null);
    persistActiveThreadId(null);
    setNewChatMode(false);
    setNewChatProjectId(null);
  }, [persistActiveThreadId]);

  return (
    <ActiveThreadContext
      value={{
        activeThreadId,
        activeThreadHydrated,
        newChatMode,
        newChatProjectId,
        setActiveThreadId: handleSetActiveThreadId,
        startNewChat,
        clearThreadState,
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
