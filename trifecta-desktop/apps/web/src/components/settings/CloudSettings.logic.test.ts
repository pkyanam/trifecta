import { describe, expect, it } from "vitest";

import type { BelweaveCloudSandbox } from "@belweave/contracts";

import {
  canConnectSandbox,
  canStartSandbox,
  canStopSandbox,
  describeSandboxState,
  formatSandboxRate,
} from "./CloudSettings.logic";

function sandbox(overrides: Partial<BelweaveCloudSandbox>): BelweaveCloudSandbox {
  return {
    id: 1,
    name: "sb",
    tier: "standard",
    rateCentsPerHr: 5,
    state: "ready",
    createdAt: "2026-07-06T12:00:00.000Z",
    stoppedAt: null,
    stoppedReason: null,
    sshUser: "root",
    desktopAvailable: false,
    snapshotAvailable: false,
    archiveAfter: null,
    ...overrides,
  };
}

describe("describeSandboxState", () => {
  it("maps provider states to neutral labels", () => {
    expect(describeSandboxState("ready")).toEqual({ label: "Ready", variant: "success" });
    expect(describeSandboxState("provisioning")).toEqual({ label: "Starting", variant: "warning" });
    expect(describeSandboxState("archived")).toEqual({ label: "Stopped", variant: "outline" });
    expect(describeSandboxState("error")).toEqual({ label: "Error", variant: "error" });
  });

  it("capitalizes unknown states", () => {
    expect(describeSandboxState("mystery")).toEqual({ label: "Mystery", variant: "outline" });
  });
});

describe("sandbox action availability", () => {
  it("allows stop only when running", () => {
    expect(canStopSandbox(sandbox({ state: "running" }))).toBe(true);
    expect(canStopSandbox(sandbox({ state: "archived" }))).toBe(false);
  });

  it("offers start for any non-ready, non-transient state (including unknown)", () => {
    expect(canStartSandbox(sandbox({ state: "archived" }))).toBe(true);
    expect(canStartSandbox(sandbox({ state: "stopped" }))).toBe(true);
    expect(canStartSandbox(sandbox({ state: "error" }))).toBe(true);
    expect(canStartSandbox(sandbox({ state: "hibernated" }))).toBe(true);
    expect(canStartSandbox(sandbox({ state: "ready" }))).toBe(false);
    expect(canStartSandbox(sandbox({ state: "provisioning" }))).toBe(false);
  });

  it("offers connect only once the sandbox is ready", () => {
    expect(canConnectSandbox(sandbox({ state: "ready" }))).toBe(true);
    expect(canConnectSandbox(sandbox({ state: "idle" }))).toBe(true);
    expect(canConnectSandbox(sandbox({ state: "archived" }))).toBe(false);
    expect(canConnectSandbox(sandbox({ state: "provisioning" }))).toBe(false);
  });
});

describe("formatSandboxRate", () => {
  it("renders integer cents as an hourly dollar rate", () => {
    expect(formatSandboxRate(5)).toBe("$0.05/hr");
    expect(formatSandboxRate(150)).toBe("$1.50/hr");
  });

  it("labels zero or negative rates as free", () => {
    expect(formatSandboxRate(0)).toBe("Free");
    expect(formatSandboxRate(-1)).toBe("Free");
  });
});
