import { issueWebSocketToken, makeWebSocketURL, getServerURLForPlatform } from "@/services/pairing";
import type { ServerConfig } from "@/types/thread";
import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type WsStatus = "offline" | "connecting" | "connected" | "error";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface StreamSubscription {
  method: string;
  payload: unknown;
  onValue: (value: unknown) => void;
}

interface WsClientContextValue {
  status: WsStatus;
  serverConfig: ServerConfig | null;
  request: (method: string, payload: unknown) => Promise<unknown>;
  subscribe: (
    method: string,
    payload: unknown,
    onValue: (value: unknown) => void,
  ) => () => void;
}

const WsClientContext = createContext<WsClientContextValue | null>(null);

function randomHex(len: number): string {
  let result = "";
  while (result.length < len) {
    result += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0");
  }
  return result.slice(0, len);
}

function makeRpcFrame(
  id: string,
  tag: string,
  payload: unknown,
): string {
  return JSON.stringify({
    _tag: "Request",
    id,
    tag,
    payload,
    headers: [],
    spanId: randomHex(16),
    traceId: randomHex(32),
    sampled: false,
  });
}

class WsRpcClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<string, PendingRequest>();
  private streams = new Map<string, StreamSubscription>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private alive = true;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_INTERVAL = 5_000; // 5 seconds
  private connectionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CONNECTION_TIMEOUT = 10_000; // 10 seconds

  constructor(
    private serverURL: string,
    private bearerToken: string,
    private onStatus: (s: WsStatus) => void,
    private onConfig: (c: ServerConfig) => void,
  ) {}

  async connect() {
    if (!this.alive) return;
    this.onStatus("connecting");
    try {
      // Use platform-specific URL for WebSocket connection
      const platformURL = getServerURLForPlatform(this.serverURL);
      const wsToken = await issueWebSocketToken(platformURL, this.bearerToken);
      if (!this.alive) return;
      const url = makeWebSocketURL(platformURL, wsToken);
      const ws = new WebSocket(url);
      this.ws = ws;

      // Set connection timeout
      this.connectionTimeoutTimer = setTimeout(() => {
        if (this.ws === ws && this.alive) {
          this.ws.close();
          this.onStatus("error");
          this.scheduleReconnect();
        }
      }, this.CONNECTION_TIMEOUT);

      ws.onopen = () => {
        if (!this.alive || this.ws !== ws) return;
        this.clearConnectionTimeout();
        this.reconnectAttempt = 0;
        this.onStatus("connected");
        this.resubscribeAll();
        this.fetchServerConfig();
        this.startHeartbeat();
      };

      ws.onmessage = (evt) => {
        if (!this.alive || this.ws !== ws) return;
        try {
          this.handleData(typeof evt.data === "string" ? evt.data : "");
        } catch {}
      };

      ws.onerror = (error) => {
        if (!this.alive || this.ws !== ws) return;
        this.clearConnectionTimeout();
        console.error("WebSocket error:", error);
        this.onStatus("error");
      };

      ws.onclose = (event) => {
        if (!this.alive) return;
        if (this.ws === ws) {
          this.clearConnectionTimeout();
          this.ws = null;
          this.stopHeartbeat();
          console.log("WebSocket closed:", {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
          this.onStatus("offline");
          this.failPending();
          // Don't clear streams on close - they should be resubscribed on reconnect
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      if (!this.alive) return;
      console.error("WebSocket connection error:", this.formatError(error));
      this.onStatus("error");
      this.scheduleReconnect();
    }
  }

  destroy() {
    this.alive = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.clearConnectionTimeout();
    this.stopHeartbeat();
    this.failPending();
    this.streams.clear(); // Clear all stream subscriptions
    this.ws?.close();
    this.ws = null;
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.alive || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }
      try {
        this.send(JSON.stringify({ _tag: "Ping" }));
      } catch {
        this.stopHeartbeat();
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleData(text: string) {
    try {
      const raw = JSON.parse(text);
      const frames = Array.isArray(raw) ? raw : [raw];
      for (const frame of frames) {
        this.handleFrame(frame);
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", this.formatError(error));
    }
  }

  private handleFrame(frame: Record<string, unknown>) {
    const tag = frame._tag as string;
    switch (tag) {
      case "Chunk": {
        const requestId = frame.requestId as string;
        const values = (frame.values as unknown[]) ?? [];
        const sub = this.streams.get(requestId);
        if (sub) {
          for (const v of values) sub.onValue(v);
          this.send(JSON.stringify({ _tag: "Ack", requestId }));
        }
        break;
      }
      case "Exit": {
        const requestId = frame.requestId as string;
        const exit = (frame.exit ?? {}) as Record<string, unknown>;
        const pend = this.pending.get(requestId);
        if (pend) {
          this.pending.delete(requestId);
          if (exit._tag === "Success") {
            pend.resolve(exit.value);
          } else {
            // Include error details in the rejection
            let errorMessage = "RPC request failed";
            
            // Handle nested error structure from Effect
            if (exit.cause && Array.isArray(exit.cause) && exit.cause.length > 0) {
              const cause = exit.cause[0] as Record<string, unknown>;
              if (cause.error && typeof cause.error === "object") {
                const errorObj = cause.error as Record<string, unknown>;
                if (typeof errorObj.detail === "string") {
                  errorMessage = errorObj.detail;
                } else if (typeof errorObj.message === "string") {
                  errorMessage = errorObj.message;
                } else {
                  errorMessage = JSON.stringify(errorObj);
                }
              }
            } else if (exit.error) {
              if (typeof exit.error === "string") {
                errorMessage = exit.error;
              } else if (exit.error instanceof Error) {
                errorMessage = exit.error.message;
              } else if (typeof exit.error === "object" && exit.error !== null) {
                // Try to extract message from error object
                const errorObj = exit.error as Record<string, unknown>;
                if (typeof errorObj.message === "string") {
                  errorMessage = errorObj.message;
                } else if (typeof errorObj.detail === "string") {
                  errorMessage = errorObj.detail;
                } else {
                  errorMessage = JSON.stringify(errorObj);
                }
              }
            }
            
            console.error("RPC request failed:", errorMessage);
            pend.reject(new Error(errorMessage));
          }
        }
        // streams: exit means the subscription ended (shouldn't happen for long-lived subs)
        this.streams.delete(requestId);
        break;
      }
      case "Ping":
        this.send(JSON.stringify({ _tag: "Pong" }));
        break;
    }
  }

  private send(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(text);
    }
  }

  private scheduleReconnect() {
    if (!this.alive) return;
    this.reconnectAttempt++;
    const delay = this.calculateBackoffDelay(this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      if (this.alive) this.connect();
    }, delay);
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponent = Math.min(attempt - 1, 6);
    const base = 1000 * Math.pow(2, exponent);
    const capped = Math.min(base, 30_000);
    const jitter = Math.random() * 400; // 0-400ms jitter to prevent thundering herd
    return capped + jitter;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name || "Unknown error";
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error";
  }

  private failPending() {
    const err = new Error("Not connected");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private resubscribeAll() {
    for (const [id, sub] of this.streams) {
      this.send(makeRpcFrame(id, sub.method, sub.payload));
    }
  }

  private async fetchServerConfig() {
    try {
      const raw = await this.request("server.getConfig", {}) as Record<string, unknown>;
      if (!raw) return;
      const cwd = (raw.cwd as string) ?? "";
      const rawProviders = (raw.providers as Record<string, unknown>[]) ?? [];
      const providers: ServerConfig["providers"] = rawProviders.map((p) => ({
        instanceId: (p.instanceId as string) ?? "",
        driver: (p.driver as string) ?? "",
        displayName: p.displayName as string | undefined,
        label: p.label as string | undefined,
        enabled: (p.enabled as boolean) ?? false,
        installed: (p.installed as boolean) ?? false,
        status: p.status as string | undefined,
        models: ((p.models as Record<string, unknown>[]) ?? []).map((m) => ({
          slug: (m.slug as string) ?? "",
          name: (m.name as string) ?? "",
          shortName: m.shortName as string | undefined,
          subProvider: m.subProvider as string | undefined,
          eligible: m.eligible as boolean | undefined,
        })),
        slashCommands: ((p.slashCommands as Record<string, unknown>[]) ?? []).map((sc) => ({
          name: (sc.name as string) ?? "",
          description: sc.description as string | undefined,
          input: (sc.input && typeof sc.input === "object") ? (sc.input as { hint?: string }) : undefined,
        })),
        skills: ((p.skills as Record<string, unknown>[]) ?? []).map((s) => ({
          name: (s.name as string) ?? "",
          description: s.description as string | undefined,
          shortDescription: s.shortDescription as string | undefined,
        })),
      }));
      this.onConfig({
        cwd,
        projectName: cwd.split("/").filter(Boolean).pop() ?? "Trifecta Server",
        providers,
      });
    } catch {}
  }

  request(method: string, payload: unknown): Promise<unknown> {
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const frame = makeRpcFrame(id, method, payload);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(frame);
      } else {
        this.pending.delete(id);
        reject(new Error("Not connected"));
      }
    });
  }

  subscribe(
    method: string,
    payload: unknown,
    onValue: (value: unknown) => void,
  ): () => void {
    const id = String(this.nextId++);
    this.streams.set(id, { method, payload, onValue });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(makeRpcFrame(id, method, payload));
    }
    return () => {
      this.streams.delete(id);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send(JSON.stringify({ _tag: "Interrupt", requestId: id, interruptors: [] }));
      }
    };
  }
}

export function WsClientProvider({
  children,
  serverURL,
  bearerToken,
}: {
  children: React.ReactNode;
  serverURL: string | null;
  bearerToken: string | null;
}) {
  const [status, setStatus] = useState<WsStatus>("offline");
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const clientRef = useRef<WsRpcClient | null>(null);

  useEffect(() => {
    if (!serverURL || !bearerToken) {
      // Use setTimeout to avoid setState in effect warning
      const timer = setTimeout(() => {
        setStatus("offline");
        setServerConfig(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    const client = new WsRpcClient(serverURL, bearerToken, setStatus, setServerConfig);
    clientRef.current = client;
    client.connect();

    return () => {
      client.destroy();
      clientRef.current = null;
    };
  }, [serverURL, bearerToken]);

  const request = useCallback(
    (method: string, payload: unknown) => {
      const client = clientRef.current;
      if (!client) return Promise.reject(new Error("Not connected"));
      return client.request(method, payload);
    },
    [],
  );

  const subscribe = useCallback(
    (
      method: string,
      payload: unknown,
      onValue: (value: unknown) => void,
    ) => {
      const client = clientRef.current;
      if (!client) return () => {};
      return client.subscribe(method, payload, onValue);
    },
    [],
  );

  return (
    <WsClientContext value={{ status, serverConfig, request, subscribe }}>
      {children}
    </WsClientContext>
  );
}

export function useWsClient() {
  const ctx = use(WsClientContext);
  if (!ctx) throw new Error("useWsClient must be used within WsClientProvider");
  return ctx;
}
