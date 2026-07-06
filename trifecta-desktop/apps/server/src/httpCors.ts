import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http";

import { ServerConfig, type ServerConfigShape } from "./config.ts";

export const browserApiCorsAllowedMethods = ["GET", "POST", "OPTIONS"] as const;
export const browserApiCorsAllowedHeaders = [
  "authorization",
  "b3",
  "traceparent",
  "content-type",
] as const;

/**
 * Loopback hostnames that are always allowed as CORS origins for local
 * development and desktop usage.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Returns true if the given origin URL host is a loopback address.
 */
function isLoopbackOrigin(originUrl: URL): boolean {
  // Node's URL.hostname includes brackets for IPv6 (e.g. "[::1]"), so
  // strip them before comparing against the unbracketed LOOPBACK_HOSTS set.
  const host = originUrl.hostname.replace(/^\[(.*)\]$/, "$1");
  return LOOPBACK_HOSTS.has(host);
}

/**
 * Returns true if the given origin URL host is a private/local network
 * address where cleartext connections are acceptable.
 *
 * This mirrors the mobile app's `isLocalNetworkURL` logic and covers:
 * - Loopback (127.0.0.1, ::1, localhost)
 * - Android emulator host alias (10.0.2.2)
 * - RFC 1918 private ranges (10.x, 172.16-31.x, 192.168.x)
 * - IPv6 ULA (fd00::/8) and link-local (fe80::/10)
 * - `.local` mDNS hostnames
 * - Tailscale (100.64.0.0/10) addresses
 *
 * Used by the WebSocket Origin check to allow mobile clients (React Native
 * on Android/OkHttp sends an Origin header derived from the connection URL)
 * to connect via LAN/Tailscale. WebSocket connections are already
 * authenticated via a short-lived wsToken, so this is safe — the Origin
 * check is defense-in-depth against browser-based CSWSH, not mobile apps.
 */
export function isLocalNetworkOrigin(originUrl: URL): boolean {
  if (isLoopbackOrigin(originUrl)) return true;

  const host = originUrl.hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();

  // Android emulator host alias
  if (host === "10.0.2.2") return true;

  // RFC 1918 private ranges
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;

  // IPv6 ULA (fd00::/8) and link-local (fe80::/10)
  if (/^fd[0-9a-f]{2}:/.test(host)) return true;
  if (/^fe80:/.test(host)) return true;

  // .local mDNS
  if (host.endsWith(".local")) return true;

  // Tailscale (100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host)) return true;

  return false;
}

/**
 * Computes the set of allowed CORS origins for the current server configuration.
 *
 * Allowed origins:
 * - The server's own origin (same-origin requests)
 * - Loopback origins (127.0.0.1, localhost, ::1) on any port — for local
 *   development and desktop usage where the browser hits the server directly
 * - The configured `devUrl` (Vite dev server) when set
 * - The configured `publicUrl` (reverse proxy / tunnel) when set
 */
function computeAllowedOrigins(config: ServerConfigShape): Set<string> {
  const origins = new Set<string>();

  // Server's own origin (common host variants)
  const port = config.port;
  for (const h of ["localhost", "127.0.0.1", "::1"]) {
    // IPv6 addresses must be bracketed in URL origin strings.
    const host = h.includes(":") ? `[${h}]` : h;
    origins.add(`http://${host}:${port}`);
  }
  if (config.host && config.host !== "0.0.0.0" && config.host !== "::") {
    const host = config.host.includes(":") ? `[${config.host}]` : config.host;
    origins.add(`http://${host}:${port}`);
  }

  // Dev URL (Vite dev server)
  if (config.devUrl) {
    origins.add(config.devUrl.origin);
  }

  // Public URL (reverse proxy / tunnel)
  if (config.publicUrl) {
    origins.add(config.publicUrl.origin);
  }

  return origins;
}

/**
 * Returns the allowed origins as an array, suitable for passing to
 * `HttpRouter.cors({ allowedOrigins: [...] })`.
 */
export function computeAllowedOriginsList(config: ServerConfigShape): string[] {
  return [...computeAllowedOrigins(config)];
}

/**
 * Determines whether the given request origin should be allowed to make
 * cross-origin requests. Uses a dynamic allowlist based on server config
 * plus loopback origins for local development.
 */
export function isOriginAllowed(
  requestOrigin: string | undefined,
  config: ServerConfigShape,
): boolean {
  if (!requestOrigin) {
    // No Origin header — same-origin requests or non-browser clients.
    // Allow these; authentication still applies.
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(requestOrigin);
  } catch {
    return false;
  }

  // Always allow loopback origins (local development / desktop app)
  if (isLoopbackOrigin(originUrl)) {
    return true;
  }

  // Check against configured allowed origins
  const allowedOrigins = computeAllowedOrigins(config);
  return allowedOrigins.has(requestOrigin);
}

/**
 * Returns true if the Origin URL's host matches the request's `Host` header.
 *
 * A same-host Origin is by definition a same-origin WebSocket upgrade, which
 * cannot be Cross-Site WebSocket Hijacking. Native WS clients (iOS
 * SocketRocket, Android OkHttp) derive the Origin header from the connection
 * URL, so when the server is reached through a reverse proxy / tunnel domain
 * (e.g. an HTTPS preview URL) the Origin host always equals the request host.
 */
function isSameHostOrigin(originUrl: URL, requestHost: string): boolean {
  try {
    // Parse the Host header with the origin's protocol so default ports
    // (80/443) normalize identically on both sides before comparing.
    const hostUrl = new URL(`${originUrl.protocol}//${requestHost}`);
    return hostUrl.host.toLowerCase() === originUrl.host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Determines whether the given WebSocket upgrade origin should be allowed.
 *
 * This is more permissive than {@link isOriginAllowed} because WebSocket
 * upgrades from mobile clients (React Native) legitimately originate from
 * LAN/Tailscale addresses. The WebSocket connection is already authenticated
 * via a short-lived `wsToken`, so the Origin check here is defense-in-depth
 * against browser-based Cross-Site WebSocket Hijacking (CSWSH) — not a
 * primary auth boundary.
 *
 * In addition to the CORS allowlist, this allows:
 * - Any private/local network origin (RFC 1918, mDNS, Tailscale, loopback)
 *   so mobile apps connecting over LAN can establish the persistent
 *   WebSocket connection.
 * - Same-host origins (Origin host equals the request's `Host` header),
 *   which are same-origin upgrades and cannot be CSWSH. This covers native
 *   clients connecting through reverse proxy / tunnel domains, where the
 *   WS library derives the Origin from the connection URL.
 */
export function isWebSocketOriginAllowed(
  requestOrigin: string | undefined,
  config: ServerConfigShape,
  requestHost?: string,
): boolean {
  if (!requestOrigin) {
    // No Origin header — non-browser clients. Allow; authentication via
    // wsToken still applies.
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(requestOrigin);
  } catch {
    return false;
  }

  // Allow any local/private network origin (LAN, mDNS, Tailscale, loopback).
  // Mobile clients connect via these addresses and Android/OkHttp sends an
  // Origin header derived from the connection URL.
  if (isLocalNetworkOrigin(originUrl)) {
    return true;
  }

  // Allow same-origin upgrades: Origin host matches the request Host header.
  if (requestHost && isSameHostOrigin(originUrl, requestHost)) {
    return true;
  }

  // Fall back to the standard CORS allowlist (devUrl, publicUrl, etc.)
  return isOriginAllowed(requestOrigin, config);
}

/**
 * Builds CORS response headers dynamically based on the request's Origin header.
 *
 * If the origin is allowed, reflects it back in `access-control-allow-origin`
 * and sets `access-control-allow-credentials: true`. If not allowed, returns
 * empty CORS headers (browser will block the response).
 */
export function buildCorsHeaders(
  requestOrigin: string | undefined,
  config: ServerConfigShape,
): Record<string, string> {
  if (requestOrigin && isOriginAllowed(requestOrigin, config)) {
    return {
      "access-control-allow-origin": requestOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": browserApiCorsAllowedMethods.join(", "),
      "access-control-allow-headers": browserApiCorsAllowedHeaders.join(", "),
      vary: "Origin",
    };
  }

  // Same-origin or no origin — return methods/headers without ACAO.
  // The browser treats same-origin requests normally without CORS headers.
  return {
    "access-control-allow-methods": browserApiCorsAllowedMethods.join(", "),
    "access-control-allow-headers": browserApiCorsAllowedHeaders.join(", "),
  };
}

/**
 * Effect that reads the request Origin header and server config, then returns
 * dynamic CORS headers. Use this in route handlers that need per-request CORS.
 */
export const corsHeadersForRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const config = yield* ServerConfig;
  const origin = request.headers["origin"] ?? undefined;
  return buildCorsHeaders(origin, config);
});

/**
 * Static CORS headers without `access-control-allow-origin`. Used for
 * same-origin responses where no ACAO header is needed.
 */
export const browserApiCorsHeaders = {
  "access-control-allow-methods": browserApiCorsAllowedMethods.join(", "),
  "access-control-allow-headers": browserApiCorsAllowedHeaders.join(", "),
} as const;
