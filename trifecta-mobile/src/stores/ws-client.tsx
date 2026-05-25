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

      ws.onopen = () => {
        if (!this.alive || this.ws !== ws) return;
        this.reconnectAttempt = 0;
        this.onStatus("connected");
        this.resubscribeAll();
        this.fetchServerConfig();
      };

      ws.onmessage = (evt) => {
        if (!this.alive || this.ws !== ws) return;
        try {
          this.handleData(typeof evt.data === "string" ? evt.data : "");
        } catch {}
      };

      ws.onerror = () => {
        if (!this.alive || this.ws !== ws) return;
        this.onStatus("error");
      };

      ws.onclose = () => {
        if (!this.alive) return;
        if (this.ws === ws) {
          this.ws = null;
          this.onStatus("offline");
          this.failPending();
          this.scheduleReconnect();
        }
      };
    } catch {
      if (!this.alive) return;
      this.onStatus("error");
      this.scheduleReconnect();
    }
  }

  destroy() {
    this.alive = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.failPending();
    this.ws?.close();
    this.ws = null;
  }

  private handleData(text: string) {
    const raw = JSON.parse(text);
    const frames = Array.isArray(raw) ? raw : [raw];
    for (const frame of frames) {
      this.handleFrame(frame);
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
            pend.reject(new Error("RPC request failed"));
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
    const exp = Math.min(this.reconnectAttempt - 1, 6);
    const delay = Math.min(1000 * Math.pow(2, exp), 30_000) + Math.random() * 400;
    this.reconnectTimer = setTimeout(() => {
      if (this.alive) this.connect();
    }, delay);
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
      const rawProviders = (raw.providers as Array<Record<string, unknown>>) ?? [];
      const providers: ServerConfig["providers"] = rawProviders.map((p) => ({
        instanceId: (p.instanceId as string) ?? "",
        driver: (p.driver as string) ?? "",
        displayName: p.displayName as string | undefined,
        label: p.label as string | undefined,
        enabled: (p.enabled as boolean) ?? false,
        installed: (p.installed as boolean) ?? false,
        status: p.status as string | undefined,
        models: ((p.models as Array<Record<string, unknown>>) ?? []).map((m) => ({
          slug: (m.slug as string) ?? "",
          name: (m.name as string) ?? "",
          shortName: m.shortName as string | undefined,
          subProvider: m.subProvider as string | undefined,
          eligible: m.eligible as boolean | undefined,
        })),
        slashCommands: ((p.slashCommands as Array<Record<string, unknown>>) ?? []).map((sc) => ({
          name: (sc.name as string) ?? "",
          description: sc.description as string | undefined,
          input: (sc.input && typeof sc.input === "object") ? (sc.input as { hint?: string }) : undefined,
        })),
        skills: ((p.skills as Array<Record<string, unknown>>) ?? []).map((s) => ({
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
      setStatus("offline");
      setServerConfig(null);
      return;
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
