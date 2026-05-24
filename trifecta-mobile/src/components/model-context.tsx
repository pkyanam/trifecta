import { useWsClient } from "@/stores/ws-client";
import type { ModelSelection, ServerProvider } from "@/types/thread";
import React, { createContext, use, useEffect, useState } from "react";

export type { ServerProvider };

interface ModelContextValue {
  providers: ServerProvider[];
  selectedModelSelection: ModelSelection | null;
  setSelectedModelSelection: (m: ModelSelection) => void;
  selectedModelLabel: string;
  extendedThinking: boolean;
  setExtendedThinking: (value: boolean) => void;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function labelForSelection(
  selection: ModelSelection | null,
  providers: ServerProvider[],
): string {
  if (!selection) return "Model";
  for (const p of providers) {
    if (p.instanceId !== selection.instanceId) continue;
    for (const m of p.models) {
      if (m.slug === selection.model) return m.shortName ?? m.name;
    }
  }
  return selection.model;
}

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const { serverConfig } = useWsClient();
  const providers = serverConfig?.providers ?? [];
  const [selectedModelSelection, setSelectedModelSelection] =
    useState<ModelSelection | null>(null);
  const [extendedThinking, setExtendedThinking] = useState(false);

  useEffect(() => {
    if (selectedModelSelection) return;
    for (const p of providers) {
      if (!p.enabled || !p.installed) continue;
      const eligible = p.models.find((m) => m.eligible !== false);
      if (eligible) {
        setSelectedModelSelection({ model: eligible.slug, instanceId: p.instanceId });
        return;
      }
    }
  }, [providers, selectedModelSelection]);

  const selectedModelLabel = labelForSelection(selectedModelSelection, providers);

  return (
    <ModelContext
      value={{ providers, selectedModelSelection, setSelectedModelSelection, selectedModelLabel, extendedThinking, setExtendedThinking }}
    >
      {children}
    </ModelContext>
  );
}

export function useModel() {
  const context = use(ModelContext);
  if (!context) throw new Error("useModel must be used within a ModelProvider");
  return context;
}
