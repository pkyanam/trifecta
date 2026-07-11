import { useWsClient } from "@/stores/ws-client";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

export default function DiagnosticsScreen() {
  const { request, status, serverConfig, reconnect } = useWsClient();
  const [trace, setTrace] = useState<unknown>(null);
  const [processes, setProcesses] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTrace, nextProcesses] = await Promise.all([
        request("server.getTraceDiagnostics", {}).catch((cause) => ({ error: messageOf(cause) })),
        request("server.getProcessDiagnostics", {}).catch((cause) => ({ error: messageOf(cause) })),
      ]);
      setTrace(nextTrace); setProcesses(nextProcesses);
    } finally { setLoading(false); }
  }, [request]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4 pb-safe-offset-8">
      <View className="rounded-3xl bg-card p-4 shadow-card"><Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connection</Text><Text className="mt-2 text-base font-semibold text-foreground">{status}</Text><Text selectable className="mt-1 text-xs text-muted-foreground">{serverConfig?.cwd ?? "No server configuration"}</Text><View className="mt-3 flex-row gap-2"><Pressable onPress={reconnect} className="rounded-full bg-muted px-4 py-2"><Text className="text-foreground">Reconnect</Text></Pressable><Pressable onPress={() => void load()} className="rounded-full bg-foreground px-4 py-2"><Text className="font-semibold text-background">Refresh</Text></Pressable></View></View>
      {loading ? <ActivityIndicator className="mt-4" /> : null}
      <DiagnosticCard title="Processes" value={processes} />
      <DiagnosticCard title="Traces" value={trace} />
    </ScrollView>
  );
}
function DiagnosticCard({ title, value }: { title: string; value: unknown }) { return <View className="mt-3 rounded-3xl bg-card p-4 shadow-card"><Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Text><Text selectable className="mt-2 font-mono text-xs leading-5 text-foreground">{value === null ? "Unavailable" : JSON.stringify(value, null, 2)}</Text></View>; }
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Unavailable"; }
