import { Icon } from "@/components/icon";
import { useModel } from "@/components/model-context";
import { Link, Stack } from "expo-router";
import { ChevronDown, Menu } from "lucide-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { useDrawer } from "./drawer-content";

const IS_ANDROID = Platform.OS === "android";

function HeaderTitleMenu() {
  const { selectedModelLabel } = useModel();
  return (
    <Link href="/model-picker" asChild>
      <Pressable
        accessibilityRole="button"
        className={IS_ANDROID
          ? "rounded-md px-4 py-2 active:bg-muted"
          : "self-center rounded-md px-2 py-1 active:bg-muted"}
      >
        <View className="flex-row items-center gap-1">
          <Text className="text-[17px] font-semibold text-foreground" numberOfLines={2}>
            {selectedModelLabel}
          </Text>
          <Icon icon={ChevronDown} className="h-3 w-3 text-foreground" />
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
            className="-ml-1 p-2 active:opacity-60"
          >
            <Icon icon={Menu} className="h-6 w-6 text-foreground" />
          </Pressable>
        </Stack.Toolbar>
      )}
      <Stack.Screen.Title asChild>
        <HeaderTitleMenu />
      </Stack.Screen.Title>
    </>
  );
}
