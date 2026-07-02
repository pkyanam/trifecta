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
  return LOOPBACK_HOSTS.has(originUrl.hostname);
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
    origins.add(`http://${h}:${port}`);
  }
  if (config.host && config.host !== "0.0.0.0" && config.host !== "::") {
    origins.add(`http://${config.host}:${port}`);
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
