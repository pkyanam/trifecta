import {
  getBoxPortAuth,
  issueWebSocketToken,
  makeWebSocketURL,
  getServerURLForPlatform,
  primeBoxPortAuth,
  xhrFetch,
  type ServerFlavor,
} from "@/services/pairing";
import { secureRandomHex } from "@/utils/secure-id";
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
  /** Force an immediate reconnect (resets backoff). */
  reconnect: () => void;
}

const WsClientContext = createContext<WsClientContextValue | null>(null);

function randomHex(len: number): string {
  return secureRandomHex(len);
}

// Dev-only debug log. Stripped from production builds by the bundler when
// __DEV__ is false, preventing sensitive WebSocket payloads from being
// logged in production.
const devLog = (...args: unknown[]) => {
  if (__DEV__) console.log(...args);
};

type WebSocketWithHeadersConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

function makeWebSocket(url: string, serverURL: string): WebSocket {
  const auth = getBoxPortAuth(serverURL);
  console.log("[ws] makeWebSocket url:", url, "serverURL:", serverURL, "boxAuthFound:", !!auth, "cookieHeader(first20):", auth ? auth.cookieHeader.slice(0, 20) : "(none)");
  // Don't pass Cookie header manually — the native WebSocket module
  // (RCTWebSocketModule.mm) already reads from NSHTTPCookieStorage.shared
  // and sets the Cookie header. Passing it manually would create a duplicate
  // header (addValue:forHTTPHeaderField: appends with comma, not semicolon),
  // which Caddy rejects with 403.
  // The cookie is primed by primeBoxPortAuth() via XHR → NSURLSession →
  // NSHTTPCookieStorage.shared, which the WebSocket module reads from.
  if (!auth) return new WebSocket(url);
  return new WebSocket(url);
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
  private readonly REQUEST_TIMEOUT = 30_000; // 30 seconds

  constructor(
    private serverURL: string,
    private bearerToken: string,
    private flavor: ServerFlavor,
    private onStatus: (s: WsStatus) => void,
    private onConfig: (c: ServerConfig) => void,
  ) {}

  async connect() {
    if (!this.alive) return;
    this.onStatus("connecting");
    try {
      // Use platform-specific URL for WebSocket connection
      const platformURL = getServerURLForPlatform(this.serverURL);
      console.log("[ws] connect platformURL:", platformURL);
      // Prime the native cookie store with the Box _port_auth cookie.
      // The Box gateway (Caddy) sets the cookie via Set-Cookie when _token
      // is in the URL. This ensures the WebSocket upgrade — which uses the
      // native cookie store on iOS (SocketRocket) and Android (OkHttp) —
      // includes the _port_auth cookie automatically, without relying on
      // custom header forwarding which is unreliable across RN versions.
      console.log("[ws] before primeBoxPortAuth");
      await primeBoxPortAuth(platformURL);
      console.log("[ws] after primeBoxPortAuth");
      // Diagnostic: verify the cookie was stored by making a test XHR to
      // the well-known endpoint WITHOUT _token. If the cookie is in the
      // store, this should return 200 (cookie sent automatically by
      // NSURLSession). If not, it returns 403.
      if (getBoxPortAuth(platformURL)) {
        try {
          const testUrl = new URL(platformURL);
          testUrl.pathname = "/.well-known/belweave/environment";
          testUrl.searchParams.delete("_token");
          const testRes = await xhrFetch(testUrl.toString());
          console.log("[ws] cookie store test: status", testRes.status, testRes.ok ? "(cookie works!)" : "(cookie missing?)");
        } catch (e) {
          console.log("[ws] cookie store test error:", e);
        }
      }
      if (!this.alive) return;
      const wsToken = await issueWebSocketToken(platformURL, this.bearerToken, this.flavor);
      console.log("[ws] wsToken(first8):", wsToken ? wsToken.slice(0, 8) : "(empty)");
      if (!this.alive) return;
      const url = makeWebSocketURL(platformURL, wsToken, this.flavor);
      console.log("[ws] final WS URL from makeWebSocketURL:", url);
      const ws = makeWebSocket(url, platformURL);
      this.ws = ws;

      // Set connection timeout
      this.connectionTimeoutTimer = setTimeout(() => {
        console.log("[ws] connection timeout fired");
        if (this.ws === ws && this.alive) {
          this.ws.close();
          this.onStatus("error");
          this.scheduleReconnect();
        }
      }, this.CONNECTION_TIMEOUT);

      ws.onopen = () => {
        console.log("[ws] onopen fired");
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
        console.log("[ws] onerror fired, error:", error, "type:", typeof error, "detail:", (error as any)?.message ?? (error as any)?.error?.message ?? "(no message)");
        if (!this.alive || this.ws !== ws) return;
        this.clearConnectionTimeout();
        console.error("WebSocket error:", error);
        this.onStatus("error");
        // Close the socket on error so onclose fires and schedules a
        // reconnect. Without this, SocketRocket can leave the socket in
        // a half-open state where neither onopen nor onclose fires,
        // causing the client to stay stuck in "error" forever.
        try { ws.close(); } catch {}
      };

      ws.onclose = (event) => {
        console.log("[ws] onclose fired, code:", event.code, "reason:", event.reason, "wasClean:", event.wasClean);
        if (!this.alive) return;
        if (this.ws === ws) {
          this.clearConnectionTimeout();
          this.ws = null;
          this.stopHeartbeat();
          devLog("WebSocket closed:", {
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

  /**
   * Force an immediate reconnect: tear down the current socket, reset the
   * backoff counter, and initiate a fresh connection. Safe to call when
   * already connected (will reconnect) or when offline/error.
   */
  reconnect() {
    if (!this.alive) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearConnectionTimeout();
    this.stopHeartbeat();
    this.failPending();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.reconnectAttempt = 0;
    this.connect();
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
    devLog("[WS Client] Received frame:", tag, frame);
    switch (tag) {
      case "Chunk": {
        const requestId = frame.requestId as string;
        const values = (frame.values as unknown[]) ?? [];
        devLog("[WS Client] Chunk for requestId:", requestId, "values:", values);
        const sub = this.streams.get(requestId);
        if (sub) {
          devLog("[WS Client] Found subscription for requestId:", requestId, "method:", sub.method);
          // Clear timeout on first chunk received
          if ((sub as any).timeout) {
            clearTimeout((sub as any).timeout);
            (sub as any).timeout = null;
          }
          for (const v of values) sub.onValue(v);
          this.send(JSON.stringify({ _tag: "Ack", requestId }));
        } else {
          devLog("[WS Client] No subscription found for requestId:", requestId);
        }
        break;
      }
      case "Exit": {
        const requestId = frame.requestId as string;
        const exit = (frame.exit ?? {}) as Record<string, unknown>;
        devLog("[WS Client] Exit for requestId:", requestId, "exit:", exit);
        const pend = this.pending.get(requestId);
        if (pend) {
          // Clear timeout if it exists
          if ((pend as any).timeout) {
            clearTimeout((pend as any).timeout);
          }
          this.pending.delete(requestId);
          if (exit._tag === "Success") {
            pend.resolve(exit.value);
          } else {
            // Include error details in the rejection
            let errorMessage = "RPC request failed";
            
            // Handle nested error structure from Effect. The encoded cause is an
            // array of { _tag: "Fail", error } | { _tag: "Die", defect } |
            // { _tag: "Interrupt", fiberId }. A server-side defect (e.g. a thrown
            // TypeError) arrives as "Die" with the thrown value under `defect`.
            if (exit.cause && Array.isArray(exit.cause) && exit.cause.length > 0) {
              const cause = exit.cause[0] as Record<string, unknown>;
              const errLike = (cause.error ?? cause.defect) as unknown;
              if (cause._tag === "Interrupt") {
                errorMessage = "Request was interrupted by the server";
              } else if (errLike && typeof errLike === "object") {
                const errorObj = errLike as Record<string, unknown>;
                if (typeof errorObj.detail === "string") {
                  errorMessage = errorObj.detail;
                } else if (typeof errorObj.message === "string") {
                  errorMessage = errorObj.message;
                } else {
                  errorMessage = JSON.stringify(errorObj);
                }
              } else if (typeof errLike === "string") {
                errorMessage = errLike;
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
        const sub = this.streams.get(requestId);
        if (sub && (sub as any).timeout) {
          clearTimeout((sub as any).timeout);
        }
        this.streams.delete(requestId);
        break;
      }
      case "Defect": {
        // A connection-level protocol defect carries no requestId, so it cannot
        // be tied to a specific call. It almost always signals a client/server
        // contract mismatch (e.g. an unknown request tag). Log it loudly, but do
        // NOT fail unrelated in-flight requests — that would reject calls that
        // are about to succeed. Genuine handler failures arrive as request-scoped
        // Exit/Failure frames (server sets disableFatalDefects), so they're
        // handled in the "Exit" case above, not here.
        const defect = frame.defect as Record<string, unknown> | string | undefined;
        const detail =
          typeof defect === "string"
            ? defect
            : defect && typeof defect === "object" && typeof defect.message === "string"
              ? defect.message
              : JSON.stringify(defect ?? frame);
        console.error("[WS Client] Server protocol defect (ignored, no requestId):", detail);
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
        // Add request timeout
        const timeout = setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new Error("Request timeout"));
          }
        }, this.REQUEST_TIMEOUT);
        // Store timeout reference to clear it on completion
        (this.pending.get(id) as any).timeout = timeout;
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
    devLog("[WS Client] Subscribing to stream:", method, "with payload:", payload, "requestId:", id);
    this.streams.set(id, { method, payload, onValue });
    if (this.ws?.readyState === WebSocket.OPEN) {
      const frame = makeRpcFrame(id, method, payload);
      devLog("[WS Client] Sending subscription frame:", frame);
      this.send(frame);
      // Add timeout for subscription to start receiving data
      const timeout = setTimeout(() => {
        if (this.streams.has(id)) {
          devLog("[WS Client] Subscription timeout for requestId:", id);
          this.streams.delete(id);
        }
      }, this.REQUEST_TIMEOUT);
      (this.streams.get(id) as any).timeout = timeout;
    } else {
      devLog("[WS Client] WebSocket not ready, subscription will be sent on reconnect");
    }
    return () => {
      devLog("[WS Client] Unsubscribing from stream:", method, "requestId:", id);
      const sub = this.streams.get(id);
      if (sub && (sub as any).timeout) {
        clearTimeout((sub as any).timeout);
      }
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
  flavor,
}: {
  children: React.ReactNode;
  serverURL: string | null;
  bearerToken: string | null;
  flavor: ServerFlavor | null;
}) {
  const [status, setStatus] = useState<WsStatus>("offline");
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const clientRef = useRef<WsRpcClient | null>(null);

  useEffect(() => {
    if (!serverURL || !bearerToken || !flavor) {
      // Use setTimeout to avoid setState in effect warning
      const timer = setTimeout(() => {
        setStatus("offline");
        setServerConfig(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    const client = new WsRpcClient(serverURL, bearerToken, flavor, setStatus, setServerConfig);
    clientRef.current = client;
    client.connect();

    return () => {
      client.destroy();
      clientRef.current = null;
    };
  }, [serverURL, bearerToken, flavor]);

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

  const reconnect = useCallback(() => {
    clientRef.current?.reconnect();
  }, []);

  return (
    <WsClientContext value={{ status, serverConfig, request, subscribe, reconnect }}>
      {children}
    </WsClientContext>
  );
}

export function useWsClient() {
  const ctx = use(WsClientContext);
  if (!ctx) throw new Error("useWsClient must be used within WsClientProvider");
  return ctx;
}
