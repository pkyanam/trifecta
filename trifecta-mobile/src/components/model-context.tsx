import { useWsClient } from "@/stores/ws-client";
import type { ModelSelection, ServerProvider } from "@/types/thread";
import { findDefaultModelSelection } from "@/utils/model-selection";
import React, { createContext, use, useEffect, useMemo, useState } from "react";

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
  const providers = useMemo(
    () => serverConfig?.providers ?? [],
    [serverConfig?.providers],
  );
  const [selectedModelSelection, setSelectedModelSelection] =
    useState<ModelSelection | null>(null);
  const [extendedThinking, setExtendedThinking] = useState(false);

  useEffect(() => {
    if (selectedModelSelection) return;
    const defaultSelection = findDefaultModelSelection(providers);
    if (!defaultSelection) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selection is derived from async server config arrival.
    setSelectedModelSelection(defaultSelection);
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
