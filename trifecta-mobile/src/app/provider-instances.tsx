import { useWsClient } from "@/stores/ws-client";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

type Instance = { driver: string; displayName?: string; accentColor?: string; enabled?: boolean; environment?: { name: string; value: string; sensitive: boolean; valueRedacted?: boolean }[]; config?: unknown };

export default function ProviderInstancesScreen() {
  const { request } = useWsClient();
  const [instances, setInstances] = useState<Record<string, Instance>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const value = await request("server.getSettings", {}) as { providerInstances?: Record<string, Instance> }; setInstances(value.providerInstances ?? {}); }
    catch (cause) { Alert.alert("Couldn’t load providers", messageOf(cause)); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const edit = (instanceId?: string) => {
    const current = instanceId ? instances[instanceId] : null;
    setEditing(instanceId ?? "");
    setId(instanceId ?? "");
    setDraft(JSON.stringify(current ?? { driver: "codex", displayName: "", enabled: true, config: {} }, null, 2));
  };
  const persist = async (next: Record<string, Instance>) => {
    setLoading(true);
    try { const value = await request("server.updateSettings", { patch: { providerInstances: next } }) as { providerInstances?: Record<string, Instance> }; setInstances(value.providerInstances ?? next); setEditing(null); }
    catch (cause) { Alert.alert("Couldn’t save provider", messageOf(cause)); }
    finally { setLoading(false); }
  };
  const save = () => {
    const key = id.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) { Alert.alert("Invalid instance ID", "Use letters, numbers, dashes, or underscores and start with a letter."); return; }
    try {
      const value = JSON.parse(draft) as Instance;
      if (!value.driver || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value.driver)) throw new Error("A valid driver is required.");
      const next = { ...instances };
      if (editing && editing !== key) delete next[editing];
      next[key] = value;
      void persist(next);
    } catch (cause) { Alert.alert("Invalid configuration", messageOf(cause)); }
  };
  return (
    <>
      <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4 pb-safe-offset-8">
        <Text className="mb-4 text-sm text-muted-foreground">Provider instances are server-authoritative. Sensitive values remain redacted when returned by the server.</Text>
        {Object.entries(instances).map(([instanceId, instance]) => <View key={instanceId} className="mb-2 rounded-3xl bg-card p-4 shadow-card"><Text className="font-semibold text-foreground">{instance.displayName || instanceId}</Text><Text className="text-xs text-muted-foreground">{instanceId} · {instance.driver} · {instance.enabled === false ? "disabled" : "enabled"}</Text><View className="mt-3 flex-row gap-2"><Pressable onPress={() => edit(instanceId)} className="rounded-full bg-muted px-3 py-2"><Text className="text-xs text-foreground">Edit</Text></Pressable><Pressable onPress={() => Alert.alert("Remove provider?", instanceId, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => { const next = { ...instances }; delete next[instanceId]; void persist(next); } }])} className="rounded-full bg-muted px-3 py-2"><Text className="text-xs text-red-500">Remove</Text></Pressable></View></View>)}
        <Pressable onPress={() => edit()} className="mt-3 rounded-full bg-foreground px-5 py-3"><Text className="text-center font-semibold text-background">Add provider instance</Text></Pressable>
        {loading ? <ActivityIndicator className="mt-4" /> : null}
      </ScrollView>
      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}><View className="flex-1 bg-background px-5 pt-safe-offset-6"><Text className="text-2xl font-bold text-foreground">Provider instance</Text><TextInput value={id} onChangeText={setId} placeholder="instance-id" autoCapitalize="none" autoCorrect={false} className="mt-5 rounded-2xl bg-muted px-4 py-3 text-foreground" /><TextInput value={draft} onChangeText={setDraft} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="mt-3 min-h-72 rounded-2xl bg-muted p-4 font-mono text-xs leading-5 text-foreground" /><View className="mt-4 flex-row justify-end gap-2"><Pressable onPress={() => setEditing(null)} className="rounded-full px-4 py-3"><Text className="text-foreground">Cancel</Text></Pressable><Pressable onPress={save} className="rounded-full bg-foreground px-5 py-3"><Text className="font-semibold text-background">Save</Text></Pressable></View></View></Modal>
    </>
  );
}
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
