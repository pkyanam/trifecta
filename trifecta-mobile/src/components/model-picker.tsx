import { SymbolImage } from "@/components/symbol-image";
import { cn } from "@/utils/tailwind";
import { useState, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import { useWsClient } from "@/stores/ws-client";
import { useModel } from "@/components/model-context";
import { useRouter } from "expo-router";
import type { ServerConfig, ServerProvider, ServerProviderModel } from "@/types/thread";

interface ModelPickerProps {
  visible: boolean;
  onClose: () => void;
}

export function ModelPicker({ visible, onClose }: ModelPickerProps) {
  const { serverConfig } = useWsClient();
  const { selectedModelSelection, setSelectedModelSelection } = useModel();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Filter and search models
  const { providers, filteredModels } = useMemo(() => {
    const allProviders = serverConfig?.providers ?? [];
    const query = searchQuery.toLowerCase().trim();

    let filteredProviders = allProviders;
    if (selectedProviderId) {
      filteredProviders = allProviders.filter(p => p.instanceId === selectedProviderId);
    }

    const filteredModels: Array<{
      model: ServerProviderModel;
      provider: ServerProvider;
    }> = [];

    for (const provider of filteredProviders) {
      for (const model of provider.models) {
        const haystack = `${model.name} ${model.shortName || ""} ${model.subProvider || ""} ${provider.displayName || ""} ${provider.label || ""}`.toLowerCase();
        
        if (query === "" || haystack.includes(query)) {
          filteredModels.push({ model, provider });
        }
      }
    }

    return { providers: allProviders, filteredModels };
  }, [serverConfig, searchQuery, selectedProviderId]);

  const handleSelectModel = (model: ServerProviderModel, provider: ServerProvider) => {
    setSelectedModelSelection({
      model: model.slug,
      instanceId: provider.instanceId,
    });
    onClose();
    // Navigate back to previous screen
    if (router.canGoBack()) {
      router.back();
    }
  };

  const GlassComponent = View;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/60 items-center justify-center"
        onPress={onClose}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="w-full max-w-lg mx-4 max-h-[80vh]"
        >
          <Pressable className="w-full h-full" onPress={(e) => e.stopPropagation()}>
            <GlassComponent
              className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-3xl overflow-hidden"
              style={{ borderRadius: 24 }}
            >
              {/* Header */}
              <View className="px-5 py-4 border-b border-border/50">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center gap-2">
                    <SymbolImage name="cpu" size={20} className="text-foreground" />
                    <Text className="text-xl font-bold text-foreground">Select Model</Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    className="w-8 h-8 items-center justify-center rounded-full active:bg-muted/50"
                  >
                    <SymbolImage name="xmark" size={18} className="text-foreground" />
                  </Pressable>
                </View>

                {/* Search Bar */}
                <View className="flex-row items-center gap-3 bg-muted/50 rounded-xl px-4 py-3">
                  <SymbolImage name="magnifyingglass" size={16} className="text-muted-foreground" />
                  <TextInput
                    className="flex-1 text-base text-foreground"
                    placeholder="Search models..."
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery("")}>
                      <SymbolImage name="xmark.circle.fill" size={16} className="text-muted-foreground" />
                    </Pressable>
                  )}
                </View>

                {/* Provider Filter Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-3"
                >
                  <View className="flex-row gap-2">
                    <ProviderChip
                      label="All Providers"
                      selected={selectedProviderId === null}
                      onPress={() => setSelectedProviderId(null)}
                    />
                    {providers.map((provider) => (
                      <ProviderChip
                        key={provider.instanceId}
                        label={provider.label || provider.displayName || provider.driver}
                        selected={selectedProviderId === provider.instanceId}
                        onPress={() => setSelectedProviderId(provider.instanceId)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Model List */}
              <ScrollView className="flex-1 max-h-96">
                {filteredModels.length === 0 ? (
                  <View className="items-center justify-center py-12">
                    <SymbolImage name="magnifyingglass" size={32} className="text-muted-foreground mb-3" />
                    <Text className="text-base text-muted-foreground">No models found</Text>
                    <Text className="text-sm text-muted-foreground mt-1">Try a different search term</Text>
                  </View>
                ) : (
                  filteredModels.map(({ model, provider }) => {
                    const isSelected = 
                      selectedModelSelection?.model === model.slug &&
                      selectedModelSelection?.instanceId === provider.instanceId;

                    return (
                      <ModelItem
                        key={`${provider.instanceId}-${model.slug}`}
                        model={model}
                        provider={provider}
                        selected={isSelected}
                        onPress={() => handleSelectModel(model, provider)}
                      />
                    );
                  })
                )}
              </ScrollView>

              {/* Footer */}
              <View className="px-5 py-3 border-t border-border/50 bg-muted/20">
                <Text className="text-xs text-center text-muted-foreground">
                  {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} available
                </Text>
              </View>
            </GlassComponent>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface ProviderChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function ProviderChip({ label, selected, onPress }: ProviderChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "px-4 py-1.5 rounded-full border",
        selected
          ? "bg-foreground border-foreground"
          : "bg-transparent border-border"
      )}
    >
      <Text
        className={cn(
          "text-sm font-medium",
          selected ? "text-background" : "text-foreground"
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface ModelItemProps {
  model: ServerProviderModel;
  provider: ServerProvider;
  selected: boolean;
  onPress: () => void;
}

function ModelItem({ model, provider, selected, onPress }: ModelItemProps) {
  const providerLabel = provider.label || provider.displayName || provider.driver;
  const isEligible = model.eligible !== false;

  return (
    <Pressable
      onPress={onPress}
      disabled={!isEligible}
      className={cn(
        "flex-row items-center gap-3 px-5 py-4 border-b border-border/30",
        "active:bg-muted/30",
        !isEligible && "opacity-50"
      )}
    >
      <View className={cn(
        "w-6 h-6 rounded-full border-2 items-center justify-center",
        selected ? "bg-foreground border-foreground" : "border-border"
      )}>
        {selected && (
          <SymbolImage name="checkmark" size={12} className="text-background" />
        )}
      </View>

      <View className="flex-1 min-w-0">
        <Text className="text-base font-medium text-foreground" numberOfLines={1}>
          {model.name}
        </Text>
        {model.shortName && (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {model.shortName}
          </Text>
        )}
        <View className="flex-row items-center gap-2 mt-1">
          <View className="px-2 py-0.5 bg-muted/50 rounded">
            <Text className="text-xs text-muted-foreground">{providerLabel}</Text>
          </View>
          {model.subProvider && (
            <View className="px-2 py-0.5 bg-blue-500/10 rounded">
              <Text className="text-xs text-blue-500">{model.subProvider}</Text>
            </View>
          )}
        </View>
      </View>

      {!isEligible && (
        <SymbolImage name="exclamationmark.triangle" size={16} className="text-yellow-500" />
      )}
    </Pressable>
  );
}