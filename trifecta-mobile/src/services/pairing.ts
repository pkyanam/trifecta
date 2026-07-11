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
const PAIRING_TOKEN_PARAM = "token";

export type BoxPortAuth = {
  token: string;
  cookieHeader: string;
};

function isValidCookieValue(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f || value[index] === ";") return false;
  }
  return true;
}

export function extractBoxPortAuth(url: URL): BoxPortAuth | null {
  const token = url.searchParams.get("_token");
  if (!token) return null;
  if (!isValidCookieValue(token)) return null;
  return {
    token,
    cookieHeader: `_port_auth=${encodeURIComponent(token)}`,
  };
}

export function stripBoxToken(url: URL): URL {
  const next = new URL(url.toString());
  next.searchParams.delete("_token");
  return next;
}

export function getBoxPortAuth(serverURL: string): BoxPortAuth | null {
  try {
    return extractBoxPortAuth(new URL(serverURL));
  } catch {
    return null;
  }
}

// ─── XHR-based fetch helper ─────────────────────────────────────────────
//
// Expo SDK 56 replaces the global `fetch` with `expo/fetch`, a WinterCG-
// compliant implementation that:
//   1. Treats `Cookie` as a forbidden request header (strips it silently)
//   2. Does NOT store cookies from 302 `Set-Cookie` responses into
//      `NSHTTPCookieStorage`
//
// This breaks Box (Caddy) auth, which requires either `_token` in the URL
// (triggers a 302 redirect) or a `_port_auth` cookie. Since `expo/fetch`
// strips the Cookie header AND doesn't store redirect cookies, neither
// approach works with `fetch` for POST requests.
//
// `XMLHttpRequest` on React Native uses `RCTNetworking` → `NSURLSession`,
// which:
//   1. Does NOT strip the `Cookie` header
//   2. DOES store cookies from 302 `Set-Cookie` responses into
//      `NSHTTPCookieStorage` (when `HTTPShouldSetCookies = YES`)
//   3. DOES send cookies from `NSHTTPCookieStorage` on subsequent requests
//
// So we use XHR for POST requests (where we need the Cookie header) and
// for the priming request (where we need the cookie to be stored). For
// GET requests, we keep `_token` in the URL and use `fetch` (Caddy's 302
// is followed automatically, no cookie needed).

type XhrResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Map<string, string>;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

export function xhrFetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? "GET", url, true);
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      const headers = new Map<string, string>();
      const rawHeaders = xhr.getAllResponseHeaders();
      if (rawHeaders) {
        for (const line of rawHeaders.split("\r\n")) {
          const idx = line.indexOf(": ");
          if (idx > 0) {
            headers.set(line.slice(0, idx).toLowerCase(), line.slice(idx + 2));
          }
        }
      }
      const status = xhr.status;
      const response: XhrResponse = {
        ok: status >= 200 && status < 300,
        status,
        statusText: xhr.statusText,
        headers,
        text: () => Promise.resolve(xhr.responseText),
        json: () => Promise.resolve(JSON.parse(xhr.responseText)),
      };
      resolve(response);
    };
    xhr.onerror = () => reject(new Error(`XHR error: ${xhr.statusText || "network error"}`));
    xhr.ontimeout = () => reject(new Error("XHR timeout"));
    xhr.send(options.body);
  });
}

/**
 * Primes the platform's native cookie store (NSHTTPCookieStorage on iOS,
 * CookieManager on Android) with the Box `_port_auth` cookie by making a
 * GET request that includes `_token` in the URL.
 *
 * Uses XHR (not fetch) because Expo SDK 56's `expo/fetch` does NOT store
 * cookies from 302 redirect responses. XHR uses NSURLSession which does
 * store them, making the cookie available to SocketRocket for WebSocket
 * upgrades.
 *
 * Safe to call when there is no `_token` (no-op). Also safe to call
 * repeatedly — the cookie store deduplicates.
 */
export async function primeBoxPortAuth(serverURL: string): Promise<void> {
  const auth = getBoxPortAuth(serverURL);
  if (!auth) return;
  try {
    const url = new URL(getServerURLForPlatform(serverURL));
    url.pathname = "/.well-known/belweave/environment";
    if (!url.searchParams.has("_token")) {
      url.searchParams.set("_token", auth.token);
    }
    // Use XHR so the cookie from the 302 Set-Cookie is stored in
    // NSHTTPCookieStorage. expo/fetch does not store redirect cookies.
    const res = await xhrFetch(url.toString());
    if (__DEV__) console.debug(`[pairing] cookie priming status=${res.status}`);
  } catch {
    // Best-effort — if priming fails, POST requests will still try
    // with the manual Cookie header via XHR.
  }
}

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
  u.searchParams.delete(PAIRING_TOKEN_PARAM);
  u.hash = "";
  return u.toString().replace(/\/+$/, "");
}

function joinUrlPath(basePath: string, endpointPath: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const endpoint = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  if (!base || base === "/") {
    return endpoint;
  }
  return `${base}${endpoint}`;
}

/**
 * Builds the URL for an endpoint. When `keepToken` is true, `_token` is
 * retained in the query string so Caddy's 302 redirect handles auth
 * (used for GET requests with expo/fetch). When false, `_token` is
 * stripped and the caller must include the Cookie header via XHR
 * (used for POST requests).
 */
function endpointURL(baseURL: string, endpointPath: string, keepToken = false): string {
  const url = new URL(baseURL);
  url.pathname = joinUrlPath(url.pathname, endpointPath);
  url.searchParams.delete(PAIRING_TOKEN_PARAM);
  if (!keepToken && extractBoxPortAuth(url)) {
    url.searchParams.delete("_token");
  }
  url.hash = "";
  return url.toString();
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
  // Keep _token in the URL for GET requests. Caddy responds with a 302
  // redirect + Set-Cookie, and expo/fetch follows the redirect automatically,
  // yielding the JSON body. This avoids the need for a Cookie header (which
  // expo/fetch strips as a "forbidden" header).
  const belweaveURL = endpointURL(platformURL, "/.well-known/belweave/environment", true);
  const t3codeURL = endpointURL(platformURL, "/.well-known/t3/environment", true);

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
  // Strip _token for POST — Caddy's 302 would convert POST to GET.
  // Use XHR (not fetch) because expo/fetch strips Cookie headers.
  // Don't set Cookie header manually — RN's XHR also strips it. Instead,
  // rely on NSHTTPCookieStorage being primed by primeBoxPortAuth(). XHR
  // uses NSURLSession which automatically sends cookies from the cookie
  // store.
  const url = endpointURL(platformURL, "/api/auth/bootstrap/bearer", false);
  const res = await xhrFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  if (!res.ok) {
    throw await authErrorFromXhrResponse(res, "Pairing failed");
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

  const url = endpointURL(platformURL, "/oauth/token", false);
  const res = await xhrFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    throw await authErrorFromXhrResponse(res, "Pairing failed");
  }

  const json = (await res.json()) as Record<string, unknown>;
  const token = (json.access_token ?? json.accessToken) as string | undefined;
  if (!token?.trim()) throw new Error("Server did not return an access token");
  return { bearerToken: token, flavor: "t3code" };
}

async function authErrorFromXhrResponse(res: XhrResponse, fallback: string): Promise<Error> {
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
  // Strip _token for POST — use XHR. Cookie is sent automatically from
  // NSHTTPCookieStorage (primed by primeBoxPortAuth).
  const url = endpointURL(platformURL, endpoint, false);
  const res = await xhrFetch(url, {
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
  u.pathname = joinUrlPath(u.pathname, "/ws");
  u.hash = "";
  // belweave uses `wsToken`, t3code uses `wsTicket`.
  const param = flavor === "t3code" ? "wsTicket" : "wsToken";
  if (extractBoxPortAuth(u)) {
    u.searchParams.delete("_token");
  }
  u.searchParams.delete(PAIRING_TOKEN_PARAM);
  u.searchParams.delete("wsToken");
  u.searchParams.delete("wsTicket");
  u.searchParams.set(param, wsTicket);
  return u.toString();
}
