import { describe, expect, it } from "vitest";

import type { ServerConfigShape } from "./config.ts";
import { buildCorsHeaders, computeAllowedOriginsList, isOriginAllowed } from "./httpCors.ts";

function makeConfig(overrides: Partial<ServerConfigShape> = {}): ServerConfigShape {
  return {
    logLevel: "Info",
    traceMinLevel: "Info",
    traceTimingEnabled: false,
    traceBatchWindowMs: 5000,
    traceMaxBytes: 10_000_000,
    traceMaxFiles: 10,
    otlpTracesUrl: undefined,
    otlpMetricsUrl: undefined,
    otlpExportIntervalMs: 5000,
    otlpServiceName: "trifecta",
    mode: "server",
    port: 3773,
    host: "localhost",
    cwd: "/tmp",
    baseDir: "/tmp",
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: false,
    startupPresentation: "browser",
    desktopBootstrapToken: undefined,
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    tailscaleServeEnabled: false,
    tailscaleServePort: 3773,
    publicUrl: undefined,
    reviewPairingToken: undefined,
    stateDir: "/tmp/state",
    dbPath: "/tmp/state.sqlite",
    keybindingsConfigPath: "/tmp/keybindings.json",
    settingsPath: "/tmp/settings.json",
    providerStatusCacheDir: "/tmp/caches",
    worktreesDir: "/tmp/worktrees",
    attachmentsDir: "/tmp/attachments",
    logsDir: "/tmp/logs",
    serverLogPath: "/tmp/logs/server.log",
    serverTracePath: "/tmp/logs/server.trace.ndjson",
    providerLogsDir: "/tmp/logs/provider",
    providerEventLogPath: "/tmp/logs/provider/events.log",
    terminalLogsDir: "/tmp/logs/terminals",
    anonymousIdPath: "/tmp/state/anonymous-id",
    environmentIdPath: "/tmp/state/environment-id",
    serverRuntimeStatePath: "/tmp/state/server-runtime.json",
    secretsDir: "/tmp/state/secrets",
    ...overrides,
  } as unknown as ServerConfigShape;
}

describe("isOriginAllowed", () => {
  const config = makeConfig({ port: 3773, host: "localhost" });

  it("allows undefined origin (same-origin / non-browser)", () => {
    expect(isOriginAllowed(undefined, config)).toBe(true);
  });

  it("allows loopback origins on any port", () => {
    expect(isOriginAllowed("http://localhost:5173", config)).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:5173", config)).toBe(true);
    expect(isOriginAllowed("http://localhost:3773", config)).toBe(true);
  });

  it("allows the server's own origin", () => {
    expect(isOriginAllowed("http://localhost:3773", config)).toBe(true);
  });

  it("rejects arbitrary external origins", () => {
    expect(isOriginAllowed("https://evil.example.com", config)).toBe(false);
    expect(isOriginAllowed("http://192.168.1.5:8080", config)).toBe(false);
  });

  it("rejects malformed origins", () => {
    expect(isOriginAllowed("not-a-url", config)).toBe(false);
  });

  it("allows configured devUrl origin", () => {
    const configWithDev = makeConfig({
      devUrl: new URL("http://127.0.0.1:5173"),
    });
    expect(isOriginAllowed("http://127.0.0.1:5173", configWithDev)).toBe(true);
  });

  it("allows configured publicUrl origin", () => {
    const configWithPublic = makeConfig({
      publicUrl: new URL("https://trifecta.example.com"),
    });
    expect(isOriginAllowed("https://trifecta.example.com", configWithPublic)).toBe(true);
    expect(isOriginAllowed("https://other.example.com", configWithPublic)).toBe(false);
  });
});

describe("buildCorsHeaders", () => {
  const config = makeConfig({ port: 3773, host: "localhost" });

  it("reflects allowed origin in access-control-allow-origin", () => {
    const headers = buildCorsHeaders("http://localhost:5173", config);
    expect(headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(headers["access-control-allow-credentials"]).toBe("true");
    expect(headers["vary"]).toBe("Origin");
  });

  it("does not set access-control-allow-origin for disallowed origins", () => {
    const headers = buildCorsHeaders("https://evil.example.com", config);
    expect(headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not set access-control-allow-origin for same-origin (no origin)", () => {
    const headers = buildCorsHeaders(undefined, config);
    expect(headers["access-control-allow-origin"]).toBeUndefined();
    expect(headers["access-control-allow-methods"]).toBeDefined();
  });
});

describe("computeAllowedOriginsList", () => {
  it("includes loopback origins with server port", () => {
    const config = makeConfig({ port: 3773, host: "localhost" });
    const origins = computeAllowedOriginsList(config);
    expect(origins).toContain("http://localhost:3773");
    expect(origins).toContain("http://127.0.0.1:3773");
    expect(origins).toContain("http://::1:3773");
  });

  it("includes devUrl when configured", () => {
    const config = makeConfig({
      port: 3773,
      devUrl: new URL("http://127.0.0.1:5173"),
    });
    const origins = computeAllowedOriginsList(config);
    expect(origins).toContain("http://127.0.0.1:5173");
  });

  it("includes publicUrl when configured", () => {
    const config = makeConfig({
      port: 3773,
      publicUrl: new URL("https://trifecta.example.com"),
    });
    const origins = computeAllowedOriginsList(config);
    expect(origins).toContain("https://trifecta.example.com");
  });
});
