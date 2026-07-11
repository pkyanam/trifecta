import { useWsClient } from "@/stores/ws-client";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

type McpServer = { name: string; enabled: boolean; transport: "stdio" | "http"; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> };

export default function McpSettingsScreen() {
  const { request } = useWsClient();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    void request("server.getSettings", {}).then((value) => setServers(((value as { mcpServers?: McpServer[] }).mcpServers ?? []))).catch((cause) => Alert.alert("Couldn’t load MCP servers", messageOf(cause))).finally(() => setLoading(false));
  }, [request]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const persist = async (next: McpServer[]) => {
    setLoading(true);
    try { const value = await request("server.updateSettings", { patch: { mcpServers: next } }); setServers(((value as { mcpServers?: McpServer[] }).mcpServers ?? [])); }
    catch (cause) { Alert.alert("Couldn’t save MCP servers", messageOf(cause)); }
    finally { setLoading(false); }
  };
  const add = () => {
    try {
      const parsed = JSON.parse(draft) as McpServer;
      if (!parsed.name || !["stdio", "http"].includes(parsed.transport)) throw new Error("A name and valid transport are required.");
      void persist([...servers.filter((item) => item.name !== parsed.name), { ...parsed, enabled: parsed.enabled !== false }]);
      setAdding(false); setDraft("");
    } catch (cause) { Alert.alert("Invalid configuration", messageOf(cause)); }
  };
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4 pb-safe-offset-8">
      <Text className="mb-4 text-sm text-muted-foreground">These servers are synced into supported agent configurations by Trifecta Server.</Text>
      {servers.map((server) => (
        <View key={server.name} className="mb-2 rounded-3xl bg-card p-4 shadow-card">
          <View className="flex-row items-center gap-3"><View className="flex-1"><Text className="font-semibold text-foreground">{server.name}</Text><Text className="text-xs text-muted-foreground">{server.transport === "stdio" ? server.command : server.url}</Text></View><Switch value={server.enabled} onValueChange={(enabled) => void persist(servers.map((item) => item.name === server.name ? { ...item, enabled } : item))} /></View>
          <Pressable onPress={() => Alert.alert("Remove MCP server?", server.name, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void persist(servers.filter((item) => item.name !== server.name)) }])} className="mt-3 self-start rounded-full bg-muted px-3 py-2"><Text className="text-xs text-red-500">Remove</Text></Pressable>
        </View>
      ))}
      {adding ? <View className="mt-3 rounded-3xl bg-card p-4"><Text className="text-sm font-semibold text-foreground">MCP configuration</Text><Text className="mt-1 text-xs text-muted-foreground">Enter one stdio or HTTP server as JSON.</Text><TextInput value={draft} onChangeText={setDraft} multiline autoCapitalize="none" autoCorrect={false} placeholder={'{"name":"github","transport":"stdio","command":"npx","args":["server"]}'} className="mt-3 min-h-40 rounded-2xl bg-muted p-3 font-mono text-xs text-foreground" textAlignVertical="top" /><View className="mt-3 flex-row gap-2"><Pressable onPress={() => setAdding(false)} className="rounded-full bg-muted px-4 py-2"><Text className="text-foreground">Cancel</Text></Pressable><Pressable onPress={add} className="rounded-full bg-foreground px-4 py-2"><Text className="font-semibold text-background">Save</Text></Pressable></View></View> : <Pressable onPress={() => setAdding(true)} className="mt-3 rounded-full bg-foreground px-5 py-3"><Text className="text-center font-semibold text-background">Add MCP server</Text></Pressable>}
      {loading ? <ActivityIndicator className="mt-4" /> : null}
    </ScrollView>
  );
}
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
