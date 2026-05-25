import {
  ChatProvider,
  Conversation,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageResponse,
  PromptInput,
  PromptInputAction,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  StreamingMessage,
  createStreamingStore,
  type ChatMessage,
} from "@/components/chat";
import { Icon } from "@/components/icon";
import { MainHeader } from "@/components/main-header";
import { useModel } from "@/components/model-context";
import { useActiveThread } from "@/stores/active-thread";
import { useConnection } from "@/stores/connection";
import { usePreferences } from "@/stores/preferences";
import { useThreadList } from "@/stores/thread-list";
import { useWsClient } from "@/stores/ws-client";
import { useThread } from "@/hooks/use-thread";
import { Redirect, Link, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";

const STREAMING_THROTTLE_MS = 32;
const STREAMING_HAPTIC_THROTTLE_MS = 180;

function useRealChat() {
  const { activeThreadId, newChatProjectId, createThread } = useActiveThread();
  const { projects } = useThreadList();
  const { selectedModelSelection } = useModel();
  const { hapticsEnabled } = usePreferences();
  const router = useRouter();

  const thread = useThread(activeThreadId);

  const messages: ChatMessage[] = useMemo(
    () =>
      thread.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.text,
      })),
    [thread.messages],
  );

  const streamingStore = useMemo(() => {
    void activeThreadId;
    return createStreamingStore();
  }, [activeThreadId]);
  const streamingRef = useRef("");
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamWasActiveRef = useRef(false);
  const lastStreamingHapticRef = useRef(0);

  useEffect(() => {
    const streamingMsg = thread.messages.find((m) => m.streaming);
    if (!streamingMsg) {
      if (throttleRef.current) { clearTimeout(throttleRef.current); throttleRef.current = null; }
      if (streamWasActiveRef.current && hapticsEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      streamWasActiveRef.current = false;
      streamingStore.set("");
      streamingRef.current = "";
      return;
    }
    const text = streamingMsg.text;
    if (text === streamingRef.current) return;
    streamWasActiveRef.current = true;
    streamingRef.current = text;
    if (hapticsEnabled && text.length > 0) {
      const now = Date.now();
      if (now - lastStreamingHapticRef.current >= STREAMING_HAPTIC_THROTTLE_MS) {
        lastStreamingHapticRef.current = now;
        void Haptics.selectionAsync();
      }
    }
    if (!throttleRef.current) {
      throttleRef.current = setTimeout(() => {
        streamingStore.set(streamingRef.current);
        throttleRef.current = null;
      }, STREAMING_THROTTLE_MS);
    }
  }, [hapticsEnabled, thread.messages, streamingStore]);

  const [input, setInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || thread.isTurnRunning || !selectedModelSelection) return;
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setInput("");
    setCursorPosition(0);
    if (activeThreadId) {
      await thread.sendMessage(text, selectedModelSelection);
    } else {
      const projectId = newChatProjectId ?? projects[0]?.id;
      if (!projectId) {
        // No project selected yet — prompt the user to pick one
        router.navigate("/new-chat");
        return;
      }
      await createThread(projectId, text, selectedModelSelection);
    }
  }, [input, thread, activeThreadId, newChatProjectId, projects, selectedModelSelection, createThread, router, hapticsEnabled]);

  return { messages, input, setInput, isGenerating: thread.isTurnRunning, onSend, streamingStore, thread, cursorPosition, setCursorPosition };
}

export default function ChatScreen() {
  const { isPaired, isLoading } = useConnection();
  const { activeThreadId, activeThreadHydrated, newChatMode } = useActiveThread();
  const { status } = useWsClient();
  const chat = useRealChat();
  const { isGenerating, streamingStore } = chat;

  if (isLoading) return null;
  if (!isPaired) return <Redirect href="/pair" />;
  
  // Redirect only after persisted thread state has loaded and the server is
  // reachable. During transient reconnects, keep the chat route mounted so a
  // provider remount does not bounce the user to the welcome screen.
  if (
    activeThreadHydrated &&
    status === "connected" &&
    !activeThreadId &&
    !newChatMode
  ) {
    return <Redirect href="/default-view" />;
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.role === "user") {
      return <Message from="user">{item.content}</Message>;
    }
    const isStreaming =
      isGenerating &&
      chat.thread.messages.find((m) => m.id === item.id)?.streaming === true;
    return (
      <Message from="assistant">
        {isStreaming ? (
          <StreamingMessage store={streamingStore} />
        ) : (
          <MessageResponse>{item.content}</MessageResponse>
        )}
      </Message>
    );
  };

  const threadTitle = chat.thread.detail?.title?.trim();
  const emptyTitle = threadTitle ?? "New thread";
  const emptyDescription = "Open the sidebar to start a new thread";

  return (
    <View className="flex-1">
      <MainHeader />
      <ChatProvider value={chat}>
        <Conversation
          renderMessage={renderMessage}
          emptyState={
            <ConversationEmptyState
              title={emptyTitle}
              description={emptyDescription}
            />
          }
        >
          <ConversationScrollButton />
          <PromptInput>
            <Link href="/attachments" asChild>
              <PromptInputAction>
                <Icon icon={Plus} className="w-5 h-5 text-muted-foreground" />
              </PromptInputAction>
            </Link>
            <PromptInputBody>
              <PromptInputTextarea />
              <PromptInputSubmit />
            </PromptInputBody>
          </PromptInput>
        </Conversation>
      </ChatProvider>
    </View>
  );
}
