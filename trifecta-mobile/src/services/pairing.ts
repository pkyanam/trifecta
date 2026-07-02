import { Platform } from "react-native";

export type PairingResult = { bearerToken: string; flavor: ServerFlavor };

/**
 * The two server flavors the mobile app can pair with:
 *
 * - `belweave`: Trifecta Desktop (forked from T3 Code). Uses a simple
 *   role-based auth model with `/api/auth/bootstrap/bearer` and
 *   `/api/auth/ws-token`, advertising itself at
 *   `/.well-known/belweave/environment`.
 *
 * - `t3code`: the upstream T3 Code project. Uses an OAuth token-exchange
 *   flow at `/oauth/token` and `/api/auth/websocket-ticket`, advertising
 *   itself at `/.well-known/t3/environment`.
 *
 * The pairing URL format (`https://host/pair#token=XXX`) is identical for
 * both, so URL parsing is shared. Only the credential-exchange and
 * WebSocket-ticket handshake differ.
 */
export type ServerFlavor = "belweave" | "t3code";

// Android emulator uses 10.0.2.2 to access host machine's localhost
const ANDROID_LOCALHOST_ALIAS = "10.0.2.2";

// Convert localhost to Android emulator alias for network requests
export function getServerURLForPlatform(url: string): string {
  if (Platform.OS === "android") {
    return url.replace(/localhost|127\.0\.0\.1/g, ANDROID_LOCALHOST_ALIAS);
  }
  return url;
}

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

/**
 * Returns true if the URL points to a local/private network host where
 * HTTP (without TLS) is acceptable. This includes loopback, private IP
 * ranges (RFC 1918), link-local, and common dev hostnames.
 */
export function isLocalNetworkURL(rawURL: string): boolean {
  try {
    const url = new URL(rawURL);
    const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");

    // Loopback
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return true;
    }
    // Android emulator host alias
    if (hostname === "10.0.2.2") {
      return true;
    }

    // Private IP ranges (RFC 1918 + RFC 4193)
    if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
    if (/^fd[0-9a-f]{2}:/.test(hostname)) return true; // IPv6 ULA
    if (/^fe80:/.test(hostname)) return true; // IPv6 link-local

    // .local mDNS
    if (hostname.endsWith(".local")) return true;

    // Tailscale hostnames (100.x.y.z range)
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(hostname)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Returns true if the URL uses HTTPS, or uses HTTP on a local/private
 * network where cleartext is acceptable.
 */
export function isSecureTransportURL(rawURL: string): boolean {
  try {
    const url = new URL(rawURL);
    if (url.protocol === "https:" || url.protocol === "wss:") return true;
    if (url.protocol === "http:" || url.protocol === "ws:") {
      return isLocalNetworkURL(rawURL);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Probes the server's well-known environment endpoint to determine which
 * flavor it is. Both flavors expose a JSON descriptor at a flavor-specific
 * path:
 *
 * - belweave: `/.well-known/belweave/environment`
 * - t3code:   `/.well-known/t3/environment`
 *
 * We try the belweave path first (our native flavor), then fall back to the
 * t3code path. A response only counts if it is `200` **and** JSON — both
 * servers serve a static HTML catch-all for unmatched routes, so a bare 200
 * from the wrong path would otherwise cause a flavor mis-detection.
 */
export async function fetchEnvironment(serverURL: string): Promise<ServerFlavor> {
  const platformURL = getServerURLForPlatform(serverURL);
  const belweaveURL = `${platformURL}/.well-known/belweave/environment`;
  const t3codeURL = `${platformURL}/.well-known/t3/environment`;

  // Try belweave first (native flavor).
  if (await isJsonEndpoint(belweaveURL)) return "belweave";

  // Fall back to t3code.
  if (await isJsonEndpoint(t3codeURL)) return "t3code";

  throw new Error("Server unreachable (no well-known environment endpoint)");
}

/**
 * Returns true only when the URL responds with HTTP 200 and a JSON body.
 * This avoids mistaking a static HTML catch-all (which returns 200 with
 * `text/html`) for a real API endpoint.
 */
async function isJsonEndpoint(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return false;
    // Final guard: confirm the body actually parses as JSON.
    await res.json();
    return true;
  } catch {
    return false;
  }
}

/**
 * Exchanges a one-time pairing credential for a persistent session token.
 *
 * The handshake differs by flavor:
 *
 * - belweave: `POST /api/auth/bootstrap/bearer` with JSON `{ credential }`,
 *   returns `{ sessionToken | token | bearer }`.
 *
 * - t3code: `POST /oauth/token` with form-urlencoded OAuth token-exchange
 *   fields, returns `{ access_token, expires_in, scope, ... }`.
 */
export async function exchangeToken(
  serverURL: string,
  credential: string,
  flavor: ServerFlavor,
): Promise<PairingResult> {
  const platformURL = getServerURLForPlatform(serverURL);
  if (flavor === "t3code") {
    return exchangeTokenT3Code(platformURL, credential);
  }
  return exchangeTokenBelweave(platformURL, credential);
}

async function exchangeTokenBelweave(
  platformURL: string,
  credential: string,
): Promise<PairingResult> {
  const res = await fetch(`${platformURL}/api/auth/bootstrap/bearer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  if (!res.ok) {
    throw await authErrorFromResponse(res, "Pairing failed");
  }

  const json = (await res.json()) as Record<string, unknown>;
  const token = (json.sessionToken ?? json.token ?? json.bearer) as string | undefined;
  if (!token?.trim()) throw new Error("Server did not return a session token");
  return { bearerToken: token, flavor: "belweave" };
}

/**
 * T3 Code uses RFC 8693 OAuth 2.0 Token Exchange. The pairing token is the
 * `subject_token` of type `environment-bootstrap`, exchanged for a Bearer
 * access token. The request body is form-urlencoded.
 *
 * We request the standard client scopes (orchestration read/operate,
 * terminal operate, review write, relay read) which mirror what the
 * upstream mobile client requests.
 */
const T3CODE_STANDARD_CLIENT_SCOPES = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "relay:read",
].join(" ");

async function exchangeTokenT3Code(
  platformURL: string,
  credential: string,
): Promise<PairingResult> {
  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange");
  form.set("subject_token", credential);
  form.set("subject_token_type", "urn:t3:params:oauth:token-type:environment-bootstrap");
  form.set("requested_token_type", "urn:ietf:params:oauth:token-type:access_token");
  form.set("scope", T3CODE_STANDARD_CLIENT_SCOPES);
  form.set("client_device_type", "mobile");

  const res = await fetch(`${platformURL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    throw await authErrorFromResponse(res, "Pairing failed");
  }

  const json = (await res.json()) as Record<string, unknown>;
  const token = (json.access_token ?? json.accessToken) as string | undefined;
  if (!token?.trim()) throw new Error("Server did not return an access token");
  return { bearerToken: token, flavor: "t3code" };
}

async function authErrorFromResponse(res: Response, fallback: string): Promise<Error> {
  let msg = `${fallback} (HTTP ${res.status})`;
  try {
    const text = await res.text();
    const j = JSON.parse(text) as { error?: string; error_description?: string; message?: string };
    if (j.error_description) msg = j.error_description;
    else if (j.error) msg = j.error;
    else if (j.message) msg = j.message;
    else if (text.length < 300) msg = text;
  } catch {}
  return new Error(msg);
}

/**
 * Issues a short-lived WebSocket upgrade ticket using the persistent session
 * token.
 *
 * - belweave: `POST /api/auth/ws-token` → `{ token }`
 * - t3code:   `POST /api/auth/websocket-ticket` → `{ ticket }`
 *
 * Returns the ticket string plus the query-parameter name the WebSocket
 * upgrade expects (`wsToken` for belweave, `wsTicket` for t3code).
 */
export async function issueWebSocketToken(
  serverURL: string,
  bearerToken: string,
  flavor: ServerFlavor,
): Promise<string> {
  const platformURL = getServerURLForPlatform(serverURL);
  const endpoint =
    flavor === "t3code" ? "/api/auth/websocket-ticket" : "/api/auth/ws-token";
  const res = await fetch(`${platformURL}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) throw new Error(`WS ticket request failed (HTTP ${res.status})`);
  const json = (await res.json()) as Record<string, unknown>;
  // belweave returns { token }, t3code returns { ticket }.
  const ticket = (json.token ?? json.ticket) as string | undefined;
  if (!ticket?.trim()) throw new Error("Invalid WS ticket response");
  return ticket;
}

export function makeWebSocketURL(serverURL: string, wsTicket: string, flavor: ServerFlavor): string {
  const u = new URL(serverURL);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = "";
  u.hash = "";
  // belweave uses `wsToken`, t3code uses `wsTicket`.
  const param = flavor === "t3code" ? "wsTicket" : "wsToken";
  u.searchParams.set(param, wsTicket);
  return u.toString();
}
