import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { serverDisplayName, serverHostname, useConnection, type PairedServer } from "@/stores/connection";
import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import { usePreferences, type ThemePreference } from "@/stores/preferences";
import { useWsClient } from "@/stores/ws-client";
import { cn } from "@/utils/tailwind";
import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { useCallback } from "react";
import {
  Check,
  ChevronRight,
  LogOut,
  Plus,
  Server,
  SunMoon,
  TrendingUp,
  Trash2,
  Vibrate,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";

export default function SettingsScreen() {
  const { servers, activeServerId, isPaired, switchServer, removeServer } = useConnection();
  const { clearThreadState } = useActiveThread();
  const { clearThreadList } = useThreadList();
  const { themePreference, setThemePreference, hapticsEnabled, setHapticsEnabled } = usePreferences();
  const router = useRouter();

  const handleSwitch = useCallback((server: PairedServer) => {
    if (server.id === activeServerId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void switchServer(server.id);
  }, [activeServerId, switchServer]);

  const handleRemove = useCallback((server: PairedServer) => {
    const name = serverDisplayName(server);
    Alert.alert(
      "Remove server",
      `Remove “${name}” from this device? You will need to pair again to reconnect.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            // If removing the active server, clear cached thread state first.
            if (server.id === activeServerId) {
              clearThreadState();
              clearThreadList();
            }
            await removeServer(server.id);
            if (servers.filter((s) => s.id !== server.id).length === 0) {
              router.replace("/pair");
            }
          },
        },
      ],
    );
  }, [activeServerId, clearThreadState, clearThreadList, removeServer, servers, router]);

  const handleAddServer = useCallback(() => {
    router.navigate("/pair?returnTo=settings");
  }, [router]);

  return (
    <ScrollView
      className="flex-1 bg-background text-foreground"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="android:pb-safe"
    >
      <ServersSection
        servers={servers}
        activeServerId={activeServerId}
        isPaired={isPaired}
        onSelect={handleSwitch}
        onRemove={handleRemove}
        onAdd={handleAddServer}
      />

      {/* Account */}
      <SettingsRow icon={TrendingUp} label="Usage" />

      <SectionDivider />

      {/* Preferences */}
      <AppearanceSetting
        value={themePreference}
        onValueChange={setThemePreference}
      />

      <SectionDivider />

      {/* Toggles */}
      <SettingsToggleRow
        icon={Vibrate}
        label="Haptic feedback"
        value={hapticsEnabled}
        onValueChange={setHapticsEnabled}
      />

      {isPaired && (
        <>
          <SectionDivider />
          <RemoveActiveRow
            servers={servers}
            activeServerId={activeServerId}
            onRemove={handleRemove}
          />
        </>
      )}

      {/* Log out */}
      <Pressable className="flex-row items-center px-5 py-3.5 gap-4 active:bg-muted">
        <Icon
          icon={LogOut}
          className="w-5 h-5 text-foreground"
        />
        <Text className="text-[17px] text-foreground">
          Log out
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ── Servers section ─────────────────────────────────────────────────────

function ServersSection({
  servers,
  activeServerId,
  isPaired,
  onSelect,
  onRemove,
  onAdd,
}: {
  servers: PairedServer[];
  activeServerId: string | null;
  isPaired: boolean;
  onSelect: (s: PairedServer) => void;
  onRemove: (s: PairedServer) => void;
  onAdd: () => void;
}) {
  const { status } = useWsClient();
  const isConnected = status === "connected";

  if (!isPaired || servers.length === 0) {
    return (
      <View className="mx-5 mt-4 mb-5">
        <Text className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          Servers
        </Text>
        <View className="bg-muted rounded-2xl px-4 py-5 items-center gap-3">
          <Icon icon={Server} className="w-5 h-5 text-muted-foreground" />
          <Text className="text-[15px] text-muted-foreground text-center">
            No servers paired yet.
          </Text>
          <AddServerButton onPress={onAdd} />
        </View>
      </View>
    );
  }

  return (
    <View className="mx-5 mt-4 mb-5">
      <Text className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
        Servers
      </Text>
      <View className="bg-muted rounded-2xl overflow-hidden">
        {servers.map((server, i) => {
          const active = server.id === activeServerId;
          return (
            <ServerRow
              key={server.id}
              server={server}
              active={active}
              connected={active && isConnected}
              isFirst={i === 0}
              onSelect={() => onSelect(server)}
              onRemove={() => onRemove(server)}
            />
          );
        })}
      </View>
      <AddServerRow onPress={onAdd} />
    </View>
  );
}

function ServerRow({
  server,
  active,
  connected,
  isFirst,
  onSelect,
  onRemove,
}: {
  server: PairedServer;
  active: boolean;
  connected: boolean;
  isFirst: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const name = serverDisplayName(server);
  const host = serverHostname(server.serverURL);
  const showHost = server.label?.trim() && server.label.trim() !== host;
  const flavorLabel = server.flavor === "t3code" ? "T3 Code" : "Trifecta";

  return (
    <Pressable
      onPress={onSelect}
      onLongPress={onRemove}
      accessibilityHint={!active ? "Double tap to switch. Long press to remove this server" : "Active server"}
      className={cn(
        "flex-row items-center px-4 py-3.5 gap-3 active:bg-accent",
        !isFirst && "border-t border-border",
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
          {active && !connected ? " · connecting…" : ""}
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

function AddServerRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 mt-2.5 px-4 py-3.5 rounded-2xl bg-muted active:bg-accent"
    >
      <View className="w-7 h-7 rounded-full bg-background items-center justify-center">
        <Icon icon={Plus} className="w-4 h-4 text-foreground" strokeWidth={2.5} />
      </View>
      <Text className="flex-1 text-[16px] text-foreground">Add server</Text>
      <Icon icon={ChevronRight} className="w-3.5 h-3.5 text-muted-foreground/50" />
    </Pressable>
  );
}

function AddServerButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableGlass
      onPress={onPress}
      className="rounded-full px-5 py-2.5 flex-row items-center gap-2 active:opacity-60"
    >
      <Icon icon={Plus} className="w-4 h-4 text-foreground" strokeWidth={2.5} />
      <Text className="text-[15px] font-semibold text-foreground">Add server</Text>
    </TouchableGlass>
  );
}

function RemoveActiveRow({
  servers,
  activeServerId,
  onRemove,
}: {
  servers: PairedServer[];
  activeServerId: string | null;
  onRemove: (s: PairedServer) => void;
}) {
  const active = servers.find((s) => s.id === activeServerId);
  if (!active) return null;
  return (
    <Pressable
      onPress={() => onRemove(active)}
      className="flex-row items-center px-5 py-3.5 gap-4 active:bg-muted"
    >
      <Icon icon={Trash2} className="w-5 h-5 text-sf-red" />
      <Text className="text-[17px] text-sf-red">Remove “{serverDisplayName(active)}”</Text>
    </Pressable>
  );
}

// ── Existing helpers ────────────────────────────────────────────────────

function SectionDivider() {
  return <View className="h-px bg-border mx-5" />;
}

function SettingsRow({
  icon,
  label,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
}) {
  return (
    <View className="flex-row items-center px-5 py-3.5 gap-4 active:bg-muted">
      <Icon
        icon={icon}
        className="w-5 h-5 text-foreground"
      />
      <Text className="flex-1 text-[17px] text-foreground">
        {label}
      </Text>
      {detail && (
        <Text className="text-[15px] text-muted-foreground">
          {detail}
        </Text>
      )}
      <Icon
        icon={ChevronRight}
        className="w-3.5 h-3.5 text-muted-foreground"
      />
    </View>
  );
}

function AppearanceSetting({
  value,
  onValueChange,
}: {
  value: ThemePreference;
  onValueChange: (value: ThemePreference) => void;
}) {
  const options: { value: ThemePreference; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  return (
    <View className="px-5 py-3.5 gap-3">
      <View className="flex-row items-center gap-4">
        <Icon icon={SunMoon} className="w-5 h-5 text-foreground" />
        <Text className="flex-1 text-[17px] text-foreground">Appearance</Text>
      </View>
      <View className="flex-row rounded-[10px] bg-muted p-1 ml-9">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onValueChange(option.value)}
              className={cn(
                "flex-1 min-h-9 rounded-[8px] items-center justify-center px-2",
                selected && "bg-background",
              )}
            >
              <Text
                className={cn(
                  "text-[14px] font-medium text-muted-foreground",
                  selected && "text-foreground",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingsToggleRow({
  icon,
  label,
  value,
  onValueChange,
}: {
  icon: LucideIcon;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center px-5 py-3 gap-4">
      <Icon
        icon={icon}
        className="w-5 h-5 text-foreground"
      />
      <Text className="flex-1 text-[17px] text-foreground">
        {label}
      </Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
