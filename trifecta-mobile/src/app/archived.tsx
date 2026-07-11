import { useThreadActions } from "@/hooks/use-thread-actions";
import { useActiveThread } from "@/stores/active-thread";
import { useWsClient } from "@/stores/ws-client";
import type { ThreadShell } from "@/types/thread";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

export default function ArchivedScreen() {
  const { request } = useWsClient();
  const [threads, setThreads] = useState<ThreadShell[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    void request("orchestration.getArchivedShellSnapshot", {})
      .then((value) => setThreads(((value as { threads?: ThreadShell[] }).threads ?? []).filter((item) => item.archivedAt)))
      .catch((cause) => Alert.alert("Couldn’t load archive", cause instanceof Error ? cause.message : "Please try again."))
      .finally(() => setLoading(false));
  }, [request]);
  useFocusEffect(load);
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4 pb-safe-offset-8">
      {loading ? <ActivityIndicator className="mt-8" /> : null}
      {!loading && threads.length === 0 ? <Text className="mt-12 text-center text-muted-foreground">No archived threads</Text> : null}
      <View className="gap-2">{threads.map((thread) => <ArchivedRow key={thread.id} thread={thread} onChange={load} />)}</View>
    </ScrollView>
  );
}
function ArchivedRow({ thread, onChange }: { thread: ThreadShell; onChange: () => void }) {
  const actions = useThreadActions(thread.id);
  const { setActiveThreadId } = useActiveThread();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => { setActiveThreadId(thread.id); router.replace("/"); }}
      className="rounded-2xl bg-card px-4 py-3 active:bg-muted"
    >
      <Text className="font-medium text-foreground" numberOfLines={1}>{thread.title}</Text>
      <View className="mt-2 flex-row gap-2">
        <Pressable onPress={() => void actions.unarchive().then(onChange)} className="rounded-full bg-muted px-3 py-2"><Text className="text-xs text-foreground">Unarchive</Text></Pressable>
        <Pressable onPress={() => Alert.alert("Delete thread?", "This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void actions.remove().then(onChange) }])} className="rounded-full bg-muted px-3 py-2"><Text className="text-xs text-red-500">Delete</Text></Pressable>
      </View>
    </Pressable>
  );
}
