/**
 * mcpRegistry — map Trifecta's MCP server registry to ACP `McpServer` entries.
 *
 * The registry (see `@belweave/contracts` `McpServerConfig`) is the source of
 * truth; this helper projects the *enabled* entries into the wire shape ACP
 * agents expect at `session/new` / `session/load`.
 *
 * Agents advertise which MCP transports they support via `initialize`
 * (`agentCapabilities.mcpCapabilities`). Devin, for example, is stdio-only, so
 * callers pass `{ http: false }` to drop HTTP entries the agent would reject.
 *
 * @module provider/acp/mcpRegistry
 */
import { type McpServerConfig } from "@belweave/contracts";
import * as Effect from "effect/Effect";
import type * as EffectAcpSchema from "effect-acp/schema";

export interface AcpMcpTransportSupport {
  /** Whether the agent accepts HTTP MCP servers. Defaults to `false`. */
  readonly http?: boolean;
}

function recordToEntries(
  record: Readonly<Record<string, string>>,
): Array<{ name: string; value: string }> {
  return Object.entries(record).map(([name, value]) => ({ name, value }));
}

/**
 * Project the enabled registry entries into ACP `McpServer`s. HTTP entries are
 * only included when the agent supports the HTTP transport.
 */
export function toAcpMcpServers(
  registry: ReadonlyArray<McpServerConfig>,
  support: AcpMcpTransportSupport = {},
): Array<EffectAcpSchema.McpServer> {
  const result: Array<EffectAcpSchema.McpServer> = [];
  for (const server of registry) {
    if (!server.enabled) continue;
    if (server.transport === "stdio") {
      result.push({
        name: server.name,
        command: server.command,
        args: [...server.args],
        env: recordToEntries(server.env),
      });
      continue;
    }
    if (server.transport === "http" && support.http) {
      result.push({
        type: "http",
        name: server.name,
        url: server.url,
        headers: recordToEntries(server.headers),
      });
    }
  }
  return result;
}

/**
 * Build the per-session MCP resolver an ACP adapter passes to its runtime.
 *
 * Reads the current settings snapshot (so registry edits apply to *new*
 * sessions without rebuilding the adapter) and projects the enabled entries
 * into ACP `McpServer`s, including HTTP candidates. The runtime makes the final
 * transport decision based on the agent's advertised `mcpCapabilities`, so we
 * always include HTTP here and let unsupported transports be filtered there.
 *
 * Settings-read failures degrade gracefully to an empty list — a transient
 * settings error must never prevent a session from starting.
 */
export function acpMcpServersFromSettings<E, R>(
  getSettings: Effect.Effect<{ readonly mcpServers: ReadonlyArray<McpServerConfig> }, E, R>,
): Effect.Effect<Array<EffectAcpSchema.McpServer>, never, R> {
  return getSettings.pipe(
    Effect.map((settings) => toAcpMcpServers(settings.mcpServers, { http: true })),
    Effect.orElseSucceed(() => []),
  );
}
