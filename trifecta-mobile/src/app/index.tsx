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
import {
  ThreadActionBanner,
  ThreadTimelineExtras,
} from "@/components/chat/thread-surfaces";
import { Icon } from "@/components/icon";
import { MainHeader } from "@/components/main-header";
import { useModel } from "@/components/model-context";
import { useActiveThread } from "@/stores/active-thread";
import { useConnection } from "@/stores/connection";
import { usePreferences } from "@/stores/preferences";
import { useThreadList } from "@/stores/thread-list";
import { useWsClient } from "@/stores/ws-client";
import { useThread } from "@/hooks/use-thread";
import { Redirect, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Platform, View } from "react-native";
import type { UploadChatAttachment } from "@/types/thread";
import { Image } from "expo-image";
import { getServerURLForPlatform } from "@/services/pairing";

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
        attachments: m.attachments,
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
  const [attachments, setAttachments] = useState<UploadChatAttachment[]>([]);

  const addAttachments = useCallback((incoming: UploadChatAttachment[]) => {
    setAttachments((current) => [...current, ...incoming].slice(0, 8));
  }, []);
  const removeAttachment = useCallback((name: string) => {
    setAttachments((current) => current.filter((item) => item.name !== name));
  }, []);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || thread.isTurnRunning || !selectedModelSelection) return;
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setInput("");
    setCursorPosition(0);
    const outgoingAttachments = attachments;
    setAttachments([]);
    if (activeThreadId) {
      await thread.sendMessage(text, selectedModelSelection, outgoingAttachments);
    } else {
      const projectId = newChatProjectId ?? projects[0]?.id;
      if (!projectId) {
        // No project selected yet — prompt the user to pick one
        router.navigate("/new-chat");
        return;
      }
      await createThread(projectId, text, selectedModelSelection, outgoingAttachments);
    }
  }, [input, attachments, thread, activeThreadId, newChatProjectId, projects, selectedModelSelection, createThread, router, hapticsEnabled]);

  return {
    messages,
    input,
    setInput,
    isGenerating: thread.isTurnRunning,
    onSend,
    onStop: thread.interruptTurn,
    streamingStore,
    thread,
    cursorPosition,
    setCursorPosition,
    error: thread.error,
    attachments,
    addAttachments,
    removeAttachment,
  };
}

async function pickImages(
  source: "camera" | "library",
): Promise<UploadChatAttachment[]> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          base64: true,
          quality: 0.88,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: 8,
          base64: true,
          quality: 0.88,
        });
  if (result.canceled) return [];
  return result.assets.flatMap((asset, index) => {
    if (!asset.base64) return [];
    const mimeType = asset.mimeType ?? "image/jpeg";
    const sizeBytes = Math.floor(asset.base64.length * 0.75);
    if (sizeBytes > 10 * 1024 * 1024) return [];
    return [{
      type: "image" as const,
      name: asset.fileName ?? `image-${Date.now()}-${index + 1}.jpg`,
      mimeType,
      sizeBytes,
      dataUrl: `data:${mimeType};base64,${asset.base64}`,
    }];
  });
}

export default function ChatScreen() {
  const { isPaired, isLoading, serverURL, bearerToken } = useConnection();
  const { activeThreadId, activeThreadHydrated, newChatMode } = useActiveThread();
  const { status } = useWsClient();
  const chat = useRealChat();
  const { isGenerating, streamingStore } = chat;

  const addPhoto = useCallback(() => {
    const choose = (source: "camera" | "library") => {
      void pickImages(source).then(chat.addAttachments).catch((cause) => {
        Alert.alert(
          "Couldn’t add image",
          cause instanceof Error ? cause.message : "Please try again.",
        );
      });
    };
    if (Platform.OS === "ios") {
      Alert.alert("Add image", undefined, [
        { text: "Camera", onPress: () => choose("camera") },
        { text: "Photo Library", onPress: () => choose("library") },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      Alert.alert("Add image", "Choose a source", [
        { text: "Camera", onPress: () => choose("camera") },
        { text: "Photos", onPress: () => choose("library") },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }, [chat.addAttachments]);

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
      return (
        <View className="items-end">
          {item.attachments?.length ? (
            <View className="mb-2 flex-row flex-wrap justify-end gap-2">
              {item.attachments.map((attachment) => (
                <Image
                  key={attachment.id}
                  source={{
                    uri: `${getServerURLForPlatform(serverURL ?? "").replace(/\/$/, "")}/attachments/${encodeURIComponent(attachment.id)}`,
                    headers: bearerToken
                      ? { Authorization: `Bearer ${bearerToken}` }
                      : undefined,
                  }}
                  contentFit="cover"
                  style={{ width: 112, height: 112, borderRadius: 18 }}
                  accessibilityLabel={attachment.name}
                />
              ))}
            </View>
          ) : null}
          <Message from="user">{item.content}</Message>
        </View>
      );
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
          footer={<ThreadTimelineExtras detail={chat.thread.detail} />}
          emptyState={
            <ConversationEmptyState
              title={emptyTitle}
              description={emptyDescription}
            />
          }
        >
          <ConversationScrollButton />
          <PromptInput banner={<ThreadActionBanner detail={chat.thread.detail} />}>
            <PromptInputAction onPress={addPhoto}>
              <Icon icon={Plus} className="w-5 h-5 text-muted-foreground" />
            </PromptInputAction>
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
