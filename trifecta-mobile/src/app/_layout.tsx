import React from "react";
import {
  DrawerContent,
  DrawerProvider,
  useDrawer,
} from "@/components/drawer-content";
import { DrawerLayout } from "@/components/drawer-layout";
import "@/global.css";
import "@/utils/fetch-polyfill";
import { useSystemBackgroundColor } from "@/utils/use-system-background-color";
import { ConnectionProvider, useConnection } from "@/stores/connection";
import { PreferencesProvider, usePreferences } from "@/stores/preferences";
import { WsClientProvider } from "@/stores/ws-client";
import { ThreadListProvider } from "@/stores/thread-list";
import { ActiveThreadProvider } from "@/stores/active-thread";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";

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
  const { serverURL, bearerToken, isPaired } = useConnection();
  return (
    <WsClientProvider
      serverURL={isPaired ? serverURL : null}
      bearerToken={isPaired ? bearerToken : null}
    >
      <ThreadListProvider>
        <ActiveThreadProvider>
          {children}
        </ActiveThreadProvider>
      </ThreadListProvider>
    </WsClientProvider>
  );
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
