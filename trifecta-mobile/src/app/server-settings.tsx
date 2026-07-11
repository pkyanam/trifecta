import { useWsClient } from "@/stores/ws-client";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

type Settings = {
  enableAssistantStreaming?: boolean;
  defaultThreadEnvMode?: "local" | "worktree";
  addProjectBaseDirectory?: string;
  automaticGitFetchInterval?: number;
};

export default function ServerSettingsScreen() {
  const { request, serverConfig } = useWsClient();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    void request("server.getSettings", {}).then((value) => setSettings(value as Settings)).catch((cause) => Alert.alert("Couldn’t load settings", messageOf(cause)));
  }, [request]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const patch = async (next: Partial<Settings>) => {
    setSaving(true);
    try {
      const value = await request("server.updateSettings", { patch: next });
      setSettings(value as Settings);
    } catch (cause) { Alert.alert("Couldn’t save settings", messageOf(cause)); }
    finally { setSaving(false); }
  };
  if (!settings) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator /></View>;
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4 pb-safe-offset-8">
      <Card title="General">
        <Toggle label="Stream assistant responses" value={settings.enableAssistantStreaming === true} onChange={(value) => void patch({ enableAssistantStreaming: value })} />
        <Toggle label="New threads use worktrees" value={settings.defaultThreadEnvMode === "worktree"} onChange={(value) => void patch({ defaultThreadEnvMode: value ? "worktree" : "local" })} />
        <Text className="mt-3 text-xs text-muted-foreground">Default project directory</Text>
        <TextInput
          defaultValue={settings.addProjectBaseDirectory ?? ""}
          onEndEditing={(event) => void patch({ addProjectBaseDirectory: event.nativeEvent.text.trim() })}
          placeholder="~/Code"
          autoCapitalize="none"
          className="mt-2 rounded-2xl bg-muted px-4 py-3 font-mono text-sm text-foreground"
        />
      </Card>
      <Text className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Providers</Text>
      <Pressable onPress={() => router.navigate("/provider-instances")} className="mb-3 rounded-full bg-foreground px-5 py-3 active:opacity-70"><Text className="text-center font-semibold text-background">Manage provider instances</Text></Pressable>
      <View className="gap-2">
        {(serverConfig?.providers ?? []).map((provider) => (
          <View key={provider.instanceId} className="rounded-3xl bg-card p-4 shadow-card">
            <View className="flex-row items-center gap-3">
              <View className={`h-2.5 w-2.5 rounded-full ${provider.status === "ready" ? "bg-green-500" : provider.status === "error" ? "bg-red-500" : "bg-yellow-500"}`} />
              <View className="flex-1">
                <Text className="font-semibold text-foreground">{provider.displayName ?? provider.label ?? provider.instanceId}</Text>
                <Text className="text-xs text-muted-foreground">{provider.driver} · {provider.models.length} models · {provider.status ?? "unknown"}</Text>
              </View>
              <Pressable
                onPress={() => { setSaving(true); void request("server.refreshProviders", { instanceId: provider.instanceId }).catch((cause) => Alert.alert("Refresh failed", messageOf(cause))).finally(() => setSaving(false)); }}
                className="rounded-full bg-muted px-3 py-2 active:opacity-60"
              ><Text className="text-xs text-foreground">Refresh</Text></Pressable>
            </View>
            {typeof provider.message === "string" ? <Text className="mt-2 text-xs text-muted-foreground">{provider.message}</Text> : null}
            {provider.rateLimits ? <Text selectable className="mt-2 font-mono text-xs text-muted-foreground">{JSON.stringify(provider.rateLimits, null, 2)}</Text> : null}
          </View>
        ))}
      </View>
      {saving ? <ActivityIndicator className="mt-4" /> : null}
    </ScrollView>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <View><Text className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Text><View className="rounded-3xl bg-card p-4 shadow-card">{children}</View></View>; }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <View className="flex-row items-center border-b border-border py-3"><Text className="flex-1 text-base text-foreground">{label}</Text><Switch value={value} onValueChange={onChange} /></View>; }
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
