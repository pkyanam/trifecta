import { CloudIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { BelweaveCloudSandbox, BelweaveCloudTier } from "@belweave/contracts";

import { cn } from "../../lib/utils";
import {
  clearBelweaveCloudCredentials,
  connectBelweaveCloudSandbox,
  createBelweaveCloudSandbox,
  deleteBelweaveCloudSandbox,
  getConnectedSandboxLink,
  hydrateBelweaveCloud,
  refreshBelweaveCloudSandboxes,
  removeConnectedSandboxLink,
  resumeBelweaveCloudSandbox,
  saveBelweaveCloudCredentials,
  stopBelweaveCloudSandbox,
  testBelweaveCloudConnection,
  useBelweaveCloudStore,
} from "~/environments/cloud";
import { useSavedEnvironmentRegistryStore } from "~/environments/runtime";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  BELWEAVE_CLOUD_TIER_OPTIONS,
  canConnectSandbox,
  canStartSandbox,
  canStopSandbox,
  describeSandboxState,
  formatSandboxRate,
} from "./CloudSettings.logic";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const ROW_CLASSNAME = "border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5";

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : timestampFormatter.format(parsed);
}

function reportError(title: string, error: unknown): void {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : String(error),
    }),
  );
}

function ConnectionStatusBadge() {
  const status = useBelweaveCloudStore((state) => state.connectionStatus);
  if (status === "connected") {
    return <Badge variant="success">Connected</Badge>;
  }
  if (status === "error") {
    return <Badge variant="error">Connection error</Badge>;
  }
  return <Badge variant="outline">Not verified</Badge>;
}

function CloudAccountSection() {
  const hasApiKey = useBelweaveCloudStore((state) => state.hasApiKey);
  const apiBaseUrl = useBelweaveCloudStore((state) => state.apiBaseUrl);
  const connectionError = useBelweaveCloudStore((state) => state.connectionError);

  const [isEditing, setIsEditing] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showForm = !hasApiKey || isEditing;

  const handleConnect = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setFormError(null);
      setIsSaving(true);
      try {
        await saveBelweaveCloudCredentials({ apiBaseUrl: urlDraft, apiKey: keyDraft });
        setIsEditing(false);
        setKeyDraft("");
        toastManager.add({
          type: "success",
          title: "Belweave Cloud connected",
          description: "Your Belweave Cloud account is ready to use.",
        });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsSaving(false);
      }
    },
    [keyDraft, urlDraft],
  );

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    try {
      const ok = await testBelweaveCloudConnection();
      if (ok) {
        toastManager.add({
          type: "success",
          title: "Connection verified",
          description: "Belweave Cloud responded successfully.",
        });
      } else {
        reportError(
          "Connection failed",
          useBelweaveCloudStore.getState().connectionError ?? "Unable to reach Belweave Cloud.",
        );
      }
    } finally {
      setIsTesting(false);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    const confirmed = window.confirm(
      "Disconnect Belweave Cloud? Your stored API key will be removed from this device.",
    );
    if (!confirmed) return;
    try {
      await clearBelweaveCloudCredentials();
      setIsEditing(false);
    } catch (error) {
      reportError("Could not disconnect", error);
    }
  }, []);

  return (
    <SettingsSection title="Belweave Cloud account" icon={<CloudIcon className="size-3.5" />}>
      {showForm ? (
        <form className={ROW_CLASSNAME} onSubmit={handleConnect}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                className="text-[13px] font-semibold text-foreground"
                htmlFor="belweave-cloud-url"
              >
                API URL
              </label>
              <Input
                id="belweave-cloud-url"
                placeholder="https://app.belweave.ai"
                autoComplete="off"
                spellCheck={false}
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
              />
              <p className="text-xs text-muted-foreground/80">
                Your Belweave Cloud dashboard URL. The public API path is added automatically.
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                className="text-[13px] font-semibold text-foreground"
                htmlFor="belweave-cloud-key"
              >
                API key
              </label>
              <Input
                id="belweave-cloud-key"
                type="password"
                placeholder="bw_…"
                autoComplete="off"
                spellCheck={false}
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
              />
              <p className="text-xs text-muted-foreground/80">
                Generate an API key in Belweave Cloud settings. Stored securely on this device.
              </p>
            </div>
            {formError ? <p className="text-xs text-destructive-foreground">{formError}</p> : null}
            <div className="flex items-center gap-2">
              <Button size="xs" type="submit" disabled={isSaving}>
                {isSaving ? <Spinner className="size-3.5" /> : null}
                {hasApiKey ? "Save" : "Connect"}
              </Button>
              {hasApiKey ? (
                <Button
                  size="xs"
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => {
                    setIsEditing(false);
                    setFormError(null);
                    setKeyDraft("");
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      ) : (
        <div className={ROW_CLASSNAME}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold text-foreground">Connected account</h3>
                <ConnectionStatusBadge />
              </div>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{apiBaseUrl}</p>
              {connectionError ? (
                <p className="text-[11px] text-destructive-foreground">{connectionError}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="xs" variant="outline" disabled={isTesting} onClick={handleTest}>
                {isTesting ? <Spinner className="size-3.5" /> : null}
                Test connection
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setUrlDraft(apiBaseUrl ?? "");
                  setKeyDraft("");
                  setFormError(null);
                  setIsEditing(true);
                }}
              >
                Edit
              </Button>
              <Button size="xs" variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

function CreateSandboxDialog() {
  const creating = useBelweaveCloudStore((state) => state.creating);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<BelweaveCloudTier>("standard");
  const [ttlMinutes, setTtlMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tierLabel =
    BELWEAVE_CLOUD_TIER_OPTIONS.find((option) => option.value === tier)?.label ?? "Standard";

  const resetForm = useCallback(() => {
    setName("");
    setTier("standard");
    setTtlMinutes("");
    setError(null);
  }, []);

  const handleCreate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError(null);
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError("Enter a sandbox name.");
        return;
      }
      const ttlSeconds = ttlMinutes.trim() ? Number.parseInt(ttlMinutes, 10) * 60 : null;
      if (ttlSeconds !== null && (!Number.isFinite(ttlSeconds) || ttlSeconds < 60)) {
        setError("Idle timeout must be at least 1 minute.");
        return;
      }
      try {
        await createBelweaveCloudSandbox({
          name: trimmedName,
          tier,
          ...(ttlSeconds !== null ? { ttlSeconds } : {}),
        });
        toastManager.add({
          type: "success",
          title: "Sandbox created",
          description: `${trimmedName} is provisioning.`,
        });
        setOpen(false);
        resetForm();
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : String(createError));
      }
    },
    [name, resetForm, tier, ttlMinutes],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger
        render={
          <Button
            size="xs"
            variant="ghost"
            className="h-5 gap-1 rounded-sm px-1 text-[11px] font-normal text-muted-foreground/60 hover:text-muted-foreground"
            aria-label="New sandbox"
          >
            <PlusIcon className="size-3" />
            <span>New sandbox</span>
          </Button>
        }
      />
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Belweave Cloud sandbox</DialogTitle>
          <DialogDescription>Provision a remote sandbox for Trifecta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate}>
          <DialogPanel className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground" htmlFor="sandbox-name">
                Name
              </label>
              <Input
                id="sandbox-name"
                placeholder="trifecta-dev"
                autoComplete="off"
                spellCheck={false}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-foreground">Tier</span>
              <Select value={tier} onValueChange={(value) => setTier(value as BelweaveCloudTier)}>
                <SelectTrigger className="w-full" aria-label="Sandbox tier">
                  <SelectValue>{tierLabel}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="start" alignItemWithTrigger={false}>
                  {BELWEAVE_CLOUD_TIER_OPTIONS.map((option) => (
                    <SelectItem hideIndicator key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground" htmlFor="sandbox-ttl">
                Idle timeout (minutes)
              </label>
              <Input
                id="sandbox-ttl"
                inputMode="numeric"
                placeholder="Optional (default 30)"
                value={ttlMinutes}
                onChange={(event) => setTtlMinutes(event.target.value)}
              />
            </div>
            {error ? <p className="text-xs text-destructive-foreground">{error}</p> : null}
          </DialogPanel>
          <DialogFooter variant="bare">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={creating}>
              {creating ? <Spinner className="size-3.5" /> : null}
              Create sandbox
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function SandboxRow({ sandbox }: { sandbox: BelweaveCloudSandbox }) {
  const pending = useBelweaveCloudStore((state) => state.pendingActions[sandbox.id] ?? null);
  // Re-render when the saved-environment registry changes so connection state stays fresh.
  useSavedEnvironmentRegistryStore((state) => state.byId);
  const connectedLink = getConnectedSandboxLink(sandbox.id);
  const statePresentation = describeSandboxState(sandbox.state);

  const runAction = useCallback(async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      reportError(label, error);
    }
  }, []);

  return (
    <div className={ROW_CLASSNAME}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {sandbox.name}
            </span>
            <Badge size="sm" variant={statePresentation.variant}>
              {statePresentation.label}
            </Badge>
            {connectedLink ? (
              <Badge size="sm" variant="info">
                Connected
              </Badge>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {formatSandboxRate(sandbox.rateCentsPerHr)} · Created{" "}
            {formatTimestamp(sandbox.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canConnectSandbox(sandbox) ? (
            <Button
              size="xs"
              disabled={pending !== null}
              onClick={() =>
                void runAction("Could not connect sandbox", async () => {
                  await connectBelweaveCloudSandbox(sandbox.id);
                  toastManager.add({
                    type: "success",
                    title: "Sandbox connected",
                    description: `${sandbox.name} is now available as a remote environment.`,
                  });
                })
              }
            >
              {pending === "connect" ? <Spinner className="size-3.5" /> : null}
              {connectedLink ? "Reconnect" : "Connect"}
            </Button>
          ) : null}
          {canStartSandbox(sandbox) ? (
            <Button
              size="xs"
              disabled={pending !== null}
              onClick={() =>
                void runAction("Could not start sandbox", async () => {
                  await resumeBelweaveCloudSandbox(sandbox.id);
                  toastManager.add({
                    type: "success",
                    title: "Sandbox starting",
                    description: `${sandbox.name} is starting up. Refresh in a moment to connect.`,
                  });
                })
              }
            >
              {pending === "resume" ? <Spinner className="size-3.5" /> : null}
              Start
            </Button>
          ) : null}
          {canStopSandbox(sandbox) ? (
            <Button
              size="xs"
              variant="outline"
              disabled={pending !== null}
              onClick={() =>
                void runAction("Could not stop sandbox", () => stopBelweaveCloudSandbox(sandbox.id))
              }
            >
              {pending === "stop" ? <Spinner className="size-3.5" /> : null}
              Stop
            </Button>
          ) : null}
          {connectedLink ? (
            <Button
              size="xs"
              variant="outline"
              disabled={pending !== null}
              onClick={() =>
                void runAction("Could not disconnect sandbox", () =>
                  removeConnectedSandboxLink(sandbox.id, { removeEnvironment: true }),
                )
              }
            >
              Disconnect
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            disabled={pending !== null}
            onClick={() => {
              const confirmed = window.confirm(
                `Delete sandbox "${sandbox.name}"? This cannot be undone.`,
              );
              if (!confirmed) return;
              void runAction("Could not delete sandbox", async () => {
                await deleteBelweaveCloudSandbox(sandbox.id);
                toastManager.add({
                  type: "success",
                  title: "Sandbox deleted",
                  description: `${sandbox.name} was removed.`,
                });
              });
            }}
          >
            {pending === "delete" ? <Spinner className="size-3.5" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function SandboxesSection() {
  const sandboxes = useBelweaveCloudStore((state) => state.sandboxes);
  const listState = useBelweaveCloudStore((state) => state.listState);
  const listError = useBelweaveCloudStore((state) => state.listError);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshBelweaveCloudSandboxes();
    } catch (error) {
      reportError("Could not refresh sandboxes", error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <SettingsSection
      title="Sandboxes"
      headerAction={
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="h-5 gap-1 rounded-sm px-1 text-[11px] font-normal text-muted-foreground/60 hover:text-muted-foreground"
            disabled={isRefreshing}
            onClick={handleRefresh}
            aria-label="Refresh sandboxes"
          >
            <RefreshCwIcon className={cn("size-3", isRefreshing && "animate-spin")} />
            <span>Refresh</span>
          </Button>
          <CreateSandboxDialog />
        </div>
      }
    >
      {sandboxes.map((sandbox) => (
        <SandboxRow key={sandbox.id} sandbox={sandbox} />
      ))}

      {sandboxes.length === 0 ? (
        <div className={ROW_CLASSNAME}>
          {listState === "loading" ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" /> Loading sandboxes…
            </p>
          ) : listState === "error" ? (
            <p className="text-xs text-destructive-foreground">
              {listError ?? "Failed to load sandboxes."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No sandboxes yet. Click &ldquo;New sandbox&rdquo; to provision one.
            </p>
          )}
        </div>
      ) : null}
    </SettingsSection>
  );
}

export function CloudSettings() {
  const hydrated = useBelweaveCloudStore((state) => state.hydrated);
  const hasApiKey = useBelweaveCloudStore((state) => state.hasApiKey);

  useEffect(() => {
    void hydrateBelweaveCloud();
  }, []);

  useEffect(() => {
    if (!hydrated || !hasApiKey) {
      return;
    }
    void refreshBelweaveCloudSandboxes().catch(() => undefined);
    // Poll so sandbox state transitions (starting → ready, idle → archived)
    // surface without a manual refresh while the Cloud page is open.
    const interval = setInterval(() => {
      void refreshBelweaveCloudSandboxes().catch(() => undefined);
    }, 20_000);
    return () => clearInterval(interval);
  }, [hydrated, hasApiKey]);

  const content = useMemo(
    () => (
      <>
        <CloudAccountSection />
        {hasApiKey ? <SandboxesSection /> : null}
      </>
    ),
    [hasApiKey],
  );

  return <SettingsPageContainer>{content}</SettingsPageContainer>;
}
