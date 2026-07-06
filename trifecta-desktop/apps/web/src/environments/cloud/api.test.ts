import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BelweaveCloudApiError,
  buildEndpointUrl,
  createSandbox,
  listSandboxes,
  stopSandbox,
} from "./api";

const credentials = { apiBaseUrl: "https://app.belweave.ai", apiKey: "bw_test_key" };

const originalFetch = globalThis.fetch;

function mockFetch(responder: (url: string, init: RequestInit) => Response): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    responder(String(input), init ?? {}),
  ) as unknown as typeof fetch;
}

const sampleSandbox = {
  id: 123,
  name: "trifecta-dev",
  tier: "standard",
  rateCentsPerHr: 5,
  state: "ready",
  createdAt: "2026-07-06T12:00:00.000Z",
  stoppedAt: null,
  stoppedReason: null,
  sshUser: "root",
  desktopAvailable: false,
  snapshotAvailable: true,
  archiveAfter: null,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("buildEndpointUrl", () => {
  it("appends the public API prefix to a dashboard root", () => {
    expect(buildEndpointUrl("https://app.belweave.ai", "/sandboxes")).toBe(
      "https://app.belweave.ai/api/v1/sandboxes",
    );
  });

  it("does not double the prefix when the base already includes it", () => {
    expect(buildEndpointUrl("https://app.belweave.ai/api/v1", "/sandboxes/1/resume")).toBe(
      "https://app.belweave.ai/api/v1/sandboxes/1/resume",
    );
  });

  it("assumes https and trims trailing slashes", () => {
    expect(buildEndpointUrl("app.belweave.ai/", "/sandboxes")).toBe(
      "https://app.belweave.ai/api/v1/sandboxes",
    );
  });

  it("rejects an empty base URL", () => {
    expect(() => buildEndpointUrl("", "/sandboxes")).toThrow(BelweaveCloudApiError);
  });
});

describe("belweave cloud api client", () => {
  it("sends the bearer key and parses the sandbox list", async () => {
    let seenAuth: string | null = null;
    mockFetch((url, init) => {
      expect(url).toBe("https://app.belweave.ai/api/v1/sandboxes");
      seenAuth = new Headers(init.headers).get("authorization");
      return new Response(JSON.stringify({ sandboxes: [sampleSandbox] }), { status: 200 });
    });

    const sandboxes = await listSandboxes(credentials);
    expect(seenAuth).toBe("Bearer bw_test_key");
    expect(sandboxes).toHaveLength(1);
    expect(sandboxes[0]?.id).toBe(123);
  });

  it("unwraps the sandbox envelope for create", async () => {
    mockFetch(() => new Response(JSON.stringify({ sandbox: sampleSandbox }), { status: 201 }));
    const sandbox = await createSandbox(credentials, { name: "trifecta-dev", tier: "standard" });
    expect(sandbox.name).toBe("trifecta-dev");
  });

  it("maps a structured error body to a typed error", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: "insufficient_credits", message: "Add credits." } }),
          { status: 402 },
        ),
    );

    await expect(stopSandbox(credentials, 1)).rejects.toMatchObject({
      code: "insufficient_credits",
      message: "Add credits.",
      status: 402,
    });
  });

  it("flags an unexpected response shape as invalid_response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch(
      () =>
        new Response(JSON.stringify({ sandboxes: [{ id: "not-a-number" }] }), {
          status: 200,
        }),
    );

    await expect(listSandboxes(credentials)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("wraps network failures", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await expect(listSandboxes(credentials)).rejects.toMatchObject({ code: "network_error" });
  });
});
