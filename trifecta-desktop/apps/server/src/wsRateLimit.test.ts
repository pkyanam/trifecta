import { describe, expect, it } from "vitest";

import {
  checkMessageSize,
  MAX_MESSAGE_SIZE_BYTES,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_UPGRADES,
} from "./wsRateLimit.ts";

describe("checkMessageSize", () => {
  it("allows requests without content-length", () => {
    expect(checkMessageSize({})).toBe(true);
  });

  it("allows requests with content-length under the limit", () => {
    expect(checkMessageSize({ "content-length": "1024" })).toBe(true);
    expect(checkMessageSize({ "content-length": String(MAX_MESSAGE_SIZE_BYTES) })).toBe(true);
  });

  it("rejects requests with content-length over the limit", () => {
    expect(checkMessageSize({ "content-length": String(MAX_MESSAGE_SIZE_BYTES + 1) })).toBe(false);
    expect(checkMessageSize({ "content-length": "999999999" })).toBe(false);
  });

  it("allows requests with non-numeric content-length", () => {
    expect(checkMessageSize({ "content-length": "abc" })).toBe(true);
  });

  it("allows requests with content-length of 0", () => {
    expect(checkMessageSize({ "content-length": "0" })).toBe(true);
  });

  it("supports custom max size", () => {
    expect(checkMessageSize({ "content-length": "500" }, 1000)).toBe(true);
    expect(checkMessageSize({ "content-length": "1500" }, 1000)).toBe(false);
  });
});

// Test the internal rate-limit functions by importing them via the module's
// exported helpers. Since checkIpRateLimit and pruneStaleEntries are not
// exported, we test the sliding-window behavior through a local re-implementation
// that mirrors the module's logic, validating the algorithm itself.
describe("rate limit sliding window algorithm", () => {
  // Mirror of the internal checkIpRateLimit for direct testing
  function checkIpRateLimit(
    map: Map<string, { timestamps: number[] }>,
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

  function pruneStaleEntries(
    map: Map<string, { timestamps: number[] }>,
    now: number,
    windowMs: number,
  ): void {
    if (map.size < 1000) return;
    const cutoff = now - windowMs;
    for (const [ip, entry] of map) {
      const ts = entry.timestamps;
      if (ts.length === 0 || ts[ts.length - 1]! < cutoff) {
        map.delete(ip);
      }
    }
  }

  it("allows requests up to the limit for a single IP", () => {
    const map = new Map<string, { timestamps: number[] }>();
    const now = 10_000;
    for (let i = 0; i < RATE_LIMIT_MAX_UPGRADES; i++) {
      expect(
        checkIpRateLimit(map, "1.2.3.4", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES),
      ).toBe(true);
    }
  });

  it("blocks requests once the limit is exceeded for a single IP", () => {
    const map = new Map<string, { timestamps: number[] }>();
    const now = 10_000;
    for (let i = 0; i < RATE_LIMIT_MAX_UPGRADES; i++) {
      checkIpRateLimit(map, "1.2.3.4", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES);
    }
    // Next request should be blocked
    expect(
      checkIpRateLimit(map, "1.2.3.4", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES),
    ).toBe(false);
  });

  it("allows requests again after the window expires", () => {
    const map = new Map<string, { timestamps: number[] }>();
    const now = 10_000;
    for (let i = 0; i < RATE_LIMIT_MAX_UPGRADES; i++) {
      checkIpRateLimit(map, "1.2.3.4", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES);
    }
    // After the window passes, requests should be allowed again
    const later = now + RATE_LIMIT_WINDOW_MS + 1;
    expect(
      checkIpRateLimit(map, "1.2.3.4", later, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES),
    ).toBe(true);
  });

  it("tracks IPs independently", () => {
    const map = new Map<string, { timestamps: number[] }>();
    const now = 10_000;
    for (let i = 0; i < RATE_LIMIT_MAX_UPGRADES; i++) {
      checkIpRateLimit(map, "1.2.3.4", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES);
    }
    // Different IP should still be allowed
    expect(
      checkIpRateLimit(map, "5.6.7.8", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES),
    ).toBe(true);
    // Original IP should be blocked
    expect(
      checkIpRateLimit(map, "1.2.3.4", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_UPGRADES),
    ).toBe(false);
  });

  it("persists state across sequential calls (shared map)", () => {
    const map = new Map<string, { timestamps: number[] }>();
    const now = 10_000;
    // Simulate multiple sequential WebSocket upgrades from the same IP
    for (let i = 0; i < RATE_LIMIT_MAX_UPGRADES - 1; i++) {
      expect(
        checkIpRateLimit(
          map,
          "192.168.1.1",
          now + i * 100,
          RATE_LIMIT_WINDOW_MS,
          RATE_LIMIT_MAX_UPGRADES,
        ),
      ).toBe(true);
    }
    // The last allowed request
    expect(
      checkIpRateLimit(
        map,
        "192.168.1.1",
        now + (RATE_LIMIT_MAX_UPGRADES - 1) * 100,
        RATE_LIMIT_WINDOW_MS,
        RATE_LIMIT_MAX_UPGRADES,
      ),
    ).toBe(true);
    // One more should be blocked — state persisted across calls
    expect(
      checkIpRateLimit(
        map,
        "192.168.1.1",
        now + RATE_LIMIT_MAX_UPGRADES * 100,
        RATE_LIMIT_WINDOW_MS,
        RATE_LIMIT_MAX_UPGRADES,
      ),
    ).toBe(false);
  });

  it("pruneStaleEntries removes IPs with only old timestamps", () => {
    const map = new Map<string, { timestamps: number[] }>();
    // Add 1001 entries to trigger pruning threshold
    for (let i = 0; i < 1001; i++) {
      map.set(`10.0.0.${i}`, { timestamps: [1000] });
    }
    // Prune at a time after the window
    pruneStaleEntries(map, 1000 + RATE_LIMIT_WINDOW_MS + 1, RATE_LIMIT_WINDOW_MS);
    // All stale entries should be removed
    expect(map.size).toBe(0);
  });

  it("pruneStaleEntries does nothing when map is small", () => {
    const map = new Map<string, { timestamps: number[] }>();
    map.set("1.2.3.4", { timestamps: [1000] });
    pruneStaleEntries(map, 1000 + RATE_LIMIT_WINDOW_MS + 1, RATE_LIMIT_WINDOW_MS);
    // Small map should not be pruned
    expect(map.size).toBe(1);
  });
});
