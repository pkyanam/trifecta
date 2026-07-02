import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { serverDisplayName, serverHostname, useConnection, type PairedServer } from "@/stores/connection";
import { useWsClient, type WsStatus } from "@/stores/ws-client";
import { cn } from "@/utils/tailwind";
import { useRouter } from "expo-router";
import { Check, Plus, RefreshCw, Server, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * On-launch server picker. Appears when the app is paired with one or more
 * servers but is not connected (the active server is unreachable). Lets the
 * user pick a different server to connect to, retry the active one, or pair
 * a new server.
 *
 * Trigger rules:
 *  - Only when paired and there is at least one server.
 *  - Skip the initial "offline" state before the first connect attempt.
 *  - Show immediately once a connection attempt has failed (error/offline
 *    after we've seen "connecting").
 *  - Also show if stuck in "connecting" beyond a grace period.
 *  - Auto-hide as soon as status becomes "connected"; resets dismissal.
 */
export function ServerPickerModal() {
  const { isPaired, isLoading, servers, activeServerId, switchServer } = useConnection();
  const { status, reconnect } = useWsClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Tracks whether we've ever started a real connection attempt this session,
  // so we don't flash the modal on the initial "offline" before "connecting".
  const sawAttemptRef = useRef(false);

  useEffect(() => {
    if (status === "connecting" || status === "connected") {
      sawAttemptRef.current = true;
    }
  }, [status]);

  useEffect(() => {
    // No servers / still loading credentials → never show.
    if (isLoading || !isPaired || servers.length === 0) {
      setTimeout(() => setVisible(false), 0);
      return;
    }

    // Connected → hide and reset dismissal for next disconnect.
    if (status === "connected") {
      setTimeout(() => {
        setVisible(false);
        setDismissed(false);
      }, 0);
      return;
    }

    if (dismissed) return;

    // A real attempt already happened and now we're offline/error → show now.
    if (sawAttemptRef.current && (status === "error" || status === "offline")) {
      setTimeout(() => setVisible(true), 0);
      return;
    }

    // Stuck connecting for too long → show after grace period.
    if (status === "connecting") {
      const timer = setTimeout(() => setVisible(true), 6000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isPaired, servers.length, status, dismissed]);

  const handleSelect = (server: PairedServer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (server.id === activeServerId) {
      reconnect();
    } else {
      void switchServer(server.id);
    }
    // Keep the modal open until status flips to "connected" so a failed
    // switch lets the user try another server without re-triggering.
  };

  const handlePairNew = () => {
    setVisible(false);
    setDismissed(true);
    router.navigate("/pair");
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black/40 justify-center items-center px-6">
        <Pressable className="absolute inset-0" onPress={handleDismiss} />
        <View
          className="w-full max-w-[400px] bg-background rounded-3xl overflow-hidden border border-border"
          style={{ maxHeight: `80%` }}
        >
          {/* Header */}
          <View className="flex-row items-center px-5 pt-5 pb-3">
            <View className="flex-1">
              <Text className="text-[19px] font-bold text-foreground tracking-tight">
                Connect to server
              </Text>
              <StatusLine status={status} />
            </View>
            <Pressable
              onPress={handleDismiss}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center active:opacity-60"
              accessibilityLabel="Dismiss"
            >
              <Icon icon={X} className="w-4 h-4 text-foreground" />
            </Pressable>
          </View>

          {/* Server list */}
          <ScrollView
            className="px-3"
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {servers.map((server) => (
              <PickerRow
                key={server.id}
                server={server}
                active={server.id === activeServerId}
                status={status}
                onPress={() => handleSelect(server)}
              />
            ))}
          </ScrollView>

          {/* Actions */}
          <View
            className="px-5 pt-3 gap-2.5 border-t border-border"
            style={{ paddingBottom: Math.max(insets.bottom + 12, 16) }}
          >
            {activeServerId && servers.some((s) => s.id === activeServerId) && (
              <Pressable
                onPress={() => {
                  const active = servers.find((s) => s.id === activeServerId);
                  if (active) handleSelect(active);
                }}
                className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-muted active:bg-accent"
              >
                <Icon icon={RefreshCw} className="w-4 h-4 text-foreground" strokeWidth={2.5} />
                <Text className="text-[15px] font-semibold text-foreground">Retry connection</Text>
              </Pressable>
            )}
            <TouchableGlass
              onPress={handlePairNew}
              className="rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:opacity-60"
            >
              <Icon icon={Plus} className="w-4 h-4 text-foreground" strokeWidth={2.5} />
              <Text className="text-[15px] font-semibold text-foreground">Pair new server</Text>
            </TouchableGlass>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatusLine({ status }: { status: WsStatus }) {
  const text =
    status === "connecting"
      ? "Connecting…"
      : status === "error"
        ? "Connection failed"
        : status === "offline"
          ? "Disconnected"
          : "Not connected";
  return (
    <Text className="text-[13px] text-muted-foreground mt-0.5">{text}</Text>
  );
}

function PickerRow({
  server,
  active,
  status,
  onPress,
}: {
  server: PairedServer;
  active: boolean;
  status: WsStatus;
  onPress: () => void;
}) {
  const name = serverDisplayName(server);
  const host = serverHostname(server.serverURL);
  const showHost = server.label?.trim() && server.label.trim() !== host;
  const flavorLabel = server.flavor === "t3code" ? "T3 Code" : "Trifecta";
  const connecting = active && status === "connecting";

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-3 py-3 gap-3 rounded-2xl active:bg-muted"
    >
      <View
        className={cn(
          "w-9 h-9 rounded-full items-center justify-center",
          active ? "bg-accent" : "bg-muted",
        )}
      >
        <Icon
          icon={Server}
          className={cn("w-4 h-4", active ? "text-foreground" : "text-muted-foreground")}
        />
      </View>
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
          {connecting ? " · connecting…" : active ? " · active" : ""}
        </Text>
      </View>
      {active ? (
        <Icon icon={Check} className="w-4 h-4 text-sf-green" strokeWidth={2.5} />
      ) : (
        <View className="px-3 py-1.5 rounded-full bg-muted">
          <Text className="text-[12px] font-semibold text-foreground">Connect</Text>
        </View>
      )}
    </Pressable>
  );
}
