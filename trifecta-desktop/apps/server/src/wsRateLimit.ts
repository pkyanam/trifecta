/**
 * WebSocket and HTTP rate limiting + message size limits.
 *
 * Protects the server from denial-of-service attacks by:
 * - Enforcing a maximum request body size (default 1 MB for API, 10 MB for attachments)
 * - Enforcing a per-IP rate limit on WebSocket upgrade requests
 * - Rejecting oversized or too-frequent requests with 429/413 responses
 *
 * @module wsRateLimit
 */
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Clock from "effect/Clock";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

/** Maximum allowed request body size in bytes (1 MB). */
export const MAX_MESSAGE_SIZE_BYTES = 1 * 1024 * 1024;

/** Rate limit window in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 10_000;

/** Maximum number of WebSocket upgrades allowed per IP per window. */
export const RATE_LIMIT_MAX_UPGRADES = 30;

/** HTTP status for "Payload Too Large". */
const STATUS_PAYLOAD_TOO_LARGE = 413;

/** HTTP status for "Too Many Requests". */
const STATUS_TOO_MANY_REQUESTS = 429;

interface RateLimitEntry {
  readonly timestamps: number[];
}

type RateLimitMap = Map<string, RateLimitEntry>;

/**
 * Checks whether a request from the given IP can proceed under the rate limit.
 * Uses a sliding window counter per IP address.
 *
 * Returns true if the request is allowed, false if rate-limited.
 */
function checkIpRateLimit(
  map: RateLimitMap,
  ip: string,
  now: number,
  windowMs: number,
  maxRequests: number,
): boolean {
  let entry = map.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    map.set(ip, entry);
  }

  const cutoff = now - windowMs;
  // Prune timestamps outside the window
  const ts = entry.timestamps;
  while (ts.length > 0 && ts[0]! < cutoff) {
    ts.shift();
  }

  if (ts.length >= maxRequests) {
    return false;
  }
  ts.push(now);
  return true;
}

/**
 * Periodically prune stale IP entries from the rate limit map to prevent
 * unbounded memory growth. Called on each request.
 */
function pruneStaleEntries(map: RateLimitMap, now: number, windowMs: number): void {
  if (map.size < 1000) return; // Only prune when map gets large
  const cutoff = now - windowMs;
  for (const [ip, entry] of map) {
    const ts = entry.timestamps;
    if (ts.length === 0 || ts[ts.length - 1]! < cutoff) {
      map.delete(ip);
    }
  }
}

/**
 * Extracts the client IP from the request. Checks X-Forwarded-For first
 * (for reverse proxy setups), then falls back to the socket remote address.
 */
function getClientIp(request: HttpServerRequest.HttpServerRequest): string {
  const forwardedFor = request.headers["x-forwarded-for"] as string | string[] | undefined;
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0]!.trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0]!;
  }
  // Effect HTTP request doesn't expose socket directly; use a fallback
  return "unknown";
}

/**
 * Checks the content-length header against the maximum message size.
 * Returns true if the size is within limits, false otherwise.
 */
export function checkMessageSize(
  headers: Record<string, string | string[] | undefined>,
  maxSize: number = MAX_MESSAGE_SIZE_BYTES,
): boolean {
  const contentLength = headers["content-length"];
  if (typeof contentLength === "string") {
    const length = Number.parseInt(contentLength, 10);
    if (Number.isFinite(length) && length > maxSize) {
      return false;
    }
  }
  return true;
}

/**
 * Creates a rate limiter effect that tracks per-IP WebSocket upgrade requests.
 *
 * The rate limiter state is stored in a Ref and shared across all requests.
 * Uses a sliding window algorithm with per-IP tracking.
 */
export const makeWsRateLimiter = Effect.gen(function* () {
  const rateLimitMap = yield* Ref.make<RateLimitMap>(new Map());

  return {
    /**
     * Checks if the current request is within rate limits.
     * Returns an error response if rate-limited, or undefined if allowed.
     */
    check: Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const ip = getClientIp(request);
      const now = yield* Clock.currentTimeMillis;
      const map = yield* Ref.get(rateLimitMap);

      // Prune stale entries periodically
      pruneStaleEntries(map, now, RATE_LIMIT_WINDOW_MS);

      if (!checkIpRateLimit(map, ip, now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES)) {
        return HttpServerResponse.text("Too many requests", { status: STATUS_TOO_MANY_REQUESTS });
      }
      return undefined;
    }),

    /**
     * Checks if the request body size is within limits.
     * Returns an error response if too large, or undefined if OK.
     */
    checkSize: Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!checkMessageSize(request.headers)) {
        return HttpServerResponse.text("Payload too large", {
          status: STATUS_PAYLOAD_TOO_LARGE,
        });
      }
      return undefined;
    }),

    /**
     * Combined check: validates both rate limit and message size.
     * Returns an error response if any limit is exceeded, or undefined if OK.
     */
    checkAll: Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;

      // Check message size first (cheap)
      if (!checkMessageSize(request.headers)) {
        return HttpServerResponse.text("Payload too large", {
          status: STATUS_PAYLOAD_TOO_LARGE,
        });
      }

      // Check rate limit
      const ip = getClientIp(request);
      const now = yield* Clock.currentTimeMillis;
      const map = yield* Ref.get(rateLimitMap);
      pruneStaleEntries(map, now, RATE_LIMIT_WINDOW_MS);

      if (!checkIpRateLimit(map, ip, now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES)) {
        return HttpServerResponse.text("Too many requests", {
          status: STATUS_TOO_MANY_REQUESTS,
        });
      }

      return undefined;
    }),
  };
});

/**
 * Type for the WebSocket rate limiter service.
 */
export interface WsRateLimiter {
  readonly check: Effect.Effect<
    HttpServerResponse.HttpServerResponse | undefined,
    never,
    HttpServerRequest.HttpServerRequest
  >;
  readonly checkSize: Effect.Effect<
    HttpServerResponse.HttpServerResponse | undefined,
    never,
    HttpServerRequest.HttpServerRequest
  >;
  readonly checkAll: Effect.Effect<
    HttpServerResponse.HttpServerResponse | undefined,
    never,
    HttpServerRequest.HttpServerRequest
  >;
}
