import { useThreadActions } from "@/hooks/use-thread-actions";
import { useThread } from "@/hooks/use-thread";
import { useActiveThread } from "@/stores/active-thread";
import type { InteractionMode, RuntimeMode } from "@/types/thread";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

const RUNTIME_MODES: { value: RuntimeMode; title: string; detail: string }[] = [
  { value: "approval-required", title: "Ask first", detail: "Review commands and edits before they run." },
  { value: "auto-accept-edits", title: "Auto-edit", detail: "Allow edits while keeping command safeguards." },
  { value: "full-access", title: "Full access", detail: "Allow the agent to work without routine prompts." },
];

export default function ThreadDetailsScreen() {
  const { activeThreadId, clearThreadState } = useActiveThread();
  const thread = useThread(activeThreadId);
  const actions = useThreadActions(activeThreadId);
  const router = useRouter();
  const [titles, setTitles] = useState<Record<string, string>>({});
  const detail = thread.detail;
  if (!detail) {
    return <View className="flex-1 bg-background" />;
  }
  const title = titles[detail.id] ?? detail.title;
  const setMode = (mode: RuntimeMode) =>
    actions.setRuntimeMode(mode).catch((cause) => Alert.alert("Couldn’t change access", messageOf(cause)));
  const setInteraction = (mode: InteractionMode) =>
    actions.setInteractionMode(mode).catch((cause) => Alert.alert("Couldn’t change mode", messageOf(cause)));
  const remove = () => {
    Alert.alert("Delete thread?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void actions.remove().then(() => {
            clearThreadState();
            router.replace("/default-view");
          });
        },
      },
    ]);
  };
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 pb-safe-offset-8"
    >
      <Section title="Title">
        <View className="flex-row gap-2">
          <TextInput
            value={title}
            onChangeText={(value) => setTitles((current) => ({ ...current, [detail.id]: value }))}
            className="flex-1 rounded-2xl bg-muted px-4 py-3 text-base text-foreground"
          />
          <Pill
            label="Save"
            primary
            onPress={() => {
              const next = title.trim();
              if (next && next !== detail.title) void actions.rename(next);
            }}
          />
        </View>
      </Section>
      <Section title="Agent mode">
        <Choice
          title="Default"
          detail="The agent can implement changes."
          selected={detail.interactionMode === "default"}
          onPress={() => void setInteraction("default")}
        />
        <Choice
          title="Plan"
          detail="The agent researches and proposes a plan before implementation."
          selected={detail.interactionMode === "plan"}
          onPress={() => void setInteraction("plan")}
        />
      </Section>
      <Section title="Access">
        {RUNTIME_MODES.map((mode) => (
          <Choice
            key={mode.value}
            title={mode.title}
            detail={mode.detail}
            selected={detail.runtimeMode === mode.value}
            onPress={() => void setMode(mode.value)}
          />
        ))}
      </Section>
      <Section title="Workspace">
        <Info label="Branch" value={detail.branch ?? "Default branch"} />
        <Info label="Worktree" value={detail.worktreePath ?? "Project root"} />
      </Section>
      <Section title="Thread actions">
        {detail.session && !["idle", "stopped", "error"].includes(detail.session.status) ? (
          <Action label="Stop provider session" onPress={() => void actions.stopSession()} />
        ) : null}
        <Action
          label={detail.archivedAt ? "Unarchive thread" : "Archive thread"}
          onPress={() => void (detail.archivedAt ? actions.unarchive() : actions.archive())}
        />
        <Action label="Delete thread" destructive onPress={remove} />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-6 gap-2">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Text>
      <View className="overflow-hidden rounded-3xl bg-card">{children}</View>
    </View>
  );
}
function Choice({ title, detail, selected, onPress }: { title: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <View className={`h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-foreground bg-foreground" : "border-border"}`}>
        {selected ? <Text className="text-xs text-background">✓</Text> : null}
      </View>
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
      </View>
    </Pressable>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return <View className="border-b border-border px-4 py-3"><Text className="text-xs text-muted-foreground">{label}</Text><Text selectable className="mt-1 text-sm text-foreground">{value}</Text></View>;
}
function Action({ label, onPress, destructive = false }: { label: string; onPress: () => void; destructive?: boolean }) {
  return <Pressable onPress={onPress} className="border-b border-border px-4 py-4 active:bg-muted"><Text className={destructive ? "text-base text-red-500" : "text-base text-foreground"}>{label}</Text></Pressable>;
}
function Pill({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable onPress={onPress} className={`justify-center rounded-full px-5 active:opacity-60 ${primary ? "bg-foreground" : "bg-muted"}`}><Text className={primary ? "font-semibold text-background" : "text-foreground"}>{label}</Text></Pressable>;
}
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
