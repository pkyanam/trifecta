import { describe, expect, it } from "vitest";

import { isLoopbackHostname, resolveDevRedirectUrl } from "./http.ts";

// Use process.getBuiltinModule to bypass the effect(nodeBuiltinImport) lint
// rule — this is a vitest test, not an Effect runtime context.
const nodeFs = process.getBuiltinModule("fs") as typeof import("node:fs");
const nodePath = process.getBuiltinModule("path") as typeof import("node:path");

describe("http dev routing", () => {
  it("treats localhost and loopback addresses as local", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
  });

  it("does not treat LAN addresses as local", () => {
    expect(isLoopbackHostname("192.168.86.35")).toBe(false);
    expect(isLoopbackHostname("10.0.0.24")).toBe(false);
    expect(isLoopbackHostname("example.local")).toBe(false);
  });

  it("preserves path and query when redirecting to the dev server", () => {
    const devUrl = new URL("http://127.0.0.1:5173/");
    const requestUrl = new URL("http://127.0.0.1:3774/pair?token=test-token");

    expect(resolveDevRedirectUrl(devUrl, requestUrl)).toBe(
      "http://127.0.0.1:5173/pair?token=test-token",
    );
  });
});

describe("Content Security Policy", () => {
  const indexHtmlPath = nodePath.resolve(__dirname, "../../web/index.html");
  const indexHtml = nodeFs.readFileSync(indexHtmlPath, "utf-8");

  it("index.html contains a CSP meta tag", () => {
    expect(indexHtml).toContain('http-equiv="Content-Security-Policy"');
  });

  it("CSP restricts default-src to self", () => {
    expect(indexHtml).toContain("default-src 'self'");
  });

  it("CSP restricts object-src to none", () => {
    expect(indexHtml).toContain("object-src 'none'");
  });

  it("CSP restricts base-uri to self", () => {
    expect(indexHtml).toContain("base-uri 'self'");
  });

  it("CSP allows WebSocket connections", () => {
    expect(indexHtml).toContain("connect-src 'self' ws: wss:");
  });

  it("CSP allows inline scripts (theme detection)", () => {
    expect(indexHtml).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("CSP allows inline styles and Google Fonts", () => {
    expect(indexHtml).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
  });
});
