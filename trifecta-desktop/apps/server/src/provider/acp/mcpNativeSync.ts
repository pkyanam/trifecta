/**
 * mcpNativeSync — hybrid sync of Trifecta's MCP registry into each supported
 * agent's *own* native config file.
 *
 * Trifecta's `settings.mcpServers` registry is the source of truth (see
 * `@belweave/contracts` `McpServerConfig`). In addition to injecting enabled
 * servers into ACP sessions at runtime (`mcpRegistry.ts`), we mirror them into
 * the config files the agents read directly, so MCP servers are available even
 * when an agent is launched outside Trifecta:
 *
 *   - Devin  → `$XDG_CONFIG_HOME/devin/config.json` `mcpServers` (JSON, stdio)
 *   - Claude → `~/.claude.json` `mcpServers`               (JSON, stdio + http)
 *   - Codex  → `$CODEX_HOME/config.toml` `[mcp_servers.*]`  (TOML, stdio)
 *   - Cursor → `~/.cursor/mcp.json` `mcpServers`            (JSON, stdio + http)
 *
 * These are the user's real files, so the sync is **merge-preserving**: we read
 * the existing config, update only the entries Trifecta manages, and leave
 * everything else untouched. Ownership is tracked out-of-band in a sidecar file
 * (`<stateDir>/mcp-native-sync.json`) recording the server names Trifecta last
 * wrote to each target — so a server removed from the registry is removed from
 * the agent's config, while servers the user added by hand are never touched.
 *
 * A target file is only rewritten when its managed MCP section actually
 * changes; otherwise the file is left byte-for-byte intact (this matters for
 * TOML, whose comments/formatting are not preserved across a re-serialize).
 *
 * @module provider/acp/mcpNativeSync
 */
import { isMcpStdioServer, type McpServerConfig, type ServerSettings } from "@belweave/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as NodeOS from "node:os";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import { writeFileStringAtomically } from "../../atomicWrite.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

export type NativeMcpTargetId = "devin" | "claude" | "codex" | "cursor";

export interface NativeMcpTarget {
  readonly id: NativeMcpTargetId;
  /** Absolute path to the agent's native config file. */
  readonly path: string;
  readonly format: "json" | "toml";
  /** Top-level key holding the server map (`mcpServers` / `mcp_servers`). */
  readonly serversKey: string;
  /** Whether the agent understands HTTP MCP servers; stdio is universal. */
  readonly supportsHttp: boolean;
  /** Project a registry entry into this agent's native per-server shape. */
  readonly toEntry: (server: McpServerConfig) => Record<string, unknown>;
}

/** Sidecar contents: server names Trifecta last wrote to each target. */
export type NativeMcpSyncState = Partial<Record<NativeMcpTargetId, ReadonlyArray<string>>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => key in b && deepEqual(a[key], (b as Record<string, unknown>)[key]));
  }
  return false;
}

function recordFromEntries(record: Readonly<Record<string, string>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = value;
  }
  return result;
}

/** Standard JSON `mcpServers` entry shared by Devin/Claude. */
function jsonStdioEntry(server: McpServerConfig): Record<string, unknown> {
  if (!isMcpStdioServer(server)) {
    // HTTP — Claude style.
    const entry: Record<string, unknown> = { type: "http", url: server.url };
    if (Object.keys(server.headers).length > 0) entry.headers = recordFromEntries(server.headers);
    return entry;
  }
  const entry: Record<string, unknown> = { command: server.command, args: [...server.args] };
  if (Object.keys(server.env).length > 0) entry.env = recordFromEntries(server.env);
  return entry;
}

/** Cursor `mcp.json` entry — stdio carries an explicit `type`, http uses `url`. */
function cursorEntry(server: McpServerConfig): Record<string, unknown> {
  if (!isMcpStdioServer(server)) {
    const entry: Record<string, unknown> = { url: server.url };
    if (Object.keys(server.headers).length > 0) entry.headers = recordFromEntries(server.headers);
    return entry;
  }
  const entry: Record<string, unknown> = {
    type: "stdio",
    command: server.command,
    args: [...server.args],
  };
  if (Object.keys(server.env).length > 0) entry.env = recordFromEntries(server.env);
  return entry;
}

/** Codex `[mcp_servers.<name>]` table — stdio only. */
function codexEntry(server: McpServerConfig): Record<string, unknown> {
  if (!isMcpStdioServer(server)) return {};
  const entry: Record<string, unknown> = { command: server.command, args: [...server.args] };
  if (Object.keys(server.env).length > 0) entry.env = recordFromEntries(server.env);
  return entry;
}

/**
 * Resolve the default native config targets from the process environment.
 * Honors `XDG_CONFIG_HOME` (Devin) and `CODEX_HOME` (Codex) overrides.
 */
export function resolveDefaultNativeMcpTargets(input: {
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly path: Path.Path;
}): ReadonlyArray<NativeMcpTarget> {
  const { homeDir, env, path } = input;
  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, ".config");
  const codexHome = env.CODEX_HOME?.trim() || path.join(homeDir, ".codex");
  return [
    {
      id: "devin",
      path: path.join(xdgConfigHome, "devin", "config.json"),
      format: "json",
      serversKey: "mcpServers",
      supportsHttp: false,
      toEntry: jsonStdioEntry,
    },
    {
      id: "claude",
      path: path.join(homeDir, ".claude.json"),
      format: "json",
      serversKey: "mcpServers",
      supportsHttp: true,
      toEntry: jsonStdioEntry,
    },
    {
      id: "codex",
      path: path.join(codexHome, "config.toml"),
      format: "toml",
      serversKey: "mcp_servers",
      supportsHttp: false,
      toEntry: codexEntry,
    },
    {
      id: "cursor",
      path: path.join(homeDir, ".cursor", "mcp.json"),
      format: "json",
      serversKey: "mcpServers",
      supportsHttp: true,
      toEntry: cursorEntry,
    },
  ];
}

function parseConfig(format: "json" | "toml", text: string): Record<string, unknown> | undefined {
  try {
    // Native agent config files are arbitrary user-authored documents, not a
    // fixed Trifecta schema, so we operate on plain JSON/TOML records here.
    const parsed = format === "json" ? JSON.parse(text) : parseToml(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return undefined;
  }
}

function serializeConfig(format: "json" | "toml", root: Record<string, unknown>): string {
  if (format === "json") return `${JSON.stringify(root, null, 2)}\n`;
  return `${stringifyToml(root)}\n`;
}

export interface NativeMcpTargetPlan {
  readonly target: NativeMcpTarget;
  /** Server names Trifecta now manages for this target (the next sidecar value). */
  readonly managedNames: ReadonlyArray<string>;
  /** Set when the managed section changed and the file must be rewritten. */
  readonly nextContent: string | undefined;
  /** Set when the existing file could not be parsed and was left untouched. */
  readonly parseError: boolean;
}

/**
 * Pure planning step: compute the next file contents (if any) for one target,
 * given the existing file contents, the enabled registry entries, and the set
 * of names Trifecta previously managed for this target.
 */
export function planNativeMcpTarget(input: {
  readonly target: NativeMcpTarget;
  readonly existingContent: string | undefined;
  readonly enabledServers: ReadonlyArray<McpServerConfig>;
  readonly previouslyManaged: ReadonlyArray<string>;
}): NativeMcpTargetPlan {
  const { target, existingContent, enabledServers, previouslyManaged } = input;

  const applicable = enabledServers.filter(
    (server) => isMcpStdioServer(server) || target.supportsHttp,
  );
  const managedNames = applicable.map((server) => server.name);

  if (
    existingContent === undefined &&
    managedNames.length === 0 &&
    previouslyManaged.length === 0
  ) {
    return { target, managedNames, nextContent: undefined, parseError: false };
  }

  const root = existingContent === undefined ? {} : parseConfig(target.format, existingContent);
  if (root === undefined) {
    return { target, managedNames: previouslyManaged, nextContent: undefined, parseError: true };
  }

  const existingServers = isRecord(root[target.serversKey])
    ? (root[target.serversKey] as Record<string, unknown>)
    : {};
  const nextServers: Record<string, unknown> = { ...existingServers };

  const managedSet = new Set(managedNames);
  for (const name of previouslyManaged) {
    if (!managedSet.has(name)) delete nextServers[name];
  }
  for (const server of applicable) {
    nextServers[server.name] = target.toEntry(server);
  }

  if (deepEqual(existingServers, nextServers)) {
    return { target, managedNames, nextContent: undefined, parseError: false };
  }

  const nextRoot: Record<string, unknown> = { ...root };
  if (Object.keys(nextServers).length === 0 && !(target.serversKey in root)) {
    // Nothing to write and the key never existed — leave the file untouched.
    return { target, managedNames, nextContent: undefined, parseError: false };
  }
  nextRoot[target.serversKey] = nextServers;

  return {
    target,
    managedNames,
    nextContent: serializeConfig(target.format, nextRoot),
    parseError: false,
  };
}

const SIDECAR_FILENAME = "mcp-native-sync.json";

function sidecarPath(input: { readonly stateDir: string; readonly path: Path.Path }): string {
  return input.path.join(input.stateDir, SIDECAR_FILENAME);
}

const readSyncState = (
  filePath: string,
): Effect.Effect<NativeMcpSyncState, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(filePath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return {};
    const raw = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));
    const parsed = parseConfig("json", raw);
    if (parsed === undefined) return {};
    const state: NativeMcpSyncState = {};
    for (const id of ["devin", "claude", "codex", "cursor"] as const) {
      const value = parsed[id];
      if (Array.isArray(value)) {
        state[id] = value.filter((entry): entry is string => typeof entry === "string");
      }
    }
    return state;
  });

/**
 * Apply the registry to every native target once.
 *
 * Each target is processed independently; a read/parse/write failure for one
 * target is logged and skipped so it can never block the others or fail the
 * caller. Returns the next sidecar state.
 */
export function syncNativeMcpConfigs(input: {
  readonly enabledServers: ReadonlyArray<McpServerConfig>;
  readonly targets: ReadonlyArray<NativeMcpTarget>;
  readonly previousState: NativeMcpSyncState;
}): Effect.Effect<NativeMcpSyncState, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const nextState: NativeMcpSyncState = { ...input.previousState };

    for (const target of input.targets) {
      const result = yield* Effect.gen(function* () {
        const exists = yield* fs.exists(target.path).pipe(Effect.orElseSucceed(() => false));
        const existingContent = exists
          ? yield* fs.readFileString(target.path).pipe(Effect.map((c) => c as string | undefined))
          : undefined;

        const plan = planNativeMcpTarget({
          target,
          existingContent,
          enabledServers: input.enabledServers,
          previouslyManaged: input.previousState[target.id] ?? [],
        });

        if (plan.parseError) {
          yield* Effect.logWarning("mcpNativeSync: skipped target with unparseable config", {
            target: target.id,
            path: target.path,
          });
          return { id: target.id, managedNames: plan.managedNames };
        }

        if (plan.nextContent !== undefined) {
          yield* writeFileStringAtomically({ filePath: target.path, contents: plan.nextContent });
        }
        return { id: target.id, managedNames: plan.managedNames };
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError(`mcpNativeSync: failed to sync target ${target.id}`, cause).pipe(
            Effect.as({ id: target.id, managedNames: input.previousState[target.id] ?? [] }),
          ),
        ),
      );

      if (result.managedNames.length > 0) {
        nextState[result.id] = result.managedNames;
      } else {
        delete nextState[result.id];
      }
    }

    return nextState;
  });
}

/**
 * Read the sidecar, sync every target from the registry, then persist the
 * updated sidecar (only when it changed).
 */
export function runNativeMcpSync(input: {
  readonly enabledServers: ReadonlyArray<McpServerConfig>;
  readonly targets: ReadonlyArray<NativeMcpTarget>;
  readonly stateDir: string;
}): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const path = yield* Path.Path;
    const sidecar = sidecarPath({ stateDir: input.stateDir, path });
    const previousState = yield* readSyncState(sidecar);
    const nextState = yield* syncNativeMcpConfigs({
      enabledServers: input.enabledServers,
      targets: input.targets,
      previousState,
    });
    if (!deepEqual(previousState, nextState)) {
      yield* writeFileStringAtomically({
        filePath: sidecar,
        // @effect-diagnostics-next-line preferSchemaOverJson:off
        contents: `${JSON.stringify(nextState, null, 2)}\n`,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("mcpNativeSync: failed to persist sidecar state", cause),
        ),
      );
    }
  });
}

function enabledServers(settings: ServerSettings): ReadonlyArray<McpServerConfig> {
  return settings.mcpServers.filter((server) => server.enabled);
}

/**
 * Daemon layer that mirrors the MCP registry into every supported agent's
 * native config on boot and whenever `settings.mcpServers` changes.
 *
 * Modeled on `ProviderInstanceRegistryHydration`'s settings watcher: it runs
 * an initial sync at build time, then forks a scoped fiber that re-syncs on
 * change. Changes that don't touch `mcpServers` are filtered out so unrelated
 * settings edits don't churn agent config files.
 */
export const McpNativeSyncLive: Layer.Layer<
  never,
  never,
  ServerSettingsService | ServerConfig | FileSystem.FileSystem | Path.Path
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const serverConfig = yield* ServerConfig;
    const serverSettings = yield* ServerSettingsService;
    const targets = resolveDefaultNativeMcpTargets({
      homeDir: NodeOS.homedir(),
      env: process.env,
      path,
    });
    const stateDir = serverConfig.stateDir;

    const syncFor = (servers: ReadonlyArray<McpServerConfig>) =>
      runNativeMcpSync({ enabledServers: servers, targets, stateDir }).pipe(
        Effect.catchCause((cause) => Effect.logError("mcpNativeSync: sync run failed", cause)),
      );

    const initial = yield* serverSettings.getSettings.pipe(Effect.orElseSucceed(() => undefined));
    if (initial !== undefined) {
      yield* syncFor(enabledServers(initial));
    }

    yield* serverSettings.streamChanges.pipe(
      Stream.map((settings) => settings.mcpServers),
      Stream.changesWith((a, b) => deepEqual(a, b)),
      Stream.runForEach((mcpServers) => syncFor(mcpServers.filter((server) => server.enabled))),
      Effect.forkScoped,
    );
  }),
);
