import { Icon } from "@/components/icon";
import { serverDisplayName, serverHostname, useConnection, type PairedServer } from "@/stores/connection";
import { useWsClient, type WsStatus } from "@/stores/ws-client";
import { cn } from "@/utils/tailwind";
import * as Haptics from "expo-haptics";
import { Check, ChevronRight, Plus, Server, X } from "lucide-react-native";
import React, { createContext, use, useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

// ── Context ─────────────────────────────────────────────────────────────

/**
 * Global server picker modal controller.
 *
 * The provider is mounted once in the root layout, wrapping the entire app.
 * Any descendant can call `openServerPicker()` to show a quick server-switch
 * modal without navigating away.
 */
type ServerPickerContextValue = {
  openServerPicker: () => void;
  closeServerPicker: () => void;
};

const ServerPickerContext = createContext<ServerPickerContextValue | null>(null);

export function useServerPicker() {
  const ctx = use(ServerPickerContext);
  if (!ctx) throw new Error("useServerPicker must be used within ServerPickerProvider");
  return ctx;
}

// ── Provider (wraps children) ────────────────────────────────────────────

export function ServerPickerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  return (
    <ServerPickerContext value={{ openServerPicker: open, closeServerPicker: close }}>
      {children}
      <ServerPickerContent visible={visible} onClose={close} />
    </ServerPickerContext>
  );
}

// ── Modal content ───────────────────────────────────────────────────────

function ServerPickerContent({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { servers, activeServerId, isPaired, switchServer } = useConnection();
  const { status } = useWsClient();
  const router = useRouter();
  const isConnected = status === "connected";

  const handleSelect = useCallback(async (server: PairedServer) => {
    if (server.id === activeServerId) {
      onClose();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await switchServer(server.id);
    onClose();
  }, [activeServerId, switchServer, onClose]);

  const handleAddServer = useCallback(() => {
    onClose();
    router.navigate("/pair?returnTo=settings");
  }, [onClose, router]);

  if (!isPaired || servers.length === 0) {
    // Don't render the modal if there are no servers — the pair screen
    // handles the empty state.
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/60 items-center justify-center"
        onPress={onClose}
      >
        <View
          className="w-full max-w-lg mx-4 bg-background rounded-3xl overflow-hidden border border-border/50"
          style={{ borderRadius: 24 }}
        >
          <Pressable className="w-full" onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View className="px-5 py-4 border-b border-border/50 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Icon icon={Server} className="w-5 h-5 text-foreground" />
                <Text className="text-xl font-bold text-foreground">Servers</Text>
              </View>
              <Pressable
                onPress={onClose}
                className="w-8 h-8 items-center justify-center rounded-full active:bg-muted/50"
                accessibilityLabel="Close"
              >
                <Icon icon={X} className="w-4 h-4 text-foreground" />
              </Pressable>
            </View>

            {/* Server list */}
            <ScrollView className="max-h-96" showsVerticalScrollIndicator={servers.length > 6}>
              {servers.map((server, i) => {
                const active = server.id === activeServerId;
                return (
                  <PickerServerRow
                    key={server.id}
                    server={server}
                    active={active}
                    connected={active && isConnected}
                    status={active ? status : "offline"}
                    isFirst={i === 0}
                    onSelect={() => void handleSelect(server)}
                  />
                );
              })}
            </ScrollView>

            {/* Add server */}
            <View className="border-t border-border/50">
              <Pressable
                onPress={handleAddServer}
                className="flex-row items-center gap-3 px-5 py-3.5 active:bg-muted"
              >
                <View className="w-7 h-7 rounded-full bg-muted items-center justify-center">
                  <Icon icon={Plus} className="w-4 h-4 text-foreground" strokeWidth={2.5} />
                </View>
                <Text className="flex-1 text-[16px] text-foreground">Add server</Text>
                <Icon icon={ChevronRight} className="w-3.5 h-3.5 text-muted-foreground/50" />
              </Pressable>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function PickerServerRow({
  server,
  active,
  connected,
  status,
  isFirst,
  onSelect,
}: {
  server: PairedServer;
  active: boolean;
  connected: boolean;
  status: WsStatus;
  isFirst: boolean;
  onSelect: () => void;
}) {
  const name = serverDisplayName(server);
  const host = serverHostname(server.serverURL);
  const showHost = server.label?.trim() && server.label.trim() !== host;
  const flavorLabel = server.flavor === "t3code" ? "T3 Code" : "Trifecta";

  return (
    <Pressable
      onPress={onSelect}
      className={cn(
        "flex-row items-center px-5 py-3.5 gap-3 active:bg-muted",
        !isFirst && "border-t border-border/30",
      )}
    >
      <View
        className={cn(
          "w-2 h-2 rounded-full",
          active ? (connected ? "bg-sf-green" : "bg-sf-yellow") : "bg-muted-foreground/30",
        )}
      />
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className={cn("text-[16px]", active ? "text-foreground font-semibold" : "text-foreground")}
        >
          {name}
        </Text>
        <Text numberOfLines={1} className="text-[12px] text-muted-foreground/70 mt-0.5">
          {showHost ? `${host} · ` : ""}
          {flavorLabel}
          {active && !connected ? (status === "error" ? " · error" : " · connecting…") : ""}
        </Text>
      </View>
      {active ? (
        <Icon icon={Check} className="w-4 h-4 text-sf-green" strokeWidth={2.5} />
      ) : (
        <Icon icon={ChevronRight} className="w-3.5 h-3.5 text-muted-foreground/50" />
      )}
    </Pressable>
  );
}
