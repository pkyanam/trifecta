import { describe, expect, it } from "vitest";

import type { McpServerConfig } from "@belweave/contracts";

import { toAcpMcpServers } from "./mcpRegistry.ts";

const REGISTRY: ReadonlyArray<McpServerConfig> = [
  {
    name: "github",
    enabled: true,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_TOKEN: "xxx" },
  },
  {
    name: "disabled-one",
    enabled: false,
    transport: "stdio",
    command: "noop",
    args: [],
    env: {},
  },
  {
    name: "remote",
    enabled: true,
    transport: "http",
    url: "https://mcp.example.com",
    headers: { Authorization: "Bearer t" },
  },
];

describe("toAcpMcpServers", () => {
  it("maps enabled stdio servers and drops disabled + http when unsupported", () => {
    expect(toAcpMcpServers(REGISTRY)).toEqual([
      {
        name: "github",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: [{ name: "GITHUB_TOKEN", value: "xxx" }],
      },
    ]);
  });

  it("includes http servers when the agent supports the http transport", () => {
    const mapped = toAcpMcpServers(REGISTRY, { http: true });
    expect(mapped).toHaveLength(2);
    expect(mapped[1]).toEqual({
      type: "http",
      name: "remote",
      url: "https://mcp.example.com",
      headers: [{ name: "Authorization", value: "Bearer t" }],
    });
  });
});
