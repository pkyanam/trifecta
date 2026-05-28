import type {
  SshConfirmHostKeyInput,
  SshHostProfile,
  SshHostProfileCreateInput,
  SshHostProfileList,
  SshHostProfileRemoveInput,
  SshHostProfileUpdateInput,
  SshIssueSessionTokenInput,
  SshIssueSessionTokenResult,
  SshOpenSessionInput,
  SshOpenSessionResult,
  SshResizeInput,
  SshSendInputInput,
  SshSessionInput,
  SshSessionSnapshot,
  SshTerminalEvent,
} from "@/types/ssh";
import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useWsClient } from "./ws-client";

interface SshContextValue {
  hosts: SshHostProfile[];
  activeSession: SshSessionSnapshot | null;
  terminalEvents: SshTerminalEvent[];
  isLoadingHosts: boolean;
  isLoadingSession: boolean;
  error: string | null;
  listHosts: () => Promise<void>;
  addHost: (input: SshHostProfileCreateInput) => Promise<SshHostProfile>;
  removeHost: (input: SshHostProfileRemoveInput) => Promise<void>;
  updateHost: (input: SshHostProfileUpdateInput) => Promise<SshHostProfile>;
  openSession: (input: SshOpenSessionInput) => Promise<SshOpenSessionResult>;
  getSession: (input: SshSessionInput) => Promise<SshSessionSnapshot>;
  sendInput: (input: SshSendInputInput) => Promise<void>;
  resize: (input: SshResizeInput) => Promise<void>;
  confirmHostKey: (input: SshConfirmHostKeyInput) => Promise<SshSessionSnapshot>;
  closeSession: (input: SshSessionInput) => Promise<void>;
  issueSessionToken: (input: SshIssueSessionTokenInput) => Promise<SshIssueSessionTokenResult>;
  clearError: () => void;
}

const SshContext = createContext<SshContextValue | null>(null);

export function SshProvider({ children }: { children: React.ReactNode }) {
  const { request, subscribe } = useWsClient();
  const [hosts, setHosts] = useState<SshHostProfile[]>([]);
  const [activeSession, setActiveSession] = useState<SshSessionSnapshot | null>(null);
  const [terminalEvents, setTerminalEvents] = useState<SshTerminalEvent[]>([]);
  const [isLoadingHosts, setIsLoadingHosts] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to SSH terminal events for the active session.
  //
  // IMPORTANT: depend on the *sessionId*, not the whole `activeSession` object.
  // The callback below calls setActiveSession on every "status" event; if this
  // effect depended on `activeSession` it would unsubscribe + re-subscribe on
  // each status update, and the server replays its buffered output on every
  // (re)subscribe — producing the duplicate "Last login" flood and an unstable
  // stream. Keying on the stable sessionId subscribes exactly once per session.
  const activeSessionId = activeSession?.sessionId;
  useEffect(() => {
    if (!activeSessionId) return;

    const unsubscribe = subscribe(
      // Streaming subscriptions use bare method names (no "ssh." prefix) on the
      // server — see WS_METHODS.subscribeSshTerminal in @belweave/contracts.
      "subscribeSshTerminal",
      { sessionId: activeSessionId },
      (value) => {
        const event = value as SshTerminalEvent;
        setTerminalEvents((prev) => {
          // Keep a bounded buffer to avoid unbounded memory growth. Consumers
          // de-duplicate by event identity, so this window only needs to be
          // large enough to absorb bursts between renders.
          const newEvents = [...prev, event];
          if (newEvents.length > 500) {
            return newEvents.slice(-500);
          }
          return newEvents;
        });

        // Update session status display. Safe now that the subscription is
        // keyed on sessionId (this no longer re-triggers the effect).
        if (event.type === "status") {
          setActiveSession(event.snapshot);
        }
      },
    );

    return unsubscribe;
  }, [activeSessionId, subscribe]);

  const listHosts = useCallback(async () => {
    setIsLoadingHosts(true);
    setError(null);
    try {
      const result = await request("ssh.listHosts", {}) as SshHostProfileList;
      setHosts(result.hosts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list SSH hosts";
      setError(message);
      console.error("[SSH] List hosts error:", err);
    } finally {
      setIsLoadingHosts(false);
    }
  }, [request]);

  const addHost = useCallback(async (input: SshHostProfileCreateInput) => {
    setError(null);
    try {
      const host = await request("ssh.addHost", input) as SshHostProfile;
      setHosts((prev) => [...prev, host]);
      return host;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add SSH host";
      setError(message);
      console.error("[SSH] Add host error:", err);
      throw err;
    }
  }, [request]);

  const removeHost = useCallback(async (input: SshHostProfileRemoveInput) => {
    setError(null);
    try {
      await request("ssh.removeHost", input);
      setHosts((prev) => prev.filter((h) => h.id !== input.hostId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove SSH host";
      setError(message);
      console.error("[SSH] Remove host error:", err);
      throw err;
    }
  }, [request]);

  const updateHost = useCallback(async (input: SshHostProfileUpdateInput) => {
    setError(null);
    try {
      const host = await request("ssh.updateHost", input) as SshHostProfile;
      setHosts((prev) => prev.map((h) => h.id === input.hostId ? host : h));
      return host;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update SSH host";
      setError(message);
      console.error("[SSH] Update host error:", err);
      throw err;
    }
  }, [request]);

  const openSession = useCallback(async (input: SshOpenSessionInput) => {
    setIsLoadingSession(true);
    setError(null);
    setTerminalEvents([]); // Clear previous terminal events
    setActiveSession(null); // Clear previous session
    try {
      console.log("[SSH Store] Opening SSH session with input:", input);
      const result = await request("ssh.openSession", input) as SshOpenSessionResult;
      console.log("[SSH Store] SSH session opened successfully:", result.snapshot);
      setActiveSession(result.snapshot);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open SSH session";
      setError(message);
      console.error("[SSH] Open session error:", err);
      throw err;
    } finally {
      setIsLoadingSession(false);
    }
  }, [request]);

  const getSession = useCallback(async (input: SshSessionInput) => {
    setError(null);
    try {
      const session = await request("ssh.getSession", input) as SshSessionSnapshot;
      setActiveSession(session);
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get SSH session";
      setError(message);
      console.error("[SSH] Get session error:", err);
      throw err;
    }
  }, [request]);

  const sendInput = useCallback(async (input: SshSendInputInput) => {
    setError(null);
    try {
      await request("ssh.sendInput", input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send SSH input";
      setError(message);
      console.error("[SSH] Send input error:", err);
      throw err;
    }
  }, [request]);

  const resize = useCallback(async (input: SshResizeInput) => {
    setError(null);
    try {
      await request("ssh.resize", input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resize SSH session";
      setError(message);
      console.error("[SSH] Resize error:", err);
      throw err;
    }
  }, [request]);

  const confirmHostKey = useCallback(async (input: SshConfirmHostKeyInput) => {
    setError(null);
    try {
      const session = await request("ssh.confirmHostKey", input) as SshSessionSnapshot;
      setActiveSession(session);
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to confirm host key";
      setError(message);
      console.error("[SSH] Confirm host key error:", err);
      throw err;
    }
  }, [request]);

  const closeSession = useCallback(async (input: SshSessionInput) => {
    setError(null);
    try {
      await request("ssh.closeSession", input);
      setActiveSession(null);
      setTerminalEvents([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to close SSH session";
      setError(message);
      console.error("[SSH] Close session error:", err);
      throw err;
    }
  }, [request]);

  const issueSessionToken = useCallback(async (input: SshIssueSessionTokenInput) => {
    setError(null);
    try {
      const result = await request("ssh.issueSessionToken", input) as SshIssueSessionTokenResult;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to issue session token";
      setError(message);
      console.error("[SSH] Issue session token error:", err);
      throw err;
    }
  }, [request]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <SshContext
      value={{
        hosts,
        activeSession,
        terminalEvents,
        isLoadingHosts,
        isLoadingSession,
        error,
        listHosts,
        addHost,
        removeHost,
        updateHost,
        openSession,
        getSession,
        sendInput,
        resize,
        confirmHostKey,
        closeSession,
        issueSessionToken,
        clearError,
      }}
    >
      {children}
    </SshContext>
  );
}

export function useSsh() {
  const context = use(SshContext);
  if (!context) throw new Error("useSsh must be used within SshProvider");
  return context;
}
