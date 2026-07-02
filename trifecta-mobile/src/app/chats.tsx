import { useDrawer } from "@/components/drawer-content";
import { Icon } from "@/components/icon";
import { labelForSelection, useModel } from "@/components/model-context";
import { Image } from "@/components/tw";
import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import { useWsClient } from "@/stores/ws-client";
import type { ServerProvider, ThreadShell } from "@/types/thread";
import { secureRandomId } from "@/utils/secure-id";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Color, Link, Stack, useRouter } from "expo-router";
import { ChevronRight, Menu, Search } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Platform, Pressable, Text, View } from "react-native";

function formatTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "Today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function ThreadRow({
  item,
  providers,
  onRename,
  onDelete,
  onSelect,
}: {
  item: ThreadShell;
  providers: ServerProvider[];
  onRename: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const timeStr = formatTimeAgo(item.latestUserMessageAt ?? item.updatedAt);
  const modelLabel = labelForSelection(item.modelSelection, providers);

  return (
    <Link href="/" asChild>
      <Link.Trigger>
        <Pressable
          onPress={onSelect}
          className="flex-row items-center px-5 py-4 active:bg-card"
        >
          <View className="flex-1 mr-3">
            <Text numberOfLines={1} className="text-[17px] text-foreground">
              {item.title || "New thread"}
            </Text>
            <Text className="text-[13px] text-muted-foreground">{modelLabel} · {timeStr}</Text>
          </View>
          {process.env.EXPO_OS === "ios" ? (
            <Image
              source="sf:chevron.right"
              className="w-2.5 h-4 font-medium text-muted-foreground"
            />
          ) : (
            <Icon icon={ChevronRight} className="w-2.5 h-4 text-muted-foreground" />
          )}
        </Pressable>
      </Link.Trigger>

      <Link.Menu>
        <Link.MenuAction title="Rename" icon="pencil" onPress={onRename} />
        <Link.MenuAction
          title="Delete"
          icon="trash"
          destructive
          onPress={onDelete}
        />
      </Link.Menu>
    </Link>
  );
}

function EmptySearch({ query }: { query: string }) {
  return (
    <View className="flex-1 items-center justify-center pt-32 gap-2">
      <Icon icon={Search} className="w-10 h-10 text-muted-foreground" />
      <Text className="text-[17px] text-muted-foreground text-center px-10">
        No results for &ldquo;{query}&rdquo;
      </Text>
    </View>
  );
}

function EmptyThreads() {
  return (
    <View className="flex-1 items-center justify-center pt-32 gap-2">
      <Text className="text-[17px] text-muted-foreground">No threads yet</Text>
      <Text className="text-[13px] text-muted-foreground">
        Start a chat to create your first thread
      </Text>
    </View>
  );
}

export default function ChatsScreen() {
  const [search, setSearch] = useState("");
  const { activeThreads } = useThreadList();
  const { request } = useWsClient();
  const { setActiveThreadId } = useActiveThread();
  const { providers, setSelectedModelSelection } = useModel();
  const router = useRouter();

  const filtered = useMemo(() => {
    if (!search) return activeThreads;
    const q = search.toLowerCase();
    return activeThreads.filter((t) =>
      (t.title || "").toLowerCase().includes(q),
    );
  }, [search, activeThreads]);

  const handleRename = useCallback(
    (thread: ThreadShell) => {
      if (Platform.OS !== "ios") return;
      Alert.prompt(
        "Rename Thread",
        undefined,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "OK",
            onPress: async (newTitle?: string) => {
              if (!newTitle?.trim()) return;
              try {
                await request("orchestration.dispatchCommand", {
                  type: "thread.meta.update",
                  commandId: secureRandomId(),
                  threadId: thread.id,
                  title: newTitle.trim(),
                });
              } catch {}
            },
          },
        ],
        "plain-text",
        thread.title,
      );
    },
    [request],
  );

  const handleDelete = useCallback(
    (thread: ThreadShell) => {
      Alert.alert(
        "Delete Thread",
        `Delete "${thread.title || "this thread"}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await request("orchestration.dispatchCommand", {
                  type: "thread.delete",
                  commandId: secureRandomId(),
                  threadId: thread.id,
                  createdAt: new Date().toISOString(),
                });
              } catch {}
            },
          },
        ],
      );
    },
    [request],
  );

  const handleSelect = useCallback(
    (thread: ThreadShell) => {
      setActiveThreadId(thread.id);
      setSelectedModelSelection(thread.modelSelection);
      router.replace("/");
    },
    [setActiveThreadId, setSelectedModelSelection, router],
  );

  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustContentInsets
        automaticallyAdjustsScrollIndicatorInsets
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="android:pb-safe pb-0"
        renderItem={({ item }) => (
          <ThreadRow
            item={item}
            providers={providers}
            onRename={() => handleRename(item)}
            onDelete={() => handleDelete(item)}
            onSelect={() => handleSelect(item)}
          />
        )}
        ListEmptyComponent={
          search ? (
            <EmptySearch query={search} />
          ) : (
            <EmptyThreads />
          )
        }
      />

      <Stack.SearchBar
        placeholder="Search threads"
        hideWhenScrolling={false}
        onChangeText={(e) => setSearch(e.nativeEvent.text)}
        onCancelButtonPress={() => setSearch("")}
      />

      <LeftToolbar />
      <RightToolbar />
      <BottomToolbar />
    </>
  );
}

function LeftToolbar() {
  const { openDrawer } = useDrawer();

  if (process.env.EXPO_OS === "android") {
    return (
      <Stack.Toolbar placement="left" asChild>
        <Pressable
          onPress={openDrawer}
          accessibilityLabel="Open drawer"
          accessibilityRole="button"
          className="p-2 -ml-1 active:opacity-60"
        >
          <Icon icon={Menu} className="w-6 h-6 text-foreground" />
        </Pressable>
      </Stack.Toolbar>
    );
  }
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
    </Stack.Toolbar>
  );
}

function RightToolbar() {
  return null;
}

function BottomToolbar() {
  const router = useRouter();

  return (
    <Stack.Toolbar placement="bottom">
      {isLiquidGlassAvailable() && (
        <Stack.Toolbar.SearchBarSlot separateBackground />
      )}
      <Stack.Toolbar.Button
        tintColor={Color.ios.label}
        icon="square.and.pencil"
        onPress={() => {
          if (process.env.EXPO_OS === "android") {
            router.navigate("/");
          }
          router.navigate("/new-chat");
        }}
        separateBackground
      />
    </Stack.Toolbar>
  );
}
