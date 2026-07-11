import type {
  ModelSelection,
  ServerProvider,
  ServerProviderModel,
} from "@/types/thread";

const DRIVER_LABELS: Readonly<Record<string, string>> = {
  codex: "Codex",
  claudeAgent: "Claude",
  opencode: "OpenCode",
  cursor: "Cursor",
  grok: "Grok",
  hermesAgent: "Hermes",
  devinAgent: "Devin",
  antigravity: "Antigravity",
  openaiChat: "OpenAI",
  openAIChat: "OpenAI",
  openai: "OpenAI",
  gemini: "Google",
  googleGemini: "Google",
};

export function providerLabel(provider: ServerProvider): string {
  return provider.label ?? provider.displayName ?? DRIVER_LABELS[provider.driver] ?? provider.driver;
}

export function selectableModels(provider: ServerProvider): ServerProviderModel[] {
  return provider.models.filter(
    (model) => model.eligible !== false && model.slug.trim() !== "" && model.name.trim() !== "",
  );
}

export function isSelectableProvider(provider: ServerProvider): boolean {
  const ready = provider.status === undefined || provider.status === "ready";
  return (
    provider.enabled &&
    provider.installed &&
    provider.availability !== "unavailable" &&
    ready &&
    selectableModels(provider).length > 0
  );
}

export function selectableProviders(providers: ServerProvider[]): ServerProvider[] {
  return providers.filter(isSelectableProvider);
}

export function findDefaultModelSelection(
  providers: ServerProvider[],
): ModelSelection | null {
  for (const provider of selectableProviders(providers)) {
    const model = selectableModels(provider)[0];
    if (model) return { model: model.slug, instanceId: provider.instanceId };
  }
  return null;
}
