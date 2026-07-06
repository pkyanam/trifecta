import {
  DEFAULT_BELWEAVE_CLOUD_CONFIG,
  type BelweaveCloudConfig,
  type BelweaveCloudConnectedSandbox,
  type BelweaveCloudCreateSandboxInput,
  type BelweaveCloudSandbox,
  type EnvironmentId,
} from "@belweave/contracts";
import { create } from "zustand";

import { ensureLocalApi } from "../../localApi";
import { addSavedEnvironment, removeSavedEnvironment } from "../runtime";
import {
  bootstrapTrifecta,
  createSandbox as apiCreateSandbox,
  deleteSandbox as apiDeleteSandbox,
  listSandboxes,
  resumeSandbox as apiResumeSandbox,
  stopSandbox as apiStopSandbox,
  BelweaveCloudApiError,
  type BelweaveCloudApiCredentials,
} from "./api";
import { redactForLog } from "./redact";

const BOOTSTRAP_TIMEOUT_MS = 5 * 60 * 1000;

function logStage(stage: string, detail?: unknown): void {
  if (detail === undefined) {
    console.info(`[belweave-cloud] ${stage}`);
  } else {
    console.info(`[belweave-cloud] ${stage}`, redactForLog(detail));
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BelweaveCloudApiError("remote_start_failed", message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type BelweaveCloudConnectionStatus = "unknown" | "connected" | "error";
export type BelweaveCloudSandboxAction = "resume" | "stop" | "delete" | "connect";

interface BelweaveCloudStoreState {
  readonly hydrated: boolean;
  readonly apiBaseUrl: string | null;
  readonly hasApiKey: boolean;
  readonly connectedSandboxes: readonly BelweaveCloudConnectedSandbox[];
  readonly connectionStatus: BelweaveCloudConnectionStatus;
  readonly connectionError: string | null;
  readonly sandboxes: readonly BelweaveCloudSandbox[];
  readonly listState: "idle" | "loading" | "loaded" | "error";
  readonly listError: string | null;
  readonly creating: boolean;
  readonly pendingActions: Readonly<Record<number, BelweaveCloudSandboxAction>>;
  readonly patch: (patch: Partial<BelweaveCloudStoreState>) => void;
}

// Keep the API key out of the reactive store so it never lands in state
// snapshots, devtools, or component renders. Only `hasApiKey` is exposed.
let apiKeyRef: string | null = null;
let hydrationPromise: Promise<void> | null = null;

export const useBelweaveCloudStore = create<BelweaveCloudStoreState>()((set) => ({
  hydrated: false,
  apiBaseUrl: null,
  hasApiKey: false,
  connectedSandboxes: [],
  connectionStatus: "unknown",
  connectionError: null,
  sandboxes: [],
  listState: "idle",
  listError: null,
  creating: false,
  pendingActions: {},
  patch: (patch) => set(patch),
}));

function isoNow(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  if (error instanceof BelweaveCloudApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function setPendingAction(sandboxId: number, action: BelweaveCloudSandboxAction | null): void {
  const { pendingActions } = useBelweaveCloudStore.getState();
  if (action === null) {
    const { [sandboxId]: _removed, ...rest } = pendingActions;
    useBelweaveCloudStore.getState().patch({ pendingActions: rest });
    return;
  }
  useBelweaveCloudStore
    .getState()
    .patch({ pendingActions: { ...pendingActions, [sandboxId]: action } });
}

function currentConfig(): BelweaveCloudConfig {
  const { apiBaseUrl, connectedSandboxes } = useBelweaveCloudStore.getState();
  return { apiBaseUrl, connectedSandboxes };
}

async function persistConfig(config: BelweaveCloudConfig): Promise<void> {
  await ensureLocalApi().persistence.setBelweaveCloudConfig(config);
}

function requireCredentials(): BelweaveCloudApiCredentials {
  const { apiBaseUrl } = useBelweaveCloudStore.getState();
  if (!apiBaseUrl || !apiKeyRef) {
    throw new BelweaveCloudApiError(
      "invalid_config",
      "Connect a Belweave Cloud account before running this action.",
    );
  }
  return { apiBaseUrl, apiKey: apiKeyRef };
}

export async function hydrateBelweaveCloud(): Promise<void> {
  if (useBelweaveCloudStore.getState().hydrated) {
    return;
  }
  if (hydrationPromise) {
    return hydrationPromise;
  }

  hydrationPromise = (async () => {
    try {
      const persistence = ensureLocalApi().persistence;
      const [config, apiKey] = await Promise.all([
        persistence.getBelweaveCloudConfig(),
        persistence.getBelweaveCloudApiKey(),
      ]);
      apiKeyRef = apiKey;
      const resolved = config ?? DEFAULT_BELWEAVE_CLOUD_CONFIG;
      useBelweaveCloudStore.getState().patch({
        apiBaseUrl: resolved.apiBaseUrl,
        connectedSandboxes: resolved.connectedSandboxes,
        hasApiKey: apiKey !== null && apiKey.length > 0,
      });
    } catch (error) {
      console.error("[belweave-cloud] hydrate failed", errorMessage(error));
    } finally {
      useBelweaveCloudStore.getState().patch({ hydrated: true });
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

/** Persist a new API base URL + API key and verify the connection. */
export async function saveBelweaveCloudCredentials(input: {
  readonly apiBaseUrl: string;
  readonly apiKey: string;
}): Promise<void> {
  const apiBaseUrl = input.apiBaseUrl.trim();
  const apiKey = input.apiKey.trim();
  if (!apiBaseUrl) {
    throw new BelweaveCloudApiError("invalid_config", "Enter a Belweave Cloud API URL.");
  }
  if (!apiKey) {
    throw new BelweaveCloudApiError("invalid_config", "Enter a Belweave Cloud API key.");
  }

  const persistence = ensureLocalApi().persistence;
  const stored = await persistence.setBelweaveCloudApiKey(apiKey);
  if (!stored) {
    throw new BelweaveCloudApiError(
      "invalid_config",
      "Secure credential storage is unavailable on this device.",
    );
  }
  apiKeyRef = apiKey;

  const config: BelweaveCloudConfig = {
    apiBaseUrl,
    connectedSandboxes: useBelweaveCloudStore.getState().connectedSandboxes,
  };
  await persistConfig(config);
  useBelweaveCloudStore.getState().patch({
    apiBaseUrl,
    hasApiKey: true,
    connectionStatus: "unknown",
    connectionError: null,
  });

  await testBelweaveCloudConnection();
  await refreshBelweaveCloudSandboxes();
}

/** Forget the stored API key and reset connection state. */
export async function clearBelweaveCloudCredentials(): Promise<void> {
  await ensureLocalApi().persistence.removeBelweaveCloudApiKey();
  apiKeyRef = null;
  useBelweaveCloudStore.getState().patch({
    hasApiKey: false,
    connectionStatus: "unknown",
    connectionError: null,
    sandboxes: [],
    listState: "idle",
    listError: null,
  });
}

export async function testBelweaveCloudConnection(): Promise<boolean> {
  try {
    const credentials = requireCredentials();
    await listSandboxes(credentials);
    useBelweaveCloudStore.getState().patch({
      connectionStatus: "connected",
      connectionError: null,
    });
    return true;
  } catch (error) {
    useBelweaveCloudStore.getState().patch({
      connectionStatus: "error",
      connectionError: errorMessage(error),
    });
    return false;
  }
}

export async function refreshBelweaveCloudSandboxes(): Promise<void> {
  let credentials: BelweaveCloudApiCredentials;
  try {
    credentials = requireCredentials();
  } catch {
    return;
  }

  useBelweaveCloudStore.getState().patch({ listState: "loading", listError: null });
  try {
    const sandboxes = await listSandboxes(credentials);
    useBelweaveCloudStore.getState().patch({
      sandboxes,
      listState: "loaded",
      listError: null,
      connectionStatus: "connected",
      connectionError: null,
    });
  } catch (error) {
    useBelweaveCloudStore.getState().patch({
      listState: "error",
      listError: errorMessage(error),
      ...(error instanceof BelweaveCloudApiError && error.code === "unauthorized"
        ? { connectionStatus: "error" as const, connectionError: errorMessage(error) }
        : {}),
    });
    throw error;
  }
}

export async function createBelweaveCloudSandbox(
  input: BelweaveCloudCreateSandboxInput,
): Promise<BelweaveCloudSandbox> {
  const credentials = requireCredentials();
  useBelweaveCloudStore.getState().patch({ creating: true });
  try {
    const sandbox = await apiCreateSandbox(credentials, input);
    await refreshBelweaveCloudSandboxes();
    return sandbox;
  } finally {
    useBelweaveCloudStore.getState().patch({ creating: false });
  }
}

export async function resumeBelweaveCloudSandbox(sandboxId: number): Promise<void> {
  const credentials = requireCredentials();
  setPendingAction(sandboxId, "resume");
  try {
    await apiResumeSandbox(credentials, sandboxId);
    await refreshBelweaveCloudSandboxes();
  } finally {
    setPendingAction(sandboxId, null);
  }
}

export async function stopBelweaveCloudSandbox(sandboxId: number): Promise<void> {
  const credentials = requireCredentials();
  setPendingAction(sandboxId, "stop");
  try {
    await apiStopSandbox(credentials, sandboxId);
    await refreshBelweaveCloudSandboxes();
  } finally {
    setPendingAction(sandboxId, null);
  }
}

export async function deleteBelweaveCloudSandbox(sandboxId: number): Promise<void> {
  const credentials = requireCredentials();
  setPendingAction(sandboxId, "delete");
  try {
    await apiDeleteSandbox(credentials, sandboxId);
    await removeConnectedSandboxLink(sandboxId, { removeEnvironment: true });
    await refreshBelweaveCloudSandboxes();
  } finally {
    setPendingAction(sandboxId, null);
  }
}

/**
 * Bootstrap remote Trifecta inside the sandbox and register it as a normal
 * remote saved environment using the Belweave-provided pairing descriptor.
 */
export async function connectBelweaveCloudSandbox(sandboxId: number): Promise<EnvironmentId> {
  const credentials = requireCredentials();
  setPendingAction(sandboxId, "connect");
  try {
    logStage("bootstrap requested", { sandboxId });
    const { sandbox, environment } = await withTimeout(
      bootstrapTrifecta(credentials, sandboxId),
      BOOTSTRAP_TIMEOUT_MS,
      "Timed out waiting for Belweave Cloud to start Trifecta in the sandbox.",
    );
    logStage("bootstrap returned environment", {
      label: environment.label,
      environmentId: environment.environmentId,
      httpBaseUrl: environment.httpBaseUrl,
      wsBaseUrl: environment.wsBaseUrl,
      hasPairingUrl: Boolean(environment.pairingUrl),
      hasPairingCredential: Boolean(environment.pairingCredential),
    });

    if (!environment.pairingUrl && !environment.pairingCredential) {
      throw new BelweaveCloudApiError(
        "remote_start_failed",
        "Belweave Cloud did not return a pairing credential for this sandbox.",
      );
    }

    logStage("registering saved environment");
    const record = environment.pairingUrl
      ? await addSavedEnvironment({
          label: environment.label,
          pairingUrl: environment.pairingUrl,
        })
      : await addSavedEnvironment({
          label: environment.label,
          host: environment.httpBaseUrl,
          pairingCode: environment.pairingCredential!,
        });
    logStage("saved environment registered", { environmentId: record.environmentId });

    await upsertConnectedSandboxLink({
      sandboxId,
      environmentId: record.environmentId,
      name: sandbox.name,
      connectedAt: isoNow(),
    });
    await refreshBelweaveCloudSandboxes();
    logStage("connect complete", { environmentId: record.environmentId });
    return record.environmentId;
  } catch (error) {
    logStage("connect failed", { message: errorMessage(error) });
    throw error;
  } finally {
    setPendingAction(sandboxId, null);
  }
}

async function upsertConnectedSandboxLink(link: BelweaveCloudConnectedSandbox): Promise<void> {
  const existing = useBelweaveCloudStore.getState().connectedSandboxes;
  const connectedSandboxes = [
    ...existing.filter((entry) => entry.sandboxId !== link.sandboxId),
    link,
  ];
  useBelweaveCloudStore.getState().patch({ connectedSandboxes });
  await persistConfig(currentConfig());
}

export async function removeConnectedSandboxLink(
  sandboxId: number,
  options?: { readonly removeEnvironment?: boolean },
): Promise<void> {
  const existing = useBelweaveCloudStore.getState().connectedSandboxes;
  const link = existing.find((entry) => entry.sandboxId === sandboxId);
  if (!link) {
    return;
  }
  if (options?.removeEnvironment) {
    await removeSavedEnvironment(link.environmentId).catch((error) => {
      console.error("[belweave-cloud] failed to remove saved environment", errorMessage(error));
    });
  }
  useBelweaveCloudStore.getState().patch({
    connectedSandboxes: existing.filter((entry) => entry.sandboxId !== sandboxId),
  });
  await persistConfig(currentConfig());
}

export function getConnectedSandboxLink(
  sandboxId: number,
): BelweaveCloudConnectedSandbox | undefined {
  return useBelweaveCloudStore
    .getState()
    .connectedSandboxes.find((entry) => entry.sandboxId === sandboxId);
}

export function resetBelweaveCloudStoreForTests(): void {
  apiKeyRef = null;
  hydrationPromise = null;
  useBelweaveCloudStore.setState({
    hydrated: false,
    apiBaseUrl: null,
    hasApiKey: false,
    connectedSandboxes: [],
    connectionStatus: "unknown",
    connectionError: null,
    sandboxes: [],
    listState: "idle",
    listError: null,
    creating: false,
    pendingActions: {},
  });
}
