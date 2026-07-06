import type { BelweaveCloudSandbox, BelweaveCloudTier } from "@belweave/contracts";

const READY_STATES = new Set(["ready", "idle", "running"]);
const STOPPED_STATES = new Set(["archived", "archiving", "stopped", "error"]);
const TRANSIENT_STATES = new Set(["provisioning", "starting", "creating", "pending"]);

export type SandboxBadgeVariant = "success" | "warning" | "error" | "outline";

export interface SandboxStatePresentation {
  readonly label: string;
  readonly variant: SandboxBadgeVariant;
}

export function isSandboxReady(state: string): boolean {
  return READY_STATES.has(state);
}

export function isSandboxStopped(state: string): boolean {
  return STOPPED_STATES.has(state);
}

export function isSandboxTransient(state: string): boolean {
  return TRANSIENT_STATES.has(state);
}

/** Provider-neutral, human-readable state presentation for a sandbox. */
export function describeSandboxState(state: string): SandboxStatePresentation {
  if (READY_STATES.has(state)) {
    return { label: "Ready", variant: "success" };
  }
  if (TRANSIENT_STATES.has(state)) {
    return { label: "Starting", variant: "warning" };
  }
  if (state === "error") {
    return { label: "Error", variant: "error" };
  }
  if (STOPPED_STATES.has(state)) {
    return { label: "Stopped", variant: "outline" };
  }
  const normalized = state.length > 0 ? `${state[0]!.toUpperCase()}${state.slice(1)}` : "Unknown";
  return { label: normalized, variant: "outline" };
}

/**
 * A sandbox can be started whenever it is neither ready nor mid-transition.
 * This is a catch-all so idle/archived/stopped/error (and any unknown
 * not-running provider state) all surface a Start action, rather than relying
 * on an exhaustive list of stopped-state strings.
 */
export function canStartSandbox(sandbox: BelweaveCloudSandbox): boolean {
  return !isSandboxReady(sandbox.state) && !isSandboxTransient(sandbox.state);
}

export function canStopSandbox(sandbox: BelweaveCloudSandbox): boolean {
  return isSandboxReady(sandbox.state);
}

/** Connect (bootstrap + pair) is only offered once the sandbox is ready. */
export function canConnectSandbox(sandbox: BelweaveCloudSandbox): boolean {
  return isSandboxReady(sandbox.state);
}

export interface BelweaveCloudTierOption {
  readonly value: BelweaveCloudTier;
  readonly label: string;
}

export const BELWEAVE_CLOUD_TIER_OPTIONS: readonly BelweaveCloudTierOption[] = [
  { value: "free", label: "Free" },
  { value: "standard", label: "Standard" },
  { value: "plus", label: "Plus" },
];

/** Provider-neutral hourly rate label. Rates are integer cents. */
export function formatSandboxRate(rateCentsPerHr: number): string {
  if (!Number.isFinite(rateCentsPerHr) || rateCentsPerHr <= 0) {
    return "Free";
  }
  return `$${(rateCentsPerHr / 100).toFixed(2)}/hr`;
}
