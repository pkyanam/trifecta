"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";

interface AgentDistribution {
  readonly npx?: string | null;
  readonly uvx?: string | null;
  readonly binary?: Record<string, string> | null;
}

interface RegistryAgent {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly icon?: string;
  readonly distribution?: AgentDistribution;
}

interface RegistryResponse {
  readonly agents: RegistryAgent[];
}

const REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

function detectPlatformKey(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Win/i.test(ua)) return "windows-x86_64";
  if (/Mac/i.test(ua)) {
    // M-series Macs report arm in the UA via some browsers; fall back to x86 as safe default
    if (
      /arm/i.test(ua) ||
      (typeof navigator !== "undefined" &&
        (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ===
          "macOS")
    ) {
      return "darwin-aarch64";
    }
    return "darwin-x86_64";
  }
  return "linux-x86_64";
}

interface DerivedCommand {
  readonly command: string;
  readonly commandArgs: string;
}

function deriveCommand(distribution: AgentDistribution | undefined): DerivedCommand | null {
  if (!distribution) return null;
  if (distribution.npx) return { command: "npx", commandArgs: distribution.npx };
  if (distribution.uvx) return { command: "uvx", commandArgs: distribution.uvx };
  if (distribution.binary) {
    const platform = detectPlatformKey();
    const binary = distribution.binary[platform] ?? Object.values(distribution.binary)[0];
    if (binary) return { command: binary, commandArgs: "" };
  }
  return null;
}

export interface AcpAgentSelection {
  readonly agentId: string;
  readonly command: string;
  readonly commandArgs: string;
}

interface AcpRegistryAgentPickerProps {
  readonly onSelect: (selection: AcpAgentSelection) => void;
  readonly selectedAgentId?: string | undefined;
}

export function AcpRegistryAgentPicker({ onSelect, selectedAgentId }: AcpRegistryAgentPickerProps) {
  const [agents, setAgents] = useState<RegistryAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(REGISTRY_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<RegistryResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setAgents(data.agents ?? []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load registry");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return agents;
    const q = query.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [agents, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
        Loading registry…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Could not load ACP Registry: {error}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-foreground">Choose an agent</span>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="bg-background pl-8"
          placeholder="Search agents…"
          value={query}
          onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
          nativeInput
        />
      </div>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No agents found.
          </div>
        ) : (
          filtered.map((agent) => {
            const derived = deriveCommand(agent.distribution);
            const isSelected = agent.id === selectedAgentId;
            return (
              <button
                key={agent.id}
                type="button"
                disabled={!derived}
                onClick={() => {
                  if (!derived) return;
                  onSelect({
                    agentId: agent.id,
                    command: derived.command,
                    commandArgs: derived.commandArgs,
                  });
                }}
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                  "border-b border-border/50 last:border-b-0",
                  isSelected
                    ? "bg-primary/10 text-foreground"
                    : derived
                      ? "hover:bg-muted/60 cursor-pointer"
                      : "cursor-not-allowed opacity-50",
                )}
              >
                {agent.icon ? (
                  <img
                    src={agent.icon}
                    alt=""
                    className="mt-0.5 size-5 shrink-0 rounded object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                    {agent.name.charAt(0)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-medium text-foreground">{agent.name}</span>
                    {agent.version ? (
                      <span className="text-[10px] text-muted-foreground">v{agent.version}</span>
                    ) : null}
                    {!derived ? (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        No distribution
                      </span>
                    ) : null}
                  </div>
                  {agent.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {agent.description}
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Command fields below are auto-filled from the selected agent.
      </p>
    </div>
  );
}
