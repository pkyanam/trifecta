import { useProjectActions } from "@/hooks/use-thread-actions";
import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import type { ProjectScript } from "@/types/thread";
import { secureRandomId } from "@/utils/secure-id";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

export default function ProjectsScreen() {
  const { projects, threads } = useThreadList();
  const actions = useProjectActions();
  const { activeThreadId } = useActiveThread();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [scriptsProjectId, setScriptsProjectId] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const create = async () => {
    if (!title.trim() || !workspaceRoot.trim()) return;
    try {
      await actions.create({
        projectId: secureRandomId(),
        title: title.trim(),
        workspaceRoot: workspaceRoot.trim(),
        createWorkspaceRootIfMissing: true,
      });
      setAdding(false);
      setTitle("");
      setWorkspaceRoot("");
    } catch (cause) {
      Alert.alert("Couldn’t add project", messageOf(cause));
    }
  };
  const openRename = (project: { id: string; title: string }) => {
    if (Platform.OS === "ios") {
      Alert.prompt("Rename project", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Save", onPress: (value?: string) => value?.trim() && void actions.update(project.id, { title: value.trim() }) },
      ], "plain-text", project.title);
      return;
    }
    setEditingProjectId(project.id);
    setTitle(project.title);
  };
  const openScripts = (project: { id: string; scripts: ProjectScript[] }) => {
    setScriptsProjectId(project.id);
    setScriptDraft(JSON.stringify(project.scripts, null, 2));
  };
  const saveScripts = async () => {
    if (!scriptsProjectId) return;
    try {
      const scripts = JSON.parse(scriptDraft) as ProjectScript[];
      if (!Array.isArray(scripts) || scripts.some((script) =>
        !script.id?.trim() || !script.name?.trim() || !script.command?.trim()
      )) throw new Error("Every script needs an id, name, and command.");
      await actions.update(scriptsProjectId, { scripts });
      setScriptsProjectId(null);
    } catch (cause) {
      Alert.alert("Invalid scripts", messageOf(cause));
    }
  };
  const runScript = (projectId: string, script: ProjectScript) => {
    const thread = threads.find((item) => item.id === activeThreadId);
    if (!thread || thread.projectId !== projectId) {
      Alert.alert("Open a project thread first", "Scripts run in the active thread’s terminal and workspace.");
      return;
    }
    router.push({ pathname: "/terminal", params: { command: script.command } });
  };
  return (
    <>
      <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4 pb-safe-offset-8">
        <Pressable onPress={() => setAdding(true)} className="mb-4 rounded-full bg-foreground px-5 py-3 active:opacity-70">
          <Text className="text-center font-semibold text-background">Add project</Text>
        </Pressable>
        <View className="gap-2">
          {projects.map((project) => {
            const threadCount = threads.filter((thread) => thread.projectId === project.id).length;
            return (
              <View key={project.id} className="rounded-3xl bg-card p-4 shadow-card">
                <Text className="text-base font-semibold text-foreground">{project.title}</Text>
                <Text selectable className="mt-1 text-xs text-muted-foreground">{project.workspaceRoot}</Text>
                <Text className="mt-2 text-xs text-muted-foreground">{threadCount} thread{threadCount === 1 ? "" : "s"}</Text>
                {project.scripts.length ? <View className="mt-3 gap-2">{project.scripts.map((script) => <View key={script.id} className="flex-row items-center rounded-2xl bg-muted px-3 py-2"><View className="flex-1"><Text className="text-sm font-medium text-foreground">{script.name}</Text><Text numberOfLines={1} className="font-mono text-xs text-muted-foreground">{script.command}</Text></View><Pressable onPress={() => runScript(project.id, script)} className="rounded-full bg-foreground px-3 py-2"><Text className="text-xs font-semibold text-background">Run</Text></Pressable></View>)}</View> : null}
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={() => openRename(project)}
                    className="rounded-full bg-muted px-3 py-2"
                  ><Text className="text-xs text-foreground">Rename</Text></Pressable>
                  <Pressable onPress={() => openScripts(project)} className="rounded-full bg-muted px-3 py-2"><Text className="text-xs text-foreground">Scripts</Text></Pressable>
                  <Pressable
                    onPress={() => Alert.alert("Remove project?", threadCount ? "Its threads must be removed first unless you force deletion." : "The workspace files will not be deleted.", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void actions.remove(project.id, threadCount > 0) }])}
                    className="rounded-full bg-muted px-3 py-2"
                  ><Text className="text-xs text-red-500">Remove</Text></Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <Modal visible={adding} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAdding(false)}>
        <View className="flex-1 bg-background px-5 pt-safe-offset-6">
          <Text className="text-2xl font-bold text-foreground">Add project</Text>
          <Text className="mt-1 text-sm text-muted-foreground">Register a workspace directory on the connected server.</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Project name" className="mt-6 rounded-2xl bg-muted px-4 py-4 text-base text-foreground" />
          <TextInput value={workspaceRoot} onChangeText={setWorkspaceRoot} placeholder="/absolute/path/to/project" autoCapitalize="none" autoCorrect={false} className="mt-3 rounded-2xl bg-muted px-4 py-4 font-mono text-sm text-foreground" />
          <Pressable disabled={!title.trim() || !workspaceRoot.trim()} onPress={() => void create()} className="mt-5 rounded-full bg-foreground px-5 py-4 active:opacity-70 disabled:opacity-40"><Text className="text-center font-semibold text-background">Create project</Text></Pressable>
          <Pressable onPress={() => setAdding(false)} className="mt-3 rounded-full px-5 py-4"><Text className="text-center text-foreground">Cancel</Text></Pressable>
        </View>
      </Modal>
      <Modal visible={editingProjectId !== null} transparent animationType="fade" onRequestClose={() => setEditingProjectId(null)}>
        <View className="flex-1 justify-center bg-black/50 px-6">
          <View className="rounded-[28px] bg-background p-5">
            <Text className="text-xl font-semibold text-foreground">Rename project</Text>
            <TextInput value={title} onChangeText={setTitle} autoFocus className="mt-4 rounded-2xl bg-muted px-4 py-3 text-base text-foreground" />
            <View className="mt-4 flex-row justify-end gap-2">
              <Pressable onPress={() => setEditingProjectId(null)} className="rounded-full px-4 py-3"><Text className="text-foreground">Cancel</Text></Pressable>
              <Pressable onPress={() => { const id = editingProjectId; const next = title.trim(); if (id && next) void actions.update(id, { title: next }); setEditingProjectId(null); }} className="rounded-full bg-foreground px-5 py-3"><Text className="font-semibold text-background">Save</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={scriptsProjectId !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setScriptsProjectId(null)}>
        <View className="flex-1 bg-background px-5 pt-safe-offset-6"><Text className="text-2xl font-bold text-foreground">Project scripts</Text><Text className="mt-1 text-sm text-muted-foreground">Commands are executed in the active thread’s workspace terminal. Edit the server-backed script list as JSON.</Text><TextInput value={scriptDraft} onChangeText={setScriptDraft} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="mt-5 min-h-80 rounded-2xl bg-muted p-4 font-mono text-xs leading-5 text-foreground" /><Pressable onPress={() => void saveScripts()} className="mt-5 rounded-full bg-foreground px-5 py-4"><Text className="text-center font-semibold text-background">Save scripts</Text></Pressable><Pressable onPress={() => setScriptsProjectId(null)} className="mt-2 rounded-full px-5 py-4"><Text className="text-center text-foreground">Cancel</Text></Pressable></View>
      </Modal>
    </>
  );
}
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
