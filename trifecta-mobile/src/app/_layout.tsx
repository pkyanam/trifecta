import React, { useEffect, useRef } from "react";
import {
  DrawerContent,
  DrawerProvider,
  useDrawer,
} from "@/components/drawer-content";
import { DrawerLayout } from "@/components/drawer-layout";
import { ServerPickerProvider } from "@/components/server-picker-modal";
import "@/global.css";
import "@/utils/fetch-polyfill";
import { useSystemBackgroundColor } from "@/utils/use-system-background-color";
import { ConnectionProvider, useConnection } from "@/stores/connection";
import { PreferencesProvider, usePreferences } from "@/stores/preferences";
import { WsClientProvider } from "@/stores/ws-client";
import { ThreadListProvider, useThreadList } from "@/stores/thread-list";
import { ActiveThreadProvider, useActiveThread } from "@/stores/active-thread";
import { SshProvider } from "@/stores/ssh";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BackHandler, Platform } from "react-native";

import { ModelProvider } from "@/components/model-context";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as RNTheme,
} from "expo-router/react-navigation";
import { SafeAreaListener } from "react-native-safe-area-context";
import { Uniwind, useCSSVariable } from "uniwind";

const GLASS = isLiquidGlassAvailable();
const IS_ANDROID = process.env.EXPO_OS === "android";

function ThemeProvider(props: { children: React.ReactNode }) {
  const { resolvedColorScheme } = usePreferences();
  return (
    <RNTheme value={resolvedColorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
        {props.children}
      </SafeAreaListener>
    </RNTheme>
  );
}

export const unstable_settings = {
  anchor: "index",
};

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <ConnectionProvider>
          <WsClientInner>
            <KeyboardProvider>
              <ModelProvider>
                <DrawerProvider>
                  <RootDrawer />
                </DrawerProvider>
              </ModelProvider>
              {process.env.EXPO_OS !== "ios" && <StatusBar style="auto" />}
            </KeyboardProvider>
          </WsClientInner>
        </ConnectionProvider>
      </ThemeProvider>
    </PreferencesProvider>
  );
}

function WsClientInner({ children }: { children: React.ReactNode }) {
  const { serverURL, bearerToken, flavor, isPaired } = useConnection();
  return (
    <WsClientProvider
      serverURL={isPaired ? serverURL : null}
      bearerToken={isPaired ? bearerToken : null}
      flavor={isPaired ? flavor : null}
    >
      <ThreadListProvider>
        <ActiveThreadProvider>
          <SshProvider>
            <ServerPickerProvider>
              <ServerChangeResetter />
              {children}
            </ServerPickerProvider>
          </SshProvider>
        </ActiveThreadProvider>
      </ThreadListProvider>
    </WsClientProvider>
  );
}

/**
 * Clears thread list + active thread state when the active server changes
 * (switch, re-pair, or removal of the active server), so a stale thread id
 * from one server is never applied to another.
 *
 * The initial load is skipped: we wait until `isLoading` becomes false (i.e.
 * credentials have been read from SecureStore), record the loaded
 * `activeServerId`, and only reset on *subsequent* changes. This preserves
 * the restored active thread on app launch.
 */
function ServerChangeResetter() {
  const { activeServerId, isLoading } = useConnection();
  const { clearThreadList } = useThreadList();
  const { clearThreadState } = useActiveThread();
  // undefined = haven't seen the loaded value yet; once loaded, holds the id.
  const loadedRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (isLoading) {
      // Still loading credentials — don't track changes yet.
      loadedRef.current = undefined;
      return;
    }
    if (loadedRef.current === undefined) {
      // First observation after load — record, don't reset.
      loadedRef.current = activeServerId;
      return;
    }
    if (loadedRef.current !== activeServerId) {
      loadedRef.current = activeServerId;
      clearThreadList();
      clearThreadState();
    }
  }, [activeServerId, isLoading, clearThreadList, clearThreadState]);
  return null;
}

function RootDrawer() {
  const router = useRouter();
  const { isOpen, openDrawer, closeDrawer } = useDrawer();

  useSystemBackgroundColor();

  return (
    <DrawerLayout
      open={isOpen}
      onOpen={openDrawer}
      onClose={closeDrawer}
      drawerContent={
        <DrawerContent
          onNavigate={(path) => {
            closeDrawer();
            router.replace(path, { withAnchor: true });
          }}
          onOpenModal={(path) => {
            router.navigate(path);
          }}
        />
      }
    >
      <StackLayout />
    </DrawerLayout>
  );
}

function StackLayout() {
  const appForeground = useCSSVariable("--app-foreground") as string;
  const appBackground = useCSSVariable("--app-background") as string;

  // Handle Android back button when there's no screen to go back to
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      // Always return true to prevent the warning when there's nowhere to go back
      // The navigation system will handle actual back navigation when possible
      return true;
    });

    return () => backHandler.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerTransparent: GLASS,
        headerBackButtonDisplayMode: GLASS ? "minimal" : "default",
        headerTintColor: appForeground,
        headerShadowVisible: IS_ANDROID ? false : undefined,
        headerStyle: IS_ANDROID
          ? {
              backgroundColor: appBackground,
            }
          : undefined,
      }}
    >
      <Stack.Screen
        name="index"
        dangerouslySingular
        options={{
          title: "Chat",
          animation: "none",
          gestureEnabled: false,
          // On Android, SmartHeader provides its own header — hide the native one
          headerShown: IS_ANDROID ? false : undefined,
        }}
      />

      <Stack.Screen
        name="default-view"
        options={{
          animation: "none",
          gestureEnabled: false,
          // On Android, SmartHeader provides its own header — hide the native one
          headerShown: IS_ANDROID ? false : undefined,
        }}
      />

      <Stack.Screen
        name="chats"
        options={{
          title: "Chats",
          animation: "none",
          headerLargeTitleShadowVisible: false,
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="attachments"
        options={{
          title: "Add to chat",
          presentation: "formSheet",
          sheetAllowedDetents: [0.55],
          // following https://m3.material.io/components/bottom-sheets/specs
          sheetCornerRadius: IS_ANDROID ? 28 : undefined,
          sheetGrabberVisible: true,
          headerTransparent: GLASS,
          headerLargeTitleShadowVisible: false,
        }}
      />

      <Stack.Screen
        name="model-picker"
        options={{
          title: "Model",
          presentation: "formSheet",
          sheetAllowedDetents: [0.72],
          sheetCornerRadius: IS_ANDROID ? 28 : undefined,
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="new-chat"
        options={{
          title: "New Chat",
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetCornerRadius: IS_ANDROID ? 28 : undefined,
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="ssh"
        options={{
          title: "SSH Terminal",
          presentation: IS_ANDROID ? undefined : "formSheet",
          sheetAllowedDetents: [0.85],
          sheetCornerRadius: IS_ANDROID ? 28 : undefined,
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="pair"
        options={{
          headerShown: false,
          animation: "fade",
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="(settings)"
        options={{
          presentation: IS_ANDROID ? undefined : "modal",
          headerShown: false,
        }}
      />
    </Stack>
  );
}
