import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BelweaveCloudConfig, EnvironmentId, LocalApi } from "@belweave/contracts";

import {
  getConnectedSandboxLink,
  hydrateBelweaveCloud,
  removeConnectedSandboxLink,
  useBelweaveCloudStore,
} from "./store";

let storedConfig: BelweaveCloudConfig | null = null;

function seedConfig(config: BelweaveCloudConfig): void {
  storedConfig = config;
}

beforeEach(async () => {
  storedConfig = null;
  vi.stubGlobal("window", {
    nativeApi: {
      persistence: {
        getClientSettings: async () => null,
        setClientSettings: async () => undefined,
        getSavedEnvironmentRegistry: async () => [],
        setSavedEnvironmentRegistry: async () => undefined,
        getSavedEnvironmentSecret: async () => null,
        setSavedEnvironmentSecret: async () => true,
        removeSavedEnvironmentSecret: async () => undefined,
        getBelweaveCloudConfig: async () => storedConfig,
        setBelweaveCloudConfig: async (config) => {
          storedConfig = config;
        },
        getBelweaveCloudApiKey: async () => null,
        setBelweaveCloudApiKey: async () => true,
        removeBelweaveCloudApiKey: async () => undefined,
      },
    } satisfies Pick<LocalApi, "persistence">,
  });
  const { __resetLocalApiForTests } = await import("../../localApi");
  await __resetLocalApiForTests();
});

afterEach(async () => {
  const { __resetLocalApiForTests } = await import("../../localApi");
  await __resetLocalApiForTests();
  vi.unstubAllGlobals();
});

describe("belweave cloud sandbox <-> environment correlation", () => {
  it("hydrates persisted sandbox links from config", async () => {
    seedConfig({
      apiBaseUrl: "https://app.belweave.ai",
      connectedSandboxes: [
        {
          sandboxId: 123,
          environmentId: "env_abc" as EnvironmentId,
          name: "trifecta-dev",
          connectedAt: "2026-07-06T12:00:00.000Z",
        },
      ],
    });

    await hydrateBelweaveCloud();

    expect(useBelweaveCloudStore.getState().apiBaseUrl).toBe("https://app.belweave.ai");
    expect(getConnectedSandboxLink(123)?.environmentId).toBe("env_abc");
    expect(getConnectedSandboxLink(999)).toBeUndefined();
  });

  it("removes a sandbox link and persists the change", async () => {
    seedConfig({
      apiBaseUrl: "https://app.belweave.ai",
      connectedSandboxes: [
        {
          sandboxId: 123,
          environmentId: "env_abc" as EnvironmentId,
          name: "trifecta-dev",
          connectedAt: "2026-07-06T12:00:00.000Z",
        },
      ],
    });
    await hydrateBelweaveCloud();

    await removeConnectedSandboxLink(123);

    expect(getConnectedSandboxLink(123)).toBeUndefined();
    expect(useBelweaveCloudStore.getState().connectedSandboxes).toHaveLength(0);
    expect(storedConfig?.connectedSandboxes).toHaveLength(0);
  });
});
