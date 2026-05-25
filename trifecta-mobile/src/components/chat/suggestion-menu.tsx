import { SymbolImage } from "@/components/symbol-image";
import { cn } from "@/utils/tailwind";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";

export type SuggestionType = "mention" | "command" | "skill" | "file" | "folder";

export interface SuggestionItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  type?: SuggestionType;
  badge?: string;
  badgeColor?: "green" | "blue" | "purple" | "orange" | "red";
  shortcut?: string;
  description?: string;
  group?: string;
}

interface SuggestionMenuProps {
  items: SuggestionItem[];
  visible: boolean;
  onSelectItem: (item: SuggestionItem) => void;
  loading?: boolean;
  type?: SuggestionType;
}

export function SuggestionMenu({ items, visible, onSelectItem, loading = false, type }: SuggestionMenuProps) {
  if (!visible) {
    return null;
  }

  // Group items by group property
  const groupedItems = items.reduce((acc, item) => {
    const group = item.group || "default";
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(item);
    return acc;
  }, {} as Record<string, SuggestionItem[]>);

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      className="absolute bottom-full left-0 right-0 mb-2 mx-2"
      style={{ zIndex: 100 }}
    >
      <View
        className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden max-h-64"
        style={{ borderRadius: 16 }}
      >
        {loading ? (
          <LoadingState type={type} />
        ) : items.length === 0 ? (
          <EmptyState type={type} />
        ) : (
          <ScrollView className="max-h-64">
            <Animated.View layout={Layout.springify()}>
              {Object.entries(groupedItems).map(([group, groupItems]) => (
                <Animated.View key={group} layout={Layout.springify()}>
                  {group !== "default" && (
                    <SectionHeader title={group} />
                  )}
                  {groupItems.map((item, index) => (
                    <SuggestionMenuItem
                      key={item.id}
                      item={item}
                      onPress={() => onSelectItem(item)}
                      isLast={
                        index === groupItems.length - 1 &&
                        Object.keys(groupedItems).indexOf(group) === Object.keys(groupedItems).length - 1
                      }
                    />
                  ))}
                </Animated.View>
              ))}
            </Animated.View>
          </ScrollView>
        )}
      </View>
    </Animated.View>
  );
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <View className="px-3 py-1.5 bg-muted/30">
      <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </Text>
    </View>
  );
}

interface LoadingStateProps {
  type?: SuggestionType;
}

function LoadingState({ type }: LoadingStateProps) {
  const getMessage = () => {
    switch (type) {
      case "mention":
        return "Searching files...";
      case "command":
        return "Loading commands...";
      case "skill":
        return "Loading skills...";
      case "file":
        return "Searching files...";
      case "folder":
        return "Searching folders...";
      default:
        return "Loading suggestions...";
    }
  };

  return (
    <View className="py-8 items-center justify-center">
      <View className="w-6 h-6 mb-2">
        <SymbolImage name="ellipsis" size={16} className="text-muted-foreground" />
      </View>
      <Text className="text-xs text-muted-foreground">{getMessage()}</Text>
    </View>
  );
}

interface EmptyStateProps {
  type?: SuggestionType;
}

function EmptyState({ type }: EmptyStateProps) {
  const getMessage = () => {
    switch (type) {
      case "mention":
        return "No files found";
      case "command":
        return "No commands found";
      case "skill":
        return "No skills found";
      case "file":
        return "No files found";
      case "folder":
        return "No folders found";
      default:
        return "No suggestions";
    }
  };

  const getIcon = () => {
    switch (type) {
      case "mention":
        return "doc.text";
      case "command":
        return "command";
      case "skill":
        return "sparkle";
      case "file":
        return "doc";
      case "folder":
        return "folder";
      default:
        return "magnifyingglass";
    }
  };

  return (
    <View className="py-8 px-4 items-center justify-center">
      <SymbolImage name={getIcon()} size={32} className="text-muted-foreground mb-2" />
      <Text className="text-xs text-muted-foreground text-center">{getMessage()}</Text>
    </View>
  );
}

interface SuggestionMenuItemProps {
  item: SuggestionItem;
  onPress: () => void;
  isLast: boolean;
}

function SuggestionMenuItem({ item, onPress, isLast }: SuggestionMenuItemProps) {
  return (
    <Animated.View layout={Layout.springify()}>
      <Pressable
        onPress={onPress}
        className={cn(
          "flex-row items-center px-3 py-2.5 gap-3",
          !isLast && "border-b border-border/30",
          "active:bg-muted/50"
        )}
      >
        {/* Icon */}
        {item.icon && (
          <Animated.View 
            layout={Layout.springify()}
            className={cn(
              "w-7 h-7 items-center justify-center rounded-lg",
              item.type === "command" && "bg-blue-500/10",
              item.type === "skill" && "bg-purple-500/10",
              item.type === "mention" && "bg-green-500/10",
              item.type === "file" && "bg-orange-500/10",
              item.type === "folder" && "bg-yellow-500/10",
              !item.type && "bg-muted/50"
            )}
          >
            <SymbolImage
              name={item.icon}
              size={16}
              className={cn(
                item.type === "command" && "text-blue-500",
                item.type === "skill" && "text-purple-500",
                item.type === "mention" && "text-green-500",
                item.type === "file" && "text-orange-500",
                item.type === "folder" && "text-yellow-500",
                !item.type && "text-muted-foreground"
              )}
            />
          </Animated.View>
        )}

        {/* Content */}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text
              className="text-sm font-medium text-foreground flex-1"
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.badge && (
              <Animated.View 
                layout={Layout.springify()}
                className={cn(
                  "px-1.5 py-0.5 rounded",
                  item.badgeColor === "green" && "bg-green-500/10",
                  item.badgeColor === "blue" && "bg-blue-500/10",
                  item.badgeColor === "purple" && "bg-purple-500/10",
                  item.badgeColor === "orange" && "bg-orange-500/10",
                  item.badgeColor === "red" && "bg-red-500/10",
                  !item.badgeColor && "bg-muted/50"
                )}
              >
                <Text
                  className={cn(
                    "text-xs font-medium",
                    item.badgeColor === "green" && "text-green-500",
                    item.badgeColor === "blue" && "text-blue-500",
                    item.badgeColor === "purple" && "text-purple-500",
                    item.badgeColor === "orange" && "text-orange-500",
                    item.badgeColor === "red" && "text-red-500",
                    !item.badgeColor && "text-muted-foreground"
                  )}
                >
                  {item.badge}
                </Text>
              </Animated.View>
            )}
          </View>
          {item.subtitle && (
            <Text
              className="text-xs text-muted-foreground"
              numberOfLines={1}
            >
              {item.subtitle}
            </Text>
          )}
          {item.description && (
            <Text
              className="text-xs text-muted-foreground mt-0.5"
              numberOfLines={2}
            >
              {item.description}
            </Text>
          )}
        </View>

        {/* Shortcut */}
        {item.shortcut && (
          <View className="px-1.5 py-0.5 bg-muted/50 rounded">
            <Text className="text-xs text-muted-foreground font-mono">
              {item.shortcut}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}