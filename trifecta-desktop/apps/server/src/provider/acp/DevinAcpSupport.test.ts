import { describe, expect, it } from "vitest";

import type * as EffectAcpSchema from "effect-acp/schema";

import {
  buildDevinAcpSpawnInput,
  currentDevinModelIdFromSessionSetup,
  DEVIN_MODE_BYPASS,
  DEVIN_MODE_PLAN,
  resolveDevinSessionModeId,
} from "./DevinAcpSupport.ts";

const ALL_MODES = ["accept-edits", "ask", "plan", "bypass"];

describe("DevinAcpSupport", () => {
  it("spawns `devin acp`, honoring a configured binary path", () => {
    expect(buildDevinAcpSpawnInput(undefined, "/work")).toMatchObject({
      command: "devin",
      args: ["acp"],
      cwd: "/work",
    });
    expect(buildDevinAcpSpawnInput({ binaryPath: "/opt/devin" }, "/work")).toMatchObject({
      command: "/opt/devin",
      args: ["acp"],
    });
  });

  it("maps plan interaction to Devin plan mode", () => {
    expect(
      resolveDevinSessionModeId({
        runtimeMode: "approval-required",
        interactionMode: "plan",
        availableModeIds: ALL_MODES,
      }),
    ).toBe(DEVIN_MODE_PLAN);
  });

  it("maps full-access to Devin bypass mode", () => {
    expect(
      resolveDevinSessionModeId({
        runtimeMode: "full-access",
        interactionMode: "default",
        availableModeIds: ALL_MODES,
      }),
    ).toBe(DEVIN_MODE_BYPASS);
  });

  it("leaves Devin's default mode in place for approval-required builds", () => {
    expect(
      resolveDevinSessionModeId({
        runtimeMode: "approval-required",
        interactionMode: "default",
        availableModeIds: ALL_MODES,
      }),
    ).toBeUndefined();
  });

  it("never selects a mode the agent does not advertise", () => {
    expect(
      resolveDevinSessionModeId({
        runtimeMode: "full-access",
        interactionMode: "plan",
        availableModeIds: ["accept-edits"],
      }),
    ).toBeUndefined();
  });

  it("reads the current model from configOptions when models block is absent", () => {
    const modelId = currentDevinModelIdFromSessionSetup({
      sessionId: "literate-motorcycle",
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "claude-opus-4-8-medium",
          options: [{ value: "claude-opus-4-8-medium", name: "Claude Opus 4.8 Medium" }],
        },
      ],
    } satisfies EffectAcpSchema.NewSessionResponse);
    expect(modelId).toBe("claude-opus-4-8-medium");
  });
});
