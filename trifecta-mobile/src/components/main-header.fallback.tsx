import { Icon } from "@/components/icon";
import { useModel } from "@/components/model-context";
import { useActiveThread } from "@/stores/active-thread";
import { useWsClient } from "@/stores/ws-client";
import { Link, Stack, useRouter } from "expo-router";
import { ChevronDown, Menu } from "lucide-react-native";
import { Platform, Alert, Pressable, Text, View } from "react-native";
import { useDrawer } from "./drawer-content";

const IS_ANDROID = Platform.OS === "android";

function randomId(): string {
  let result = "";
  while (result.length < 32) {
    result += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  }
  return result.slice(0, 32);
}

function HeaderTitleMenu() {
  const { selectedModelLabel } = useModel();
  const { activeThreadId } = useActiveThread();
  const { request } = useWsClient();
  const router = useRouter();

  function handleRename() {
    if (!activeThreadId) return;
    Alert.prompt(
      "Rename Thread",
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "OK",
          onPress: async (title?: string) => {
            if (!title?.trim()) return;
            try {
              await request("orchestration.dispatchCommand", {
                type: "thread.meta.update",
                commandId: randomId(),
                threadId: activeThreadId,
                title: title.trim(),
              });
            } catch {}
          },
        },
      ],
      "plain-text",
    );
  }

  function handleDelete() {
    if (!activeThreadId) return;
    Alert.alert("Delete Thread", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await request("orchestration.dispatchCommand", {
              type: "thread.delete",
              commandId: randomId(),
              threadId: activeThreadId,
              createdAt: new Date().toISOString(),
            });
            router.replace("/chats");
          } catch {}
        },
      },
    ]);
  }

  return (
    <Link href="/model-picker" asChild>
      <Pressable
        accessibilityRole="button"
        className={IS_ANDROID 
          ? "px-4 py-2 rounded-md active:bg-muted"
          : "px-2 py-1 rounded-md active:bg-muted flex-col items-center self-center"
        }
      >
        <View className={IS_ANDROID ? "flex-row items-center gap-1" : "flex-row items-center gap-1 flex-shrink-1"}>
          <Text className="text-[17px] font-semibold text-foreground" numberOfLines={2}>
            {selectedModelLabel}
          </Text>
          <Icon icon={ChevronDown} className="w-3 h-3 text-foreground flex-shrink-0" />
        </View>
      </Pressable>
    </Link>
  );
}

export function MainHeader() {
  const { openDrawer } = useDrawer();
  return (
    <>
      {process.env.EXPO_OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
        </Stack.Toolbar>
      ) : (
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
      )}

      <Stack.Screen.Title asChild>
        <HeaderTitleMenu />
      </Stack.Screen.Title>
    </>
  );
}
