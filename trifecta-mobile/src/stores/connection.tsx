import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerFlavor } from "@/services/pairing";

/**
 * Multi-server connection store.
 *
 * The app can be paired with several servers at once. Each paired server is
 * stored as a {@link PairedServer} entry in a JSON blob in the keychain
 * (`trifecta.servers`). The currently active server is tracked by id in
 * `trifecta.active_server_id`; its credentials are derived and exposed as
 * `serverURL` / `bearerToken` / `flavor` so existing consumers
 * (WsClientProvider, screens) keep working unchanged.
 *
 * On first launch after the upgrade, legacy single-server keys
 * (`trifecta.server_url`, `trifecta.bearer_token`, `trifecta.server_flavor`)
 * are migrated into a one-entry list and the old keys are deleted.
 */
const SERVERS_KEY = "trifecta.servers";
const ACTIVE_KEY = "trifecta.active_server_id";
// Legacy single-server keys (migrated on first load)
const LEGACY_SERVER_KEY = "trifecta.server_url";
const LEGACY_BEARER_KEY = "trifecta.bearer_token";
const LEGACY_FLAVOR_KEY = "trifecta.server_flavor";

export type PairedServer = {
  id: string;
  serverURL: string;
  bearerToken: string;
  flavor: ServerFlavor;
  /** Optional user-provided label; falls back to hostname when null. */
  label: string | null;
  pairedAt: number;
};

type ConnectionState = {
  /** Credentials of the active server (derived). */
  serverURL: string | null;
  bearerToken: string | null;
  flavor: ServerFlavor | null;
  isPaired: boolean;
  isLoading: boolean;
  /** All paired servers, in insertion order. */
  servers: PairedServer[];
  activeServerId: string | null;
  /** Pair (or re-pair) a server and make it active. Returns the stored entry. */
  pair: (serverURL: string, bearerToken: string, flavor: ServerFlavor) => Promise<PairedServer>;
  /** Remove the active server. If others remain, the first becomes active. */
  unpair: () => Promise<void>;
  /** Switch the active server by id. */
  switchServer: (id: string) => Promise<void>;
  /** Remove a specific server by id. */
  removeServer: (id: string) => Promise<void>;
  /** Set a custom label for a server. */
  renameServer: (id: string, label: string) => Promise<void>;
};

const ConnectionContext = createContext<ConnectionState | null>(null);

/** Generate a cryptographically secure unique id for a paired server entry. */
function makeId(): string {
  return Crypto.randomUUID();
}

/** Normalize a URL for dedupe comparison (trim + strip trailing slashes). */
function normalizeURL(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Best-effort hostname extraction for display fallback. */
export function serverHostname(serverURL: string): string {
  try {
    return new URL(serverURL).hostname;
  } catch {
    return serverURL;
  }
}

export function serverDisplayName(server: PairedServer): string {
  return server.label?.trim() || serverHostname(server.serverURL);
}

async function readServers(): Promise<PairedServer[]> {
  const raw = await SecureStore.getItemAsync(SERVERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PairedServer[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.serverURL === "string" &&
        typeof s.bearerToken === "string" &&
        (s.flavor === "belweave" || s.flavor === "t3code"),
    );
  } catch {
    return [];
  }
}

async function writeServers(servers: PairedServer[]): Promise<void> {
  await SecureStore.setItemAsync(SERVERS_KEY, JSON.stringify(servers));
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [servers, setServers] = useState<PairedServer[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Mirror of `servers` for synchronous reads inside callbacks (avoids
  // stale closures and keeps setState updaters pure).
  const serversRef = useRef<PairedServer[]>([]);
  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  // Mirror of `activeServerId` for synchronous reads.
  const activeServerIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeServerIdRef.current = activeServerId;
  }, [activeServerId]);

  // Load (with legacy migration) on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let list = await readServers();
        let active = await SecureStore.getItemAsync(ACTIVE_KEY);

        // Migrate legacy single-server credentials if the new list is empty.
        if (list.length === 0) {
          const [url, token, flv] = await Promise.all([
            SecureStore.getItemAsync(LEGACY_SERVER_KEY),
            SecureStore.getItemAsync(LEGACY_BEARER_KEY),
            SecureStore.getItemAsync(LEGACY_FLAVOR_KEY),
          ]);
          if (url && token) {
            const flavor: ServerFlavor = flv === "t3code" ? "t3code" : "belweave";
            const entry: PairedServer = {
              id: makeId(),
              serverURL: normalizeURL(url),
              bearerToken: token,
              flavor,
              label: null,
              pairedAt: Date.now(),
            };
            list = [entry];
            active = entry.id;
            await Promise.all([
              writeServers(list),
              SecureStore.setItemAsync(ACTIVE_KEY, active),
              SecureStore.deleteItemAsync(LEGACY_SERVER_KEY),
              SecureStore.deleteItemAsync(LEGACY_BEARER_KEY),
              SecureStore.deleteItemAsync(LEGACY_FLAVOR_KEY),
            ]);
          }
        }

        if (cancelled) return;

        // If the stored active id is missing or stale, fall back to the first.
        if (!active && list.length > 0) {
          active = list[0].id;
          await SecureStore.setItemAsync(ACTIVE_KEY, active);
        } else if (active && !list.some((s) => s.id === active)) {
          active = list.length > 0 ? list[0].id : null;
          if (active) {
            await SecureStore.setItemAsync(ACTIVE_KEY, active);
          } else {
            await SecureStore.deleteItemAsync(ACTIVE_KEY);
          }
        }

        serversRef.current = list;
        activeServerIdRef.current = active;
        setServers(list);
        setActiveServerId(active);
      } catch (error) {
        console.warn("Failed to load paired servers:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = useMemo(
    () => servers.find((s) => s.id === activeServerId) ?? null,
    [servers, activeServerId],
  );

  const pair = useCallback(
    async (url: string, token: string, flavor: ServerFlavor): Promise<PairedServer> => {
      const normalized = normalizeURL(url);
      const prev = serversRef.current;
      const idx = prev.findIndex(
        (s) => normalizeURL(s.serverURL) === normalized,
      );
      let paired: PairedServer;
      let next: PairedServer[];
      if (idx >= 0) {
        paired = { ...prev[idx], serverURL: normalized, bearerToken: token, flavor };
        next = [...prev];
        next[idx] = paired;
      } else {
        paired = {
          id: makeId(),
          serverURL: normalized,
          bearerToken: token,
          flavor,
          label: null,
          pairedAt: Date.now(),
        };
        next = [...prev, paired];
      }
      serversRef.current = next;
      setServers(next);
      activeServerIdRef.current = paired.id;
      await Promise.all([
        writeServers(next),
        SecureStore.setItemAsync(ACTIVE_KEY, paired.id),
      ]);
      setActiveServerId(paired.id);
      return paired;
    },
    [],
  );

  const switchServer = useCallback(async (id: string) => {
    if (serversRef.current.every((s) => s.id !== id)) return;
    activeServerIdRef.current = id;
    setActiveServerId(id);
    await SecureStore.setItemAsync(ACTIVE_KEY, id);
  }, []);

  const removeServer = useCallback(async (id: string) => {
    const prev = serversRef.current;
    const next = prev.filter((s) => s.id !== id);
    serversRef.current = next;
    setServers(next);
    const wasActive = prev.some((s) => s.id === id) && activeServerIdRef.current === id;
    let nextActiveId = activeServerIdRef.current;
    if (wasActive) {
      nextActiveId = next.length > 0 ? next[0].id : null;
      activeServerIdRef.current = nextActiveId;
      setActiveServerId(nextActiveId);
    }
    if (nextActiveId) {
      await Promise.all([
        writeServers(next),
        SecureStore.setItemAsync(ACTIVE_KEY, nextActiveId),
      ]);
    } else {
      await Promise.all([
        writeServers(next),
        SecureStore.deleteItemAsync(ACTIVE_KEY),
      ]);
    }
  }, []);

  const renameServer = useCallback(async (id: string, label: string) => {
    const trimmed = label.trim();
    const prev = serversRef.current;
    const idx = prev.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = [...prev];
    next[idx] = { ...next[idx], label: trimmed.length > 0 ? trimmed : null };
    serversRef.current = next;
    setServers(next);
    await writeServers(next);
  }, []);

  const unpair = useCallback(async () => {
    if (!activeServerIdRef.current) return;
    await removeServer(activeServerIdRef.current);
  }, [removeServer]);

  const serverURL = active?.serverURL ?? null;
  const bearerToken = active?.bearerToken ?? null;
  const flavor = active?.flavor ?? null;

  return (
    <ConnectionContext
      value={{
        serverURL,
        bearerToken,
        flavor,
        isPaired: !!active,
        isLoading,
        servers,
        activeServerId,
        pair,
        unpair,
        switchServer,
        removeServer,
        renameServer,
      }}
    >
      {children}
    </ConnectionContext>
  );
}

export function useConnection() {
  const ctx = use(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
