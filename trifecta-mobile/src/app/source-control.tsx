import { useWsClient } from "@/stores/ws-client";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

type DiscoveryItem = { kind: string; label: string; status: "available" | "missing"; version?: unknown; installHint: string; detail?: unknown; implemented?: boolean; auth?: { status?: string; account?: unknown } };
type Discovery = { versionControlSystems?: DiscoveryItem[]; sourceControlProviders?: DiscoveryItem[] };

export default function SourceControlScreen() {
  const { request } = useWsClient();
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [repository, setRepository] = useState("");
  const [destination, setDestination] = useState("");
  const [provider, setProvider] = useState("github");
  const [publishCwd, setPublishCwd] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setDiscovery(await request("server.discoverSourceControl", {}) as Discovery); }
    catch (cause) { Alert.alert("Discovery failed", messageOf(cause)); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const clone = async () => {
    if (!repository.trim() || !destination.trim()) return;
    setLoading(true);
    try {
      const result = await request("sourceControl.cloneRepository", { provider, repository: repository.trim(), destinationPath: destination.trim(), protocol: "auto" }) as { cwd?: string };
      Alert.alert("Repository cloned", result.cwd ?? destination.trim());
    } catch (cause) { Alert.alert("Clone failed", messageOf(cause)); }
    finally { setLoading(false); }
  };
  const publish = async () => {
    if (!repository.trim() || !publishCwd.trim()) return;
    setLoading(true);
    try {
      const result = await request("sourceControl.publishRepository", {
        cwd: publishCwd.trim(),
        provider,
        repository: repository.trim(),
        visibility,
        remoteName: "origin",
        protocol: "auto",
      }) as { remoteUrl?: string; branch?: string };
      Alert.alert("Repository published", result.remoteUrl ?? result.branch ?? repository.trim());
    } catch (cause) { Alert.alert("Publish failed", messageOf(cause)); }
    finally { setLoading(false); }
  };
  const items = [...(discovery?.versionControlSystems ?? []), ...(discovery?.sourceControlProviders ?? [])];
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4 pb-safe-offset-8">
      <View className="rounded-3xl bg-card p-4 shadow-card"><View className="flex-row items-center"><Text className="flex-1 text-base font-semibold text-foreground">Server tools</Text><Pressable onPress={() => void load()} className="rounded-full bg-muted px-3 py-2"><Text className="text-xs text-foreground">Refresh</Text></Pressable></View><View className="mt-3 gap-3">{items.map((item) => <View key={`${item.kind}-${item.label}`} className="flex-row gap-3"><View className={`mt-1.5 h-2.5 w-2.5 rounded-full ${item.status === "available" && item.implemented !== false && (!item.auth || item.auth.status === "authenticated") ? "bg-green-500" : "bg-yellow-500"}`} /><View className="flex-1"><Text className="font-medium text-foreground">{item.label}</Text><Text className="text-xs text-muted-foreground">{item.status === "available" ? item.auth ? item.auth.status : "Available" : item.installHint}</Text></View></View>)}</View></View>
      <View className="mt-4 rounded-3xl bg-card p-4 shadow-card"><Text className="text-base font-semibold text-foreground">Clone repository</Text><TextInput value={repository} onChangeText={setRepository} autoCapitalize="none" autoCorrect={false} placeholder="owner/repository" className="mt-3 rounded-2xl bg-muted px-4 py-3 text-foreground" /><TextInput value={destination} onChangeText={setDestination} autoCapitalize="none" autoCorrect={false} placeholder="/destination/path" className="mt-2 rounded-2xl bg-muted px-4 py-3 font-mono text-sm text-foreground" /><ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">{["github", "gitlab", "azure-devops", "bitbucket"].map((item) => <Pressable key={item} onPress={() => setProvider(item)} className={`mr-2 rounded-full px-3 py-2 ${provider === item ? "bg-foreground" : "bg-muted"}`}><Text className={provider === item ? "text-background" : "text-foreground"}>{item}</Text></Pressable>)}</ScrollView><Pressable disabled={!repository.trim() || !destination.trim()} onPress={() => void clone()} className="mt-4 rounded-full bg-foreground px-5 py-3 disabled:opacity-40"><Text className="text-center font-semibold text-background">Clone</Text></Pressable></View>
      <View className="mt-4 rounded-3xl bg-card p-4 shadow-card"><Text className="text-base font-semibold text-foreground">Publish repository</Text><Text className="mt-1 text-xs text-muted-foreground">Creates the remote repository and pushes the current branch.</Text><TextInput value={publishCwd} onChangeText={setPublishCwd} autoCapitalize="none" autoCorrect={false} placeholder="/existing/repository/path" className="mt-3 rounded-2xl bg-muted px-4 py-3 font-mono text-sm text-foreground" /><View className="mt-3 flex-row gap-2">{(["private", "public"] as const).map((item) => <Pressable key={item} onPress={() => setVisibility(item)} className={`rounded-full px-4 py-2 ${visibility === item ? "bg-foreground" : "bg-muted"}`}><Text className={visibility === item ? "text-background" : "text-foreground"}>{item}</Text></Pressable>)}</View><Pressable disabled={!repository.trim() || !publishCwd.trim()} onPress={() => void publish()} className="mt-4 rounded-full bg-foreground px-5 py-3 disabled:opacity-40"><Text className="text-center font-semibold text-background">Publish</Text></Pressable></View>
      {loading ? <ActivityIndicator className="mt-4" /> : null}
    </ScrollView>
  );
}
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
