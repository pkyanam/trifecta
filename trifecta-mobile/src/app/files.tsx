import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import { useWsClient } from "@/stores/ws-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

type Entry = { path: string; kind: "file" | "directory"; parentPath?: string };

export default function FilesScreen() {
  const { activeThreadId } = useActiveThread();
  const { getThread, getProject } = useThreadList();
  const { request } = useWsClient();
  const thread = activeThreadId ? getThread(activeThreadId) : undefined;
  const project = thread ? getProject(thread.projectId) : undefined;
  const cwd = thread?.worktreePath ?? project?.workspaceRoot ?? "";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [contents, setContents] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);
  const loadEntries = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const result = (await request("projects.listEntries", { cwd })) as { entries?: Entry[] };
      setEntries(result.entries ?? []);
    } catch (cause) { Alert.alert("Couldn’t load files", messageOf(cause)); }
    finally { setLoading(false); }
  }, [cwd, request]);
  useEffect(() => { const timer = setTimeout(() => void loadEntries(), 0); return () => clearTimeout(timer); }, [loadEntries]);
  const files = useMemo(() => entries.filter((entry) => entry.kind === "file" && entry.path.toLowerCase().includes(query.trim().toLowerCase())), [entries, query]);
  const open = async (path: string) => {
    setLoading(true);
    try {
      const result = (await request("projects.readFile", { cwd, relativePath: path })) as { contents: string; truncated?: boolean };
      setSelected(path); setContents(result.contents); setOriginal(result.contents);
      if (result.truncated) Alert.alert("Large file", "Only the server preview is available; editing is disabled.");
    } catch (cause) { Alert.alert("Couldn’t open file", messageOf(cause)); }
    finally { setLoading(false); }
  };
  const save = async () => {
    if (!selected || contents === original) return;
    setLoading(true);
    try { await request("projects.writeFile", { cwd, relativePath: selected, contents }); setOriginal(contents); }
    catch (cause) { Alert.alert("Couldn’t save file", messageOf(cause)); }
    finally { setLoading(false); }
  };
  if (!cwd) return <View className="flex-1 items-center justify-center bg-background px-8"><Text className="text-center text-muted-foreground">Open a thread to browse its workspace.</Text></View>;
  if (selected) return (
    <View className="flex-1 bg-background pt-safe">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Pressable onPress={() => setSelected(null)} className="rounded-full bg-muted px-3 py-2"><Text className="text-foreground">Files</Text></Pressable>
        <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-foreground">{selected}</Text>
        {loading ? <ActivityIndicator /> : <Pressable disabled={contents === original} onPress={() => void save()} className="rounded-full bg-foreground px-4 py-2 disabled:opacity-30"><Text className="font-semibold text-background">Save</Text></Pressable>}
      </View>
      <TextInput value={contents} onChangeText={setContents} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="flex-1 p-4 font-mono text-xs leading-5 text-foreground" />
    </View>
  );
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 px-4 pt-3">
        <TextInput value={query} onChangeText={setQuery} placeholder="Search workspace" className="flex-1 rounded-full bg-muted px-4 py-3 text-foreground" />
        <Pressable onPress={() => void loadEntries()} className="rounded-full bg-muted px-4 py-3"><Text className="text-foreground">Refresh</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator className="mt-4" /> : null}
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-safe-offset-8">
        {files.map((entry) => <Pressable key={entry.path} onPress={() => void open(entry.path)} className="border-b border-border px-2 py-3 active:bg-muted"><Text className="font-mono text-sm text-foreground" numberOfLines={1}>{entry.path}</Text></Pressable>)}
      </ScrollView>
    </View>
  );
}
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
