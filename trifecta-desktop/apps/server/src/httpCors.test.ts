import { describe, expect, it } from "vitest";

import type { ServerConfigShape } from "./config.ts";
import {
  buildCorsHeaders,
  computeAllowedOriginsList,
  isLocalNetworkOrigin,
  isOriginAllowed,
  isWebSocketOriginAllowed,
} from "./httpCors.ts";

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

  it("allows IPv6 loopback origin with brackets", () => {
    expect(isOriginAllowed("http://[::1]:5173", config)).toBe(true);
    expect(isOriginAllowed("http://[::1]:3773", config)).toBe(true);
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
    expect(origins).toContain("http://[::1]:3773");
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

describe("isLocalNetworkOrigin", () => {
  it("allows loopback origins", () => {
    expect(isLocalNetworkOrigin(new URL("http://localhost:8081"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://127.0.0.1:8081"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://[::1]:8081"))).toBe(true);
  });

  it("allows Android emulator host alias", () => {
    expect(isLocalNetworkOrigin(new URL("http://10.0.2.2:8081"))).toBe(true);
  });

  it("allows RFC 1918 private ranges", () => {
    expect(isLocalNetworkOrigin(new URL("http://10.0.0.1:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://10.255.255.255:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://172.16.0.1:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://172.31.255.255:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://192.168.1.31:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://192.168.0.1:13773"))).toBe(true);
  });

  it("rejects non-private IP ranges", () => {
    expect(isLocalNetworkOrigin(new URL("http://172.15.0.1:13773"))).toBe(false);
    expect(isLocalNetworkOrigin(new URL("http://172.32.0.1:13773"))).toBe(false);
    expect(isLocalNetworkOrigin(new URL("http://11.0.0.1:13773"))).toBe(false);
  });

  it("allows IPv6 ULA and link-local", () => {
    expect(isLocalNetworkOrigin(new URL("http://[fd12:3456::1]:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://[fe80::1]:13773"))).toBe(true);
  });

  it("allows .local mDNS hostnames", () => {
    expect(isLocalNetworkOrigin(new URL("http://my-mac.local:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://preetham-macbook.local:13773"))).toBe(true);
  });

  it("allows Tailscale 100.x.y.z range", () => {
    expect(isLocalNetworkOrigin(new URL("http://100.64.0.1:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://100.127.255.255:13773"))).toBe(true);
    expect(isLocalNetworkOrigin(new URL("http://100.63.255.255:13773"))).toBe(false);
    expect(isLocalNetworkOrigin(new URL("http://100.128.0.1:13773"))).toBe(false);
  });

  it("rejects public internet origins", () => {
    expect(isLocalNetworkOrigin(new URL("https://evil.example.com"))).toBe(false);
    expect(isLocalNetworkOrigin(new URL("http://8.8.8.8:13773"))).toBe(false);
  });
});

describe("isWebSocketOriginAllowed", () => {
  const config = makeConfig({ port: 3773, host: "localhost" });

  it("allows undefined origin (non-browser clients like iOS/SocketRocket)", () => {
    expect(isWebSocketOriginAllowed(undefined, config)).toBe(true);
  });

  it("allows loopback origins on any port", () => {
    expect(isWebSocketOriginAllowed("http://localhost:5173", config)).toBe(true);
    expect(isWebSocketOriginAllowed("http://127.0.0.1:5173", config)).toBe(true);
    expect(isWebSocketOriginAllowed("http://[::1]:3773", config)).toBe(true);
  });

  it("allows LAN/private network origins (mobile clients)", () => {
    expect(isWebSocketOriginAllowed("http://192.168.1.31:13773", config)).toBe(true);
    expect(isWebSocketOriginAllowed("http://10.0.0.5:13773", config)).toBe(true);
    expect(isWebSocketOriginAllowed("http://172.16.0.1:13773", config)).toBe(true);
  });

  it("allows mDNS and Tailscale origins", () => {
    expect(isWebSocketOriginAllowed("http://my-mac.local:13773", config)).toBe(true);
    expect(isWebSocketOriginAllowed("http://100.64.1.2:13773", config)).toBe(true);
  });

  it("allows configured devUrl and publicUrl", () => {
    const configWithUrls = makeConfig({
      devUrl: new URL("http://127.0.0.1:5173"),
      publicUrl: new URL("https://trifecta.example.com"),
    });
    expect(isWebSocketOriginAllowed("http://127.0.0.1:5173", configWithUrls)).toBe(true);
    expect(isWebSocketOriginAllowed("https://trifecta.example.com", configWithUrls)).toBe(true);
  });

  it("allows same-host origins (native clients via reverse proxy / tunnel)", () => {
    expect(
      isWebSocketOriginAllowed(
        "https://box-3773.on.example.dev",
        config,
        "box-3773.on.example.dev",
      ),
    ).toBe(true);
    // Explicit default port in Host header normalizes to the same host.
    expect(
      isWebSocketOriginAllowed(
        "https://box-3773.on.example.dev",
        config,
        "box-3773.on.example.dev:443",
      ),
    ).toBe(true);
    // Case-insensitive host comparison.
    expect(
      isWebSocketOriginAllowed(
        "https://Box-3773.on.Example.dev",
        config,
        "box-3773.on.example.dev",
      ),
    ).toBe(true);
  });

  it("rejects cross-host origins even when a request host is provided", () => {
    expect(
      isWebSocketOriginAllowed("https://evil.example.com", config, "box-3773.on.example.dev"),
    ).toBe(false);
    expect(
      isWebSocketOriginAllowed(
        "https://box-3773.on.example.dev:8443",
        config,
        "box-3773.on.example.dev",
      ),
    ).toBe(false);
  });

  it("rejects arbitrary external origins", () => {
    expect(isWebSocketOriginAllowed("https://evil.example.com", config)).toBe(false);
    expect(isWebSocketOriginAllowed("http://8.8.8.8:13773", config)).toBe(false);
  });

  it("rejects malformed origins", () => {
    expect(isWebSocketOriginAllowed("not-a-url", config)).toBe(false);
    expect(isWebSocketOriginAllowed("not-a-url", config, "box-3773.on.example.dev")).toBe(false);
  });
});
