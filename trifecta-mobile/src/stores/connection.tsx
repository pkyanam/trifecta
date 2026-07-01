import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useEffect, useState } from "react";
import type { ServerFlavor } from "@/services/pairing";

const SERVER_KEY = "trifecta.server_url";
const BEARER_KEY = "trifecta.bearer_token";
const FLAVOR_KEY = "trifecta.server_flavor";

type ConnectionState = {
  serverURL: string | null;
  bearerToken: string | null;
  flavor: ServerFlavor | null;
  isPaired: boolean;
  isLoading: boolean;
  pair: (serverURL: string, bearerToken: string, flavor: ServerFlavor) => Promise<void>;
  unpair: () => Promise<void>;
};

const ConnectionContext = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [serverURL, setServerURL] = useState<string | null>(null);
  const [bearerToken, setBearerToken] = useState<string | null>(null);
  const [flavor, setFlavor] = useState<ServerFlavor | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [url, token, flv] = await Promise.all([
          SecureStore.getItemAsync(SERVER_KEY),
          SecureStore.getItemAsync(BEARER_KEY),
          SecureStore.getItemAsync(FLAVOR_KEY),
        ]);
        setServerURL(url);
        setBearerToken(token);
        // Treat any unrecognized stored value as the native belweave flavor
        // so existing paired sessions keep working after this upgrade.
        setFlavor((flv === "t3code" ? "t3code" : "belweave") as ServerFlavor);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const pair = useCallback(
    async (url: string, token: string, flv: ServerFlavor) => {
      await Promise.all([
        SecureStore.setItemAsync(SERVER_KEY, url),
        SecureStore.setItemAsync(BEARER_KEY, token),
        SecureStore.setItemAsync(FLAVOR_KEY, flv),
      ]);
      setServerURL(url);
      setBearerToken(token);
      setFlavor(flv);
    },
    [],
  );

  const unpair = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(SERVER_KEY),
      SecureStore.deleteItemAsync(BEARER_KEY),
      SecureStore.deleteItemAsync(FLAVOR_KEY),
    ]);
    setServerURL(null);
    setBearerToken(null);
    setFlavor(null);
  }, []);

  return (
    <ConnectionContext
      value={{
        serverURL,
        bearerToken,
        flavor,
        isPaired: !!(serverURL && bearerToken && flavor),
        isLoading,
        pair,
        unpair,
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
