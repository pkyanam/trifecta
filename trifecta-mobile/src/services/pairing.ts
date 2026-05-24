export type PairingResult = { bearerToken: string };

export function parsePairingURL(raw: string): { serverURL: string; token: string } | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const url = new URL(trimmed);

    // Fragment: #token=XXX (Trifecta's /pair#token=XXX format)
    if (url.hash) {
      const params = new URLSearchParams(url.hash.slice(1));
      const token = params.get("token")?.trim();
      if (token) return { serverURL: normalizeServerURL(url), token };
    }

    // Hosted relay: ?host=https://server&token=XXX
    const host = url.searchParams.get("host");
    const tokenQ = url.searchParams.get("token")?.trim();
    if (host && tokenQ) {
      return { serverURL: normalizeServerURL(new URL(host)), token: tokenQ };
    }

    // Direct: https://server/pair?token=XXX
    if (tokenQ) return { serverURL: normalizeServerURL(url), token: tokenQ };

    return null;
  } catch {
    return null;
  }
}

export function normalizeServerURL(url: URL): string {
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, "");
  if (path === "/pair") {
    u.pathname = "/";
  } else if (path.endsWith("/pair")) {
    u.pathname = path.slice(0, -"/pair".length);
  }
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/+$/, "");
}

export async function fetchEnvironment(serverURL: string): Promise<void> {
  const res = await fetch(`${serverURL}/.well-known/belweave/environment`);
  if (!res.ok) throw new Error(`Server unreachable (HTTP ${res.status})`);
}

export async function exchangeToken(
  serverURL: string,
  credential: string,
): Promise<PairingResult> {
  const res = await fetch(`${serverURL}/api/auth/bootstrap/bearer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  if (!res.ok) {
    let msg = `Pairing failed (HTTP ${res.status})`;
    try {
      const text = await res.text();
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
      else if (text.length < 300) msg = text;
    } catch {}
    throw new Error(msg);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const token = (json.sessionToken ?? json.token ?? json.bearer) as string | undefined;
  if (!token?.trim()) throw new Error("Server did not return a session token");
  return { bearerToken: token };
}

export async function issueWebSocketToken(
  serverURL: string,
  bearerToken: string,
): Promise<string> {
  const res = await fetch(`${serverURL}/api/auth/ws-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) throw new Error(`WS token request failed (HTTP ${res.status})`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("Invalid WS token response");
  return json.token;
}

export function makeWebSocketURL(serverURL: string, wsToken: string): string {
  const u = new URL(serverURL);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = "";
  u.hash = "";
  u.searchParams.set("wsToken", wsToken);
  return u.toString();
}
