import { AndroidGrabber } from "@/components/grabber";
import { useModel } from "@/components/model-context";
import { ProviderIcon } from "@/components/provider-icon";
import type { ModelSelection, ServerProvider, ServerProviderModel } from "@/types/thread";
import { useRouter } from "expo-router";
import { Check, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

const IS_ANDROID = Platform.OS === "android";

const DRIVER_LABEL: Record<string, string> = {
  claudeAgent: "Anthropic",
  opencode: "OpenCode",
  openaiChat: "OpenAI",
  openAIChat: "OpenAI",
  openai: "OpenAI",
  gemini: "Google",
  googleGemini: "Google",
  cursor: "Cursor",
  groq: "Groq",
  mistral: "Mistral",
  cohere: "Cohere",
};

const DRIVER_COLOR: Record<string, string> = {
  claudeAgent: "#da7756",
  opencode: "#0066ff",
  openaiChat: "#10a37f",
  openAIChat: "#10a37f",
  openai: "#10a37f",
  gemini: "#4285f4",
  googleGemini: "#4285f4",
  cursor: "#1c1c1e",
  groq: "#f55036",
  mistral: "#fa520f",
  cohere: "#39594d",
};

const CONTENT_TOP_OFFSET = 22;

function providerLabel(p: ServerProvider): string {
  if (p.displayName) return p.displayName;
  return DRIVER_LABEL[p.driver] ?? p.driver;
}

function providerColor(p: ServerProvider): string {
  return DRIVER_COLOR[p.driver] ?? "#888888";
}

function ModelRow({
  model,
  provider,
  selected,
  onSelect,
  showProvider,
}: {
  model: ServerProviderModel;
  provider: ServerProvider;
  selected: boolean;
  onSelect: () => void;
  showProvider?: boolean;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className="flex-row items-center px-4 py-3 gap-3 active:bg-muted rounded-xl mx-2"
    >
      <View className="flex-1 flex-shrink-1">
        <Text className="text-[15px] font-medium text-foreground" numberOfLines={2}>
          {model.shortName ?? model.name}
        </Text>
        {(showProvider || model.subProvider) && (
          <Text className="text-[12px] text-muted-foreground mt-0.5" numberOfLines={1}>
            {model.subProvider
              ? `${providerLabel(provider)} · ${model.subProvider}`
              : providerLabel(provider)}
          </Text>
        )}
      </View>
      {selected && (
        <Check size={17} strokeWidth={2.5} color="#888" />
      )}
    </Pressable>
  );
}

export default function ModelPickerSheet() {
  const { providers, selectedModelSelection, setSelectedModelSelection } = useModel();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const usableProviders = providers.filter((p) => p.enabled && p.installed);

  const activeInstanceId =
    selectedInstanceId ?? usableProviders[0]?.instanceId ?? null;

  const isSearching = searchQuery.trim().length > 0;

  const displayEntries = useMemo(() => {
    if (isSearching) {
      const q = searchQuery.toLowerCase();
      const results: { provider: ServerProvider; model: ServerProviderModel }[] = [];
      for (const p of usableProviders) {
        for (const m of p.models) {
          if (m.eligible === false) continue;
          if (
            m.name.toLowerCase().includes(q) ||
            (m.shortName ?? "").toLowerCase().includes(q) ||
            m.slug.toLowerCase().includes(q) ||
            providerLabel(p).toLowerCase().includes(q)
          ) {
            results.push({ provider: p, model: m });
          }
        }
      }
      return results;
    }

    const provider = usableProviders.find((p) => p.instanceId === activeInstanceId);
    if (!provider) return [];
    return provider.models
      .filter((m) => m.eligible !== false)
      .map((m) => ({ provider, model: m }));
  }, [isSearching, searchQuery, usableProviders, activeInstanceId]);

  function isSelected(p: ServerProvider, m: ServerProviderModel): boolean {
    if (!selectedModelSelection) return false;
    return selectedModelSelection.model === m.slug && selectedModelSelection.instanceId === p.instanceId;
  }

  function handleSelect(p: ServerProvider, m: ServerProviderModel) {
    const selection: ModelSelection = { model: m.slug, instanceId: p.instanceId };
    setSelectedModelSelection(selection);
    router.back();
  }

  return (
    <View className="flex-1 bg-card">
      <AndroidGrabber />

      <View className="flex-1 flex-row">

      {/* Left provider rail */}
      {!isSearching && (
        <View
          className={IS_ANDROID ? "bg-muted/30 pb-safe" : "bg-muted/30 border-r border-border/40 pb-safe"}
          style={{ width: 56 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: CONTENT_TOP_OFFSET }}
          >
            {usableProviders.map((p) => (
              <Pressable
                key={p.instanceId}
                onPress={() => setSelectedInstanceId(p.instanceId)}
                className="items-center justify-center px-1 mb-3"
                accessibilityRole="button"
                accessibilityLabel={providerLabel(p)}
              >
                <View
                  className="w-10 h-10 rounded-[11px] items-center justify-center"
                  style={{
                    backgroundColor: p.instanceId === activeInstanceId ? "rgba(255,255,255,0.08)" : "transparent",
                  }}
                >
                  <View style={{ opacity: p.instanceId === activeInstanceId ? 1 : 0.48 }}>
                    <ProviderIcon driver={p.driver} label={providerLabel(p)} size={22} />
                  </View>
                </View>
                {!IS_ANDROID && p.instanceId === activeInstanceId && (
                  <View
                    className="absolute right-0 w-[3px] h-[22px] rounded-full"
                    style={{ backgroundColor: providerColor(p) }}
                  />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Right: search + model list */}
      <View className="flex-1">
        {/* Search bar */}
        <View className="px-3 pb-2" style={{ paddingTop: CONTENT_TOP_OFFSET }}>
          <View className="flex-row items-center bg-muted/60 rounded-xl px-3 py-2 gap-2">
            <Search size={15} color="#888" strokeWidth={2} />
            <TextInput
              className="flex-1 text-[15px] text-foreground"
              placeholder="Search models..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} className="active:opacity-60">
                <X size={15} color="#888" strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {usableProviders.length === 0 && (
            <View className="px-5 py-8 items-center">
              <Text className="text-[15px] text-muted-foreground text-center">
                No providers available.{"\n"}Connect to your Trifecta server first.
              </Text>
            </View>
          )}

          {displayEntries.length === 0 && usableProviders.length > 0 && (
            <View className="px-5 py-8 items-center">
              <Text className="text-[15px] text-muted-foreground text-center">
                {isSearching ? "No models found" : "No models available"}
              </Text>
            </View>
          )}

          {displayEntries.map(({ provider, model }) => (
            <ModelRow
              key={`${provider.instanceId}|${model.slug}`}
              model={model}
              provider={provider}
              selected={isSelected(provider, model)}
              onSelect={() => handleSelect(provider, model)}
              showProvider={isSearching}
            />
          ))}
        </ScrollView>
      </View>
      </View>
    </View>
  );
}
