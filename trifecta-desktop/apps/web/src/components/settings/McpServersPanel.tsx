import { PencilIcon, PlugIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import type { McpServerConfig, McpServerTransport } from "@belweave/contracts";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

/** Editable form state — a transport-agnostic superset of `McpServerConfig`. */
interface McpServerDraft {
  /** Name of the entry being edited; `null` when adding a new server. */
  readonly originalName: string | null;
  name: string;
  enabled: boolean;
  transport: McpServerTransport;
  command: string;
  argsText: string;
  envText: string;
  url: string;
  headersText: string;
}

const EMPTY_DRAFT: McpServerDraft = {
  originalName: null,
  name: "",
  enabled: true,
  transport: "stdio",
  command: "",
  argsText: "",
  envText: "",
  url: "",
  headersText: "",
};

const TRANSPORT_LABELS: Record<McpServerTransport, string> = {
  stdio: "Local (stdio)",
  http: "Remote (HTTP)",
};

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseKeyValues(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of parseLines(text)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (key.length === 0) continue;
    result[key] = line.slice(separator + 1).trim();
  }
  return result;
}

function serializeArgs(args: ReadonlyArray<string>): string {
  return args.join("\n");
}

function serializeKeyValues(record: Readonly<Record<string, string>>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function draftFromServer(server: McpServerConfig): McpServerDraft {
  if (server.transport === "stdio") {
    return {
      originalName: server.name,
      name: server.name,
      enabled: server.enabled,
      transport: "stdio",
      command: server.command,
      argsText: serializeArgs(server.args),
      envText: serializeKeyValues(server.env),
      url: "",
      headersText: "",
    };
  }
  return {
    originalName: server.name,
    name: server.name,
    enabled: server.enabled,
    transport: "http",
    command: "",
    argsText: "",
    envText: "",
    url: server.url,
    headersText: serializeKeyValues(server.headers),
  };
}

function serverFromDraft(draft: McpServerDraft): McpServerConfig {
  const name = draft.name.trim();
  if (draft.transport === "stdio") {
    return {
      name,
      enabled: draft.enabled,
      transport: "stdio",
      command: draft.command.trim(),
      args: parseLines(draft.argsText),
      env: parseKeyValues(draft.envText),
    };
  }
  return {
    name,
    enabled: draft.enabled,
    transport: "http",
    url: draft.url.trim(),
    headers: parseKeyValues(draft.headersText),
  };
}

interface DraftValidation {
  readonly nameError: string | null;
  readonly endpointError: string | null;
  readonly valid: boolean;
}

function validateDraft(
  draft: McpServerDraft,
  existing: ReadonlyArray<McpServerConfig>,
): DraftValidation {
  const name = draft.name.trim();
  let nameError: string | null = null;
  if (name.length === 0) {
    nameError = "Name is required.";
  } else if (
    existing.some((server) => server.name === name && server.name !== draft.originalName)
  ) {
    nameError = "A server with this name already exists.";
  }

  let endpointError: string | null = null;
  if (draft.transport === "stdio") {
    if (draft.command.trim().length === 0) endpointError = "Command is required.";
  } else if (draft.url.trim().length === 0) {
    endpointError = "URL is required.";
  }

  return { nameError, endpointError, valid: nameError === null && endpointError === null };
}

export function McpServersPanel() {
  const servers = useSettings((settings) => settings.mcpServers);
  const { updateSettings } = useUpdateSettings();
  const [draft, setDraft] = useState<McpServerDraft | null>(null);

  const validation = useMemo(
    () => (draft ? validateDraft(draft, servers) : null),
    [draft, servers],
  );

  const persist = (next: ReadonlyArray<McpServerConfig>) => {
    updateSettings({ mcpServers: [...next] });
  };

  const handleSave = () => {
    if (!draft || !validation?.valid) return;
    const nextServer = serverFromDraft(draft);
    const next = draft.originalName
      ? servers.map((server) => (server.name === draft.originalName ? nextServer : server))
      : [...servers, nextServer];
    persist(next);
    setDraft(null);
  };

  const handleDelete = (name: string) => {
    persist(servers.filter((server) => server.name !== name));
    if (draft?.originalName === name) setDraft(null);
  };

  const handleToggleEnabled = (name: string, enabled: boolean) => {
    persist(servers.map((server) => (server.name === name ? { ...server, enabled } : server)));
    if (draft?.originalName === name) {
      setDraft((current) => (current ? { ...current, enabled } : current));
    }
  };

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="MCP Servers"
        icon={<PlugIcon className="size-3.5" />}
        headerAction={
          <Button
            size="xs"
            variant="outline"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
            disabled={draft?.originalName === null}
          >
            <PlusIcon className="size-3.5" />
            Add server
          </Button>
        }
      >
        {servers.length === 0 && draft === null ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground/80">
            No MCP servers configured. Trifecta injects enabled servers into supported agents and
            syncs them into each agent&apos;s native config.
          </div>
        ) : null}

        {servers.map((server) => {
          const isEditing = draft?.originalName === server.name;
          return (
            <div key={server.name} className="border-t border-border/60 first:border-t-0">
              <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      {server.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      {server.transport}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground/80">
                    {server.transport === "stdio"
                      ? [server.command, ...server.args].join(" ")
                      : server.url}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(checked) => handleToggleEnabled(server.name, checked)}
                    aria-label={`Enable ${server.name}`}
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Edit ${server.name}`}
                    onClick={() => setDraft(draftFromServer(server))}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete ${server.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(server.name)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </div>
              {isEditing && draft ? (
                <McpServerEditor
                  draft={draft}
                  validation={validation}
                  onChange={setDraft}
                  onSave={handleSave}
                  onCancel={() => setDraft(null)}
                />
              ) : null}
            </div>
          );
        })}

        {draft && draft.originalName === null ? (
          <div className="border-t border-border/60">
            <McpServerEditor
              draft={draft}
              validation={validation}
              onChange={setDraft}
              onSave={handleSave}
              onCancel={() => setDraft(null)}
            />
          </div>
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function McpServerEditor({
  draft,
  validation,
  onChange,
  onSave,
  onCancel,
}: {
  draft: McpServerDraft;
  validation: DraftValidation | null;
  onChange: (next: McpServerDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const update = (patch: Partial<McpServerDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="space-y-4 bg-muted/20 px-4 py-4 sm:px-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mcp-name">Name</Label>
          <Input
            id="mcp-name"
            value={draft.name}
            placeholder="github"
            onChange={(event) => update({ name: event.target.value })}
            aria-invalid={validation?.nameError ? true : undefined}
          />
          {validation?.nameError ? (
            <p className="text-[11px] text-destructive">{validation.nameError}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mcp-transport">Transport</Label>
          <Select
            value={draft.transport}
            onValueChange={(value) => {
              if (value === "stdio" || value === "http") update({ transport: value });
            }}
          >
            <SelectTrigger id="mcp-transport" className="w-full" aria-label="Transport">
              <SelectValue>{TRANSPORT_LABELS[draft.transport]}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="stdio">{TRANSPORT_LABELS.stdio}</SelectItem>
              <SelectItem value="http">{TRANSPORT_LABELS.http}</SelectItem>
            </SelectPopup>
          </Select>
        </div>
      </div>

      {draft.transport === "stdio" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-command">Command</Label>
            <Input
              id="mcp-command"
              value={draft.command}
              placeholder="npx"
              onChange={(event) => update({ command: event.target.value })}
              aria-invalid={validation?.endpointError ? true : undefined}
            />
            {validation?.endpointError ? (
              <p className="text-[11px] text-destructive">{validation.endpointError}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-args">Arguments</Label>
            <Textarea
              id="mcp-args"
              rows={3}
              value={draft.argsText}
              placeholder={"-y\n@modelcontextprotocol/server-github"}
              onChange={(event) => update({ argsText: event.target.value })}
            />
            <p className="text-[11px] text-muted-foreground/70">One argument per line.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-env">Environment</Label>
            <Textarea
              id="mcp-env"
              rows={3}
              value={draft.envText}
              placeholder={"GITHUB_TOKEN=ghp_..."}
              onChange={(event) => update({ envText: event.target.value })}
            />
            <p className="text-[11px] text-muted-foreground/70">One KEY=VALUE pair per line.</p>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-url">URL</Label>
            <Input
              id="mcp-url"
              value={draft.url}
              placeholder="https://mcp.example.com/mcp"
              onChange={(event) => update({ url: event.target.value })}
              aria-invalid={validation?.endpointError ? true : undefined}
            />
            {validation?.endpointError ? (
              <p className="text-[11px] text-destructive">{validation.endpointError}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-headers">Headers</Label>
            <Textarea
              id="mcp-headers"
              rows={3}
              value={draft.headersText}
              placeholder={"Authorization=Bearer ..."}
              onChange={(event) => update({ headersText: event.target.value })}
            />
            <p className="text-[11px] text-muted-foreground/70">One KEY=VALUE pair per line.</p>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={draft.enabled}
            onCheckedChange={(checked) => update({ enabled: checked })}
            aria-label="Enabled"
          />
          Enabled
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={!validation?.valid}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
