import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useEffect, useState } from "react";

const SERVER_KEY = "trifecta.server_url";
const BEARER_KEY = "trifecta.bearer_token";

type ConnectionState = {
  serverURL: string | null;
  bearerToken: string | null;
  isPaired: boolean;
  isLoading: boolean;
  pair: (serverURL: string, bearerToken: string) => Promise<void>;
  unpair: () => Promise<void>;
};

const ConnectionContext = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [serverURL, setServerURL] = useState<string | null>(null);
  const [bearerToken, setBearerToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [url, token] = await Promise.all([
          SecureStore.getItemAsync(SERVER_KEY),
          SecureStore.getItemAsync(BEARER_KEY),
        ]);
        setServerURL(url);
        setBearerToken(token);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const pair = useCallback(async (url: string, token: string) => {
    await Promise.all([
      SecureStore.setItemAsync(SERVER_KEY, url),
      SecureStore.setItemAsync(BEARER_KEY, token),
    ]);
    setServerURL(url);
    setBearerToken(token);
  }, []);

  const unpair = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(SERVER_KEY),
      SecureStore.deleteItemAsync(BEARER_KEY),
    ]);
    setServerURL(null);
    setBearerToken(null);
  }, []);

  return (
    <ConnectionContext
      value={{
        serverURL,
        bearerToken,
        isPaired: !!(serverURL && bearerToken),
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
