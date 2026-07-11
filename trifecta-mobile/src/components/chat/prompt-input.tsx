/* eslint-disable react-hooks/set-state-in-effect */
import { TouchableGlass } from "@/components/touchable-glass";
import { LiquidMetalSubmitButton } from "@/components/LiquidMetalSubmitButton";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import { Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { BlurView } from "expo-blur";
import { useChatContext } from "./chat-context";
import { useConversationContext } from "./conversation";
import { SuggestionMenu, type SuggestionItem, type SuggestionType } from "./suggestion-menu";
import { detectTrigger, replaceRange, ComposerTriggerKind } from "@/utils/composer-triggers";
import { useProjectSearch } from "@/services/project-search";
import { useWsClient } from "@/stores/ws-client";
import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import { useRouter } from "expo-router";

const AnimatedGlassContainer = Animated.createAnimatedComponent(GlassContainer);

/**
 * Root container for the message composer. Positions itself at the bottom of
 * the `<Conversation />` using the shared conversation context. Children are
 * laid out in a horizontal row inside a glass container.
 */
export function PromptInput({
  children,
  banner,
}: {
  children: ReactNode;
  banner?: ReactNode;
}) {
  const { promptInputStyle, onPromptInputLayout } = useConversationContext();
  const {
    error,
    input,
    cursorPosition,
    setInput,
    setCursorPosition,
    attachments,
    removeAttachment,
  } = useChatContext();
  const { serverConfig } = useWsClient();
  const { search: searchProjectEntries } = useProjectSearch();
  const { activeThreadId, newChatProjectId } = useActiveThread();
  const { getThread, getProject } = useThreadList();

  // Get the correct CWD: thread worktreePath > project workspaceRoot > new chat project > server cwd
  const cwd = useMemo(() => {
    const activeThread = activeThreadId ? getThread(activeThreadId) : null;
    const project = activeThread?.projectId ? getProject(activeThread.projectId) : null;
    const newChatProject = newChatProjectId ? getProject(newChatProjectId) : null;
    if (activeThreadId && !activeThread) return "";
    return activeThread?.worktreePath || project?.workspaceRoot || newChatProject?.workspaceRoot || serverConfig?.cwd || "";
  }, [activeThreadId, newChatProjectId, getThread, getProject, serverConfig?.cwd]);
  
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentTrigger, setCurrentTrigger] = useState<{ kind: ComposerTriggerKind; rangeStart: number; rangeEnd: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<SuggestionType | undefined>(undefined);

  // Debounced project search for @ mentions
  useEffect(() => {
    if (searchQuery === null || searchQuery.trim() === "") {
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      if (!cwd) return;
      
      setLoadingSuggestions(true);
      setSuggestionType("mention");
      
      try {
        const result = await searchProjectEntries({
          cwd: cwd,
          query: searchQuery,
          limit: 50,
        });

        // Verify the trigger is still valid
        const currentTriggerCheck = detectTrigger(input, cursorPosition);
        if (currentTriggerCheck?.kind !== ComposerTriggerKind.Path || 
            currentTriggerCheck.query.trim() !== searchQuery.trim()) {
          setLoadingSuggestions(false);
          return;
        }

        const items: SuggestionItem[] = result.entries.map((entry) => ({
          id: entry.path,
          title: entry.path.split("/").pop() || entry.path, // Show filename as title
          subtitle: entry.path, // Show full path as subtitle
          icon: entry.kind === "directory" ? "folder" : "doc",
          type: entry.kind === "directory" ? "folder" : "file",
          group: entry.kind === "directory" ? "Folders" : "Files",
        }));

        setSuggestions(items);
        setShowSuggestions(items.length > 0);
      } catch (error) {
        console.error("Project search failed:", error);
        // Show error state in suggestions
        setSuggestions([{
          id: "error",
          title: "Connection Error",
          subtitle: "Unable to search files. Check your connection.",
          icon: "exclamationmark.triangle",
          type: "file",
        }]);
        setShowSuggestions(true);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 220); // 220ms debounce like iOS app

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, cwd, input, cursorPosition, searchProjectEntries, activeThreadId, getThread, getProject]);

  // Detect triggers and update suggestions
  useEffect(() => {
    const trigger = detectTrigger(input, cursorPosition);
    if (!trigger) {
      setShowSuggestions(false);
      setSuggestions([]);
      setCurrentTrigger(null);
      setSearchQuery(null);
      return;
    }

    setCurrentTrigger({
      kind: trigger.kind,
      rangeStart: trigger.rangeStart,
      rangeEnd: trigger.rangeEnd,
    });

    if (trigger.kind === ComposerTriggerKind.SlashCommand) {
      const query = trigger.query.toLowerCase();
      setSuggestionType("command");
      
      const builtInCommands = [
        { 
          id: "model", 
          title: "/model", 
          subtitle: "Switch response model", 
          icon: "cpu",
          type: "command" as SuggestionType,
          badge: "Built-in",
          badgeColor: "green" as const,
          group: "Built-in Commands"
        },
        { 
          id: "plan", 
          title: "/plan", 
          subtitle: "Switch to plan mode", 
          icon: "list.bullet",
          type: "command" as SuggestionType,
          badge: "Built-in",
          badgeColor: "green" as const,
          group: "Built-in Commands"
        },
        { 
          id: "default", 
          title: "/default", 
          subtitle: "Switch to default mode", 
          icon: "arrow.uturn.backward",
          type: "command" as SuggestionType,
          badge: "Built-in",
          badgeColor: "green" as const,
          group: "Built-in Commands"
        },
      ];
      
      // Add provider slash commands
      const providerCommands: SuggestionItem[] = [];
      for (const provider of serverConfig?.providers ?? []) {
        const providerLabel = provider.label || provider.displayName || provider.driver;
        for (const cmd of provider.slashCommands ?? []) {
          providerCommands.push({
            id: `provider-${provider.instanceId}-${cmd.name}`,
            title: `/${cmd.name}`,
            subtitle: cmd.description || cmd.input?.hint || providerLabel,
            icon: "command",
            type: "command" as SuggestionType,
            description: cmd.description || "",
            group: providerLabel,
          });
        }
      }
      
      const allCommands = [...builtInCommands, ...providerCommands];
      const filtered = allCommands.filter(cmd => 
        cmd.title.toLowerCase().includes(query) || 
        (cmd.subtitle && cmd.subtitle.toLowerCase().includes(query))
      );
      
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSearchQuery(null);
    } else if (trigger.kind === ComposerTriggerKind.Path) {
      // Trigger project search for @ mentions
      const query = trigger.query.trim();
      setSuggestionType("mention");
      if (query.length > 0) {
        setSearchQuery(query);
      } else {
        setShowSuggestions(false);
        setSuggestions([]);
      }
    } else if (trigger.kind === ComposerTriggerKind.Skill) {
      // Show provider skills
      const query = trigger.query.toLowerCase();
      setSuggestionType("skill");
      const skills: SuggestionItem[] = [];
      
      for (const provider of serverConfig?.providers ?? []) {
        const providerLabel = provider.label || provider.displayName || provider.driver;
        for (const skill of provider.skills ?? []) {
          const haystack = `${skill.name} ${skill.shortDescription || ""} ${skill.description || ""}`.toLowerCase();
          if (query === "" || haystack.includes(query)) {
            skills.push({
              id: `skill-${provider.instanceId}-${skill.name}`,
              title: skill.name,
              subtitle: skill.shortDescription || skill.description || "",
              icon: "sparkle",
              type: "skill" as SuggestionType,
              description: skill.description || "",
              group: providerLabel,
            });
          }
        }
      }
      
      setSuggestions(skills);
      setShowSuggestions(skills.length > 0);
      setSearchQuery(null);
    }
  }, [input, cursorPosition, serverConfig?.providers]);

  const handleSelectSuggestion = useCallback((item: SuggestionItem) => {
    if (!currentTrigger) return;

    // Handle built-in slash commands
    if (currentTrigger.kind === ComposerTriggerKind.SlashCommand) {
      if (item.id === "model") {
        // Show model picker
        router.navigate("/model-picker");
        const result = replaceRange(input, currentTrigger.rangeStart, currentTrigger.rangeEnd, "");
        setInput(result.text);
        setCursorPosition(result.cursor);
        setShowSuggestions(false);
        setSuggestions([]);
        setCurrentTrigger(null);
        setSearchQuery(null);
        return;
      }
      
      // /plan and /default are sent through to the provider. Thread-wide mode
      // changes live in Thread Details, so slash commands are never fake local UI.
    }

    let replacement = "";
    if (currentTrigger.kind === ComposerTriggerKind.SlashCommand) {
      replacement = `${item.title} `;
    } else if (currentTrigger.kind === ComposerTriggerKind.Path) {
      // Use the full path from subtitle for @ mentions
      replacement = `@${item.subtitle || item.title} `;
    } else if (currentTrigger.kind === ComposerTriggerKind.Skill) {
      replacement = `$${item.title} `;
    }

    const result = replaceRange(input, currentTrigger.rangeStart, currentTrigger.rangeEnd, replacement);
    setInput(result.text);
    setCursorPosition(result.cursor);
    setShowSuggestions(false);
    setSuggestions([]);
    setCurrentTrigger(null);
    setSearchQuery(null);
  }, [currentTrigger, input, router, setInput, setCursorPosition]);

  return (
    <Animated.View
      onLayout={onPromptInputLayout}
      style={[{ position: "absolute", left: 0, right: 0 }, promptInputStyle]}
    >
      <SuggestionMenu
        items={suggestions}
        visible={showSuggestions}
        onSelectItem={handleSelectSuggestion}
        loading={loadingSuggestions}
        type={suggestionType}
      />
      {banner}
      {error && <PromptInputError message={error} />}
      {attachments.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 px-2 pb-2">
          {attachments.map((attachment) => (
            <TouchableGlass
              key={attachment.name}
              onPress={() => removeAttachment(attachment.name)}
              accessibilityLabel={`Remove ${attachment.name}`}
              className="rounded-full px-3 py-2 active:opacity-60"
            >
              <Text className="text-xs text-foreground" numberOfLines={1}>
                {attachment.name} · Remove
              </Text>
            </TouchableGlass>
          ))}
        </View>
      ) : null}
      <AnimatedGlassContainer
        style={{
          flex: 1,
          flexDirection: "row",
          padding: 12,
          gap: 10,
          alignItems: "flex-end",
        }}
        spacing={8}
      >
        {children}
      </AnimatedGlassContainer>
    </Animated.View>
  );
}

function PromptInputError({ message }: { message?: string }) {
  return (
    <Animated.View entering={FadeIn} className="px-3 pb-2">
      <View
        className="flex-row items-center gap-2 rounded-xl bg-card px-3 py-2.5 border-continuous"
      >
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: "#EF4444" }}
        />
        <Text
          className="flex-1 text-xs text-muted-foreground"
          numberOfLines={2}
        >
          {message || "Something went wrong"}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * A circular glass button for actions (e.g. attachments, camera).
 */
export function PromptInputAction(props: {
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <TouchableGlass
      hitSlop={4}
      {...props}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
      }}
    />
  );
}

/**
 * Glass-wrapped container for the textarea and submit button.
 */
export function PromptInputBody({ children }: { children: ReactNode }) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        isInteractive
        glassEffectStyle="regular"
        className="border-continuous"
        style={{
          flex: 1,
          flexDirection: "row",

          borderRadius: 22,
        }}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      tint="systemMaterial"
      className="border-continuous"
      style={{
        flex: 1,
        flexDirection: "row",

        overflow: "hidden",
        borderRadius: 22,
      }}
    >
      {children}
    </BlurView>
  );
}

/**
 * Auto-growing text input for composing messages. Reads/writes the current
 * input value from `ChatContext`.
 */
export function PromptInputTextarea({
  placeholder = "Chat with Agent...",
  maxLength = 1000,
}: {
  placeholder?: string;
  maxLength?: number;
}) {
  const { input, setInput, setCursorPosition } = useChatContext();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (input === "") {
      inputRef.current?.clear();
    }
  }, [input]);

  const handleSelectionChange = useCallback((event: any) => {
    const { nativeEvent } = event;
    if (nativeEvent && nativeEvent.selection) {
      setCursorPosition(nativeEvent.selection.end);
    }
  }, [setCursorPosition]);

  return (
    <TextInput
      ref={inputRef}
      nativeID="composer"
      className="flex-1 pl-4 pr-2 py-3 max-h-25 text-base text-foreground"
      cursorColor="#3b82f6"
      selectionColor="rgba(59, 130, 246, 0.3)"
      value={input}
      onChangeText={setInput}
      onSelectionChange={handleSelectionChange}
      placeholder={placeholder}
      multiline
      maxLength={maxLength}
    />
  );
}

/**
 * Submit button that sends the current input. Shows a spinner while the model
 * is generating. Reads state from `ChatContext`.
 * Now uses LiquidMetalSubmitButton with animated shader effect.
 * Uses 'stop' variant with higher turbulence when generating.
 */
export function PromptInputSubmit() {
  const { input, attachments, isGenerating, onSend, onStop } = useChatContext();
  const disabled = !isGenerating && !input.trim() && attachments.length === 0;

  return (
    <LiquidMetalSubmitButton
      onPress={isGenerating ? onStop : onSend}
      disabled={disabled}
      isLoading={false}
      size={34}
      variant={isGenerating ? 'stop' : 'default'}
      style={{ margin: 5 }}
    />
  );
}
