import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";

import type { McpServerConfig } from "@belweave/contracts";

import {
  planNativeMcpTarget,
  resolveDefaultNativeMcpTargets,
  type NativeMcpTarget,
} from "./mcpNativeSync.ts";

const PATH_LIKE = {
  join: (...parts: ReadonlyArray<string>) => parts.join("/"),
} as unknown as import("effect/Path").Path;

const githubStdio: McpServerConfig = {
  name: "github",
  enabled: true,
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: { GITHUB_TOKEN: "tok" },
};

const remoteHttp: McpServerConfig = {
  name: "remote",
  enabled: true,
  transport: "http",
  url: "https://mcp.example.com",
  headers: { Authorization: "Bearer t" },
};

const targets = resolveDefaultNativeMcpTargets({
  homeDir: "/home/user",
  env: {},
  path: PATH_LIKE,
});
const byId = (id: NativeMcpTarget["id"]) => targets.find((t) => t.id === id)!;

describe("resolveDefaultNativeMcpTargets", () => {
  it("resolves default paths and honors XDG_CONFIG_HOME / CODEX_HOME", () => {
    expect(byId("claude").path).toBe("/home/user/.claude.json");
    expect(byId("cursor").path).toBe("/home/user/.cursor/mcp.json");
    expect(byId("devin").path).toBe("/home/user/.config/devin/config.json");
    expect(byId("codex").path).toBe("/home/user/.codex/config.toml");

    const overridden = resolveDefaultNativeMcpTargets({
      homeDir: "/home/user",
      env: { XDG_CONFIG_HOME: "/cfg", CODEX_HOME: "/cx" },
      path: PATH_LIKE,
    });
    expect(overridden.find((t) => t.id === "devin")!.path).toBe("/cfg/devin/config.json");
    expect(overridden.find((t) => t.id === "codex")!.path).toBe("/cx/config.toml");
  });
});

describe("planNativeMcpTarget — JSON merge-preserving", () => {
  it("preserves unrelated keys and user-authored servers while adding managed ones", () => {
    const existing = JSON.stringify({
      version: 1,
      mcpServers: {
        userOwned: { command: "user-cmd", args: [] },
      },
    });
    const plan = planNativeMcpTarget({
      target: byId("devin"),
      existingContent: existing,
      enabledServers: [githubStdio],
      previouslyManaged: [],
    });
    expect(plan.managedNames).toEqual(["github"]);
    const parsed = JSON.parse(plan.nextContent!);
    expect(parsed.version).toBe(1);
    expect(parsed.mcpServers.userOwned).toEqual({ command: "user-cmd", args: [] });
    expect(parsed.mcpServers.github).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "tok" },
    });
  });

  it("removes a previously-managed server that left the registry, leaving user servers", () => {
    const existing = JSON.stringify({
      mcpServers: {
        github: { command: "npx", args: [] },
        userOwned: { command: "user-cmd", args: [] },
      },
    });
    const plan = planNativeMcpTarget({
      target: byId("claude"),
      existingContent: existing,
      enabledServers: [],
      previouslyManaged: ["github"],
    });
    expect(plan.managedNames).toEqual([]);
    const parsed = JSON.parse(plan.nextContent!);
    expect(parsed.mcpServers.github).toBeUndefined();
    expect(parsed.mcpServers.userOwned).toEqual({ command: "user-cmd", args: [] });
  });

  it("emits no change when the managed section is already correct", () => {
    const existing = `${JSON.stringify(
      {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: "tok" },
          },
        },
      },
      null,
      2,
    )}\n`;
    const plan = planNativeMcpTarget({
      target: byId("devin"),
      existingContent: existing,
      enabledServers: [githubStdio],
      previouslyManaged: ["github"],
    });
    expect(plan.nextContent).toBeUndefined();
    expect(plan.managedNames).toEqual(["github"]);
  });

  it("creates the file from scratch when missing and there are managed servers", () => {
    const plan = planNativeMcpTarget({
      target: byId("claude"),
      existingContent: undefined,
      enabledServers: [githubStdio],
      previouslyManaged: [],
    });
    const parsed = JSON.parse(plan.nextContent!);
    expect(parsed.mcpServers.github.command).toBe("npx");
  });

  it("does nothing when file missing and nothing to manage", () => {
    const plan = planNativeMcpTarget({
      target: byId("claude"),
      existingContent: undefined,
      enabledServers: [],
      previouslyManaged: [],
    });
    expect(plan.nextContent).toBeUndefined();
    expect(plan.managedNames).toEqual([]);
  });

  it("skips an unparseable file without clobbering it", () => {
    const plan = planNativeMcpTarget({
      target: byId("claude"),
      existingContent: "{not valid json",
      enabledServers: [githubStdio],
      previouslyManaged: ["old"],
    });
    expect(plan.parseError).toBe(true);
    expect(plan.nextContent).toBeUndefined();
    // Managed names retained so the sidecar isn't wiped on a transient parse error.
    expect(plan.managedNames).toEqual(["old"]);
  });
});

describe("planNativeMcpTarget — HTTP transport gating", () => {
  it("includes http servers for agents that support http (Claude)", () => {
    const plan = planNativeMcpTarget({
      target: byId("claude"),
      existingContent: undefined,
      enabledServers: [remoteHttp],
      previouslyManaged: [],
    });
    expect(plan.managedNames).toEqual(["remote"]);
    const parsed = JSON.parse(plan.nextContent!);
    expect(parsed.mcpServers.remote).toEqual({
      type: "http",
      url: "https://mcp.example.com",
      headers: { Authorization: "Bearer t" },
    });
  });

  it("drops http servers for stdio-only agents (Devin)", () => {
    const plan = planNativeMcpTarget({
      target: byId("devin"),
      existingContent: undefined,
      enabledServers: [remoteHttp],
      previouslyManaged: [],
    });
    expect(plan.managedNames).toEqual([]);
    expect(plan.nextContent).toBeUndefined();
  });

  it("Cursor stdio entries carry an explicit type", () => {
    const plan = planNativeMcpTarget({
      target: byId("cursor"),
      existingContent: undefined,
      enabledServers: [githubStdio, remoteHttp],
      previouslyManaged: [],
    });
    const parsed = JSON.parse(plan.nextContent!);
    expect(parsed.mcpServers.github).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "tok" },
    });
    expect(parsed.mcpServers.remote).toEqual({
      url: "https://mcp.example.com",
      headers: { Authorization: "Bearer t" },
    });
  });
});

describe("planNativeMcpTarget — Codex TOML", () => {
  it("merges into [mcp_servers.*] preserving other tables, stdio only", () => {
    const existing = [
      'model = "gpt-5-codex"',
      "",
      "[mcp_servers.node_repl]",
      'command = "node_repl"',
      "args = []",
      "",
      "[mcp_servers.node_repl.env]",
      'FOO = "bar"',
      "",
    ].join("\n");

    const plan = planNativeMcpTarget({
      target: byId("codex"),
      existingContent: existing,
      enabledServers: [githubStdio, remoteHttp],
      previouslyManaged: [],
    });
    // http server dropped for codex
    expect(plan.managedNames).toEqual(["github"]);
    const parsed = parseToml(plan.nextContent!) as Record<string, any>;
    expect(parsed.model).toBe("gpt-5-codex");
    expect(parsed.mcp_servers.node_repl.command).toBe("node_repl");
    expect(parsed.mcp_servers.node_repl.env).toEqual({ FOO: "bar" });
    expect(parsed.mcp_servers.github.command).toBe("npx");
    expect(parsed.mcp_servers.github.env).toEqual({ GITHUB_TOKEN: "tok" });
  });

  it("removes a previously-managed codex server when it leaves the registry", () => {
    const existing = [
      "[mcp_servers.github]",
      'command = "npx"',
      "args = []",
      "",
      "[mcp_servers.keep]",
      'command = "keep"',
      "args = []",
      "",
    ].join("\n");
    const plan = planNativeMcpTarget({
      target: byId("codex"),
      existingContent: existing,
      enabledServers: [],
      previouslyManaged: ["github"],
    });
    const parsed = parseToml(plan.nextContent!) as Record<string, any>;
    expect(parsed.mcp_servers.github).toBeUndefined();
    expect(parsed.mcp_servers.keep.command).toBe("keep");
  });
});
