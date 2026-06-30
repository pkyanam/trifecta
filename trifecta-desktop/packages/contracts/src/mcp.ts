/**
 * MCP server registry — Trifecta's source-of-truth list of Model Context
 * Protocol servers that agents can connect to.
 *
 * Trifecta owns this registry and:
 *  - injects enabled servers into ACP agents via `session/new` (`mcpServers`), and
 *  - syncs them into each supported agent's native config file (hybrid model).
 *
 * Two transports are supported:
 *  - `stdio`: a local subprocess (`command` + `args` + `env`). Supported by
 *    every agent (Devin only supports stdio).
 *  - `http`: a remote streamable-HTTP server (`url` + `headers`). Agents that
 *    do not support HTTP MCP (e.g. Devin) ignore these entries.
 *
 * This module is schema-only — no runtime logic. Mapping the registry to a
 * specific agent's wire/config format lives in the server package.
 *
 * @module mcp
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Identifier/display name for an MCP server. Unique within the registry. */
export const McpServerName = TrimmedNonEmptyString;
export type McpServerName = typeof McpServerName.Type;

export const McpServerTransport = Schema.Literals(["stdio", "http"]);
export type McpServerTransport = typeof McpServerTransport.Type;

const McpEnv = Schema.Record(Schema.String, Schema.String).pipe(
  Schema.withDecodingDefault(Effect.succeed({})),
);
const McpHeaders = Schema.Record(Schema.String, Schema.String).pipe(
  Schema.withDecodingDefault(Effect.succeed({})),
);
const McpArgs = Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([])));

const McpServerCommonFields = {
  /** Stable, unique identifier and display name (e.g. "github", "playwright"). */
  name: McpServerName,
  /** When false the server is kept in the registry but not exposed to agents. */
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
} as const;

export const McpStdioServer = Schema.Struct({
  ...McpServerCommonFields,
  transport: Schema.Literal("stdio"),
  command: TrimmedNonEmptyString,
  args: McpArgs,
  env: McpEnv,
});
export type McpStdioServer = typeof McpStdioServer.Type;

export const McpHttpServer = Schema.Struct({
  ...McpServerCommonFields,
  transport: Schema.Literal("http"),
  url: TrimmedNonEmptyString,
  headers: McpHeaders,
});
export type McpHttpServer = typeof McpHttpServer.Type;

/** A single registry entry, discriminated by `transport`. */
export const McpServerConfig = Schema.Union([McpStdioServer, McpHttpServer]);
export type McpServerConfig = typeof McpServerConfig.Type;

/** The registry: an ordered list of MCP server definitions. */
export const McpServerRegistry = Schema.Array(McpServerConfig);
export type McpServerRegistry = typeof McpServerRegistry.Type;

export function isMcpStdioServer(server: McpServerConfig): server is McpStdioServer {
  return server.transport === "stdio";
}

export function isMcpHttpServer(server: McpServerConfig): server is McpHttpServer {
  return server.transport === "http";
}
