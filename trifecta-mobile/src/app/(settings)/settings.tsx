import { Icon } from "@/components/icon";
import { useConnection } from "@/stores/connection";
import { usePreferences, type ThemePreference } from "@/stores/preferences";
import { cn } from "@/utils/tailwind";
import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  ChevronRight,
  LogOut,
  SunMoon,
  TrendingUp,
  Vibrate,
  WifiOff,
} from "lucide-react-native";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";

export default function SettingsScreen() {
  const { serverURL, isPaired, unpair } = useConnection();
  const { themePreference, setThemePreference, hapticsEnabled, setHapticsEnabled } = usePreferences();
  const router = useRouter();

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect server",
      "This will remove your session token. You will need to pair again to reconnect.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await unpair();
            router.replace("/pair");
          },
        },
      ],
    );
  };

  const serverHost = (() => {
    if (!serverURL) return null;
    try { return new URL(serverURL).hostname; } catch { return serverURL; }
  })();

  return (
    <ScrollView
      className="flex-1 bg-background text-foreground"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="android:pb-safe"
    >
      {/* Server connection */}
      {isPaired && serverHost ? (
        <View className="mx-5 mt-4 mb-5 bg-muted rounded-xl px-4 py-3 border-continuous">
          <Text className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Connected server
          </Text>
          <Text selectable className="text-[15px] text-foreground">
            {serverHost}
          </Text>
        </View>
      ) : (
        <View className="mx-5 mt-4 mb-5 bg-muted rounded-xl px-4 py-3 border-continuous">
          <Text className="text-[15px] text-muted-foreground">Not connected</Text>
        </View>
      )}

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

      <SectionDivider />

      {/* Disconnect server */}
      {isPaired && (
        <Pressable onPress={handleDisconnect} className="flex-row items-center px-5 py-3.5 gap-4 active:bg-muted">
          <Icon icon={WifiOff} className="w-5 h-5 text-sf-red" />
          <Text className="text-[17px] text-sf-red">Disconnect server</Text>
        </Pressable>
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
