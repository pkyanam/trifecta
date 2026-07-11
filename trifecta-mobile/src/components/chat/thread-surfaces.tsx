import { ChatMarkdown } from "@/components/markdown";
import { TouchableGlass } from "@/components/touchable-glass";
import { useThreadActions } from "@/hooks/use-thread-actions";
import { useActiveThread } from "@/stores/active-thread";
import { useWsClient } from "@/stores/ws-client";
import type { ThreadDetail, UserInputQuestion } from "@/types/thread";
import {
  deriveActivePlan,
  derivePendingApprovals,
  derivePendingUserInputs,
  visibleWorkActivities,
} from "@/utils/thread-activity";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export function ThreadActionBanner({ detail }: { detail: ThreadDetail | null }) {
  const actions = useThreadActions(detail?.id ?? null);
  const approvals = useMemo(
    () => derivePendingApprovals(detail?.activities ?? []),
    [detail?.activities],
  );
  const questions = useMemo(
    () => derivePendingUserInputs(detail?.activities ?? []),
    [detail?.activities],
  );
  const [busy, setBusy] = useState(false);
  const approval = approvals[0];
  const userInput = questions[0];

  if (approval) {
    const respond = async (
      decision: "accept" | "acceptForSession" | "decline",
    ) => {
      setBusy(true);
      try {
        await actions.respondToApproval(approval.requestId, decision);
      } catch (cause) {
        Alert.alert("Response failed", messageOf(cause));
      } finally {
        setBusy(false);
      }
    };
    return (
      <View className="mx-3 mb-2 rounded-3xl border border-border bg-card p-4 shadow-float">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Approval required · {approval.requestKind.replace("-", " ")}
        </Text>
        <Text className="mt-1 text-sm text-foreground" numberOfLines={4}>
          {approval.detail ?? "The agent needs permission to continue."}
        </Text>
        <View className="mt-3 flex-row gap-2">
          <BannerButton label="Deny" onPress={() => void respond("decline")} />
          <BannerButton label="Allow" onPress={() => void respond("accept")} primary />
          <BannerButton
            label="Always"
            onPress={() => void respond("acceptForSession")}
            primary
          />
          {busy ? <ActivityIndicator /> : null}
        </View>
      </View>
    );
  }
  if (userInput) {
    return (
      <UserInputBanner
        requestId={userInput.requestId}
        questions={userInput.questions}
        onSubmit={actions.respondToUserInput}
      />
    );
  }
  return null;
}

function UserInputBanner({
  requestId,
  questions,
  onSubmit,
}: {
  requestId: string;
  questions: UserInputQuestion[];
  onSubmit: (requestId: string, answers: Record<string, unknown>) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const question = questions[index];
  if (!question) return null;
  const selected = answers[question.id] ?? [];
  const toggle = (label: string) => {
    setAnswers((current) => ({
      ...current,
      [question.id]: question.multiSelect
        ? selected.includes(label)
          ? selected.filter((value) => value !== label)
          : [...selected, label]
        : [label],
    }));
  };
  const advance = async () => {
    const value = custom.trim() ? [...selected, custom.trim()] : selected;
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    setCustom("");
    if (index < questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(
        requestId,
        Object.fromEntries(
          Object.entries(next).map(([id, answer]) => [
            id,
            answer.length === 1 ? answer[0] : answer,
          ]),
        ),
      );
    } catch (cause) {
      Alert.alert("Response failed", messageOf(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="mx-3 mb-2 rounded-3xl border border-border bg-card p-4 shadow-float">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {question.header} · {index + 1}/{questions.length}
      </Text>
      <Text className="mt-1 text-sm font-medium text-foreground">
        {question.question}
      </Text>
      <View className="mt-3 gap-2">
        {question.options.map((option) => {
          const isSelected = selected.includes(option.label);
          return (
            <Pressable
              key={option.label}
              onPress={() => toggle(option.label)}
              className={`rounded-2xl border px-3 py-2 active:opacity-70 ${
                isSelected ? "border-foreground bg-accent" : "border-border bg-muted"
              }`}
            >
              <Text className="text-sm font-medium text-foreground">{option.label}</Text>
              <Text className="text-xs text-muted-foreground">{option.description}</Text>
            </Pressable>
          );
        })}
        <TextInput
          value={custom}
          onChangeText={setCustom}
          placeholder="Or type another answer"
          className="rounded-2xl bg-muted px-3 py-3 text-sm text-foreground"
        />
      </View>
      <View className="mt-3 flex-row justify-end gap-2">
        {index > 0 ? (
          <BannerButton label="Back" onPress={() => setIndex(index - 1)} />
        ) : null}
        <BannerButton
          label={index === questions.length - 1 ? "Submit" : "Next"}
          onPress={() => void advance()}
          primary
          disabled={busy || (selected.length === 0 && !custom.trim())}
        />
      </View>
    </View>
  );
}

function BannerButton({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`rounded-full px-4 py-2 active:opacity-60 ${
        primary ? "bg-foreground" : "bg-muted"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={primary ? "text-background" : "text-foreground"}>{label}</Text>
    </Pressable>
  );
}

export function ThreadTimelineExtras({ detail }: { detail: ThreadDetail | null }) {
  const { request } = useWsClient();
  const { dispatchTurnStart } = useActiveThread();
  const actions = useThreadActions(detail?.id ?? null);
  const [showActivity, setShowActivity] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const plan = useMemo(
    () => deriveActivePlan(detail?.activities ?? [], detail?.latestTurn?.turnId),
    [detail?.activities, detail?.latestTurn?.turnId],
  );
  const work = useMemo(
    () => visibleWorkActivities(detail?.activities ?? [], detail?.latestTurn?.turnId),
    [detail?.activities, detail?.latestTurn?.turnId],
  );
  const latestProposedPlan = detail?.proposedPlans.at(-1);
  const latestCheckpoint = detail?.checkpoints.at(-1);

  const implementPlan = async () => {
    if (!detail || !latestProposedPlan || latestProposedPlan.implementedAt) return;
    setImplementing(true);
    try {
      await dispatchTurnStart(
        detail.id,
        `PLEASE IMPLEMENT THIS PLAN:\n${latestProposedPlan.planMarkdown.trim()}`,
        detail.modelSelection,
        detail.runtimeMode,
        "default",
        [],
        { threadId: detail.id, planId: latestProposedPlan.id },
      );
    } catch (cause) {
      Alert.alert("Couldn’t start implementation", messageOf(cause));
    } finally {
      setImplementing(false);
    }
  };

  const openDiff = async () => {
    if (!detail || !latestCheckpoint) return;
    setLoadingDiff(true);
    try {
      const result = (await request("orchestration.getFullThreadDiff", {
        threadId: detail.id,
        toTurnCount: latestCheckpoint.checkpointTurnCount,
      })) as { diff?: string };
      setDiff(result.diff ?? "No changes");
    } catch (cause) {
      Alert.alert("Couldn’t load diff", messageOf(cause));
    } finally {
      setLoadingDiff(false);
    }
  };

  if (!plan && !latestProposedPlan && work.length === 0 && !latestCheckpoint) return null;
  return (
    <View className="gap-3 px-4 py-4">
      {plan ? (
        <View className="rounded-3xl bg-card p-4 shadow-card">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plan
          </Text>
          {plan.explanation ? (
            <Text className="mt-1 text-sm text-muted-foreground">{plan.explanation}</Text>
          ) : null}
          <View className="mt-2 gap-2">
            {plan.steps.map((step, index) => (
              <View key={`${step.step}-${index}`} className="flex-row gap-2">
                <Text className="text-sm text-muted-foreground">
                  {step.status === "completed" ? "✓" : step.status === "inProgress" ? "◉" : "○"}
                </Text>
                <Text className="flex-1 text-sm text-foreground">{step.step}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {latestProposedPlan ? (
        <View className="rounded-3xl bg-card p-4 shadow-card">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proposed plan
          </Text>
          <ChatMarkdown>{latestProposedPlan.planMarkdown}</ChatMarkdown>
          {!latestProposedPlan.implementedAt ? (
            <View className="mt-3 flex-row justify-end">
              <BannerButton
                label={implementing ? "Starting…" : "Implement plan"}
                onPress={() => void implementPlan()}
                primary
                disabled={implementing || detail?.latestTurn?.state === "running"}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {work.length > 0 ? (
        <TouchableGlass
          onPress={() => setShowActivity((value) => !value)}
          className="rounded-3xl p-4 active:opacity-70"
        >
          <Text className="text-sm font-semibold text-foreground">
            {showActivity ? "Hide" : "Show"} agent activity ({work.length})
          </Text>
          {showActivity ? (
            <View className="mt-3 gap-3">
              {work.map((activity) => (
                <View key={activity.id} className="border-l-2 border-border pl-3">
                  <Text className="text-sm text-foreground">{activity.summary}</Text>
                  {activity.tone === "error" ? (
                    <Text className="text-xs text-red-500">Action failed</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </TouchableGlass>
      ) : null}
      {latestCheckpoint ? (
        <View className="flex-row items-center gap-2 rounded-3xl bg-card p-3 shadow-card">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">
              {latestCheckpoint.files.length} changed file{latestCheckpoint.files.length === 1 ? "" : "s"}
            </Text>
            <Text className="text-xs text-muted-foreground">
              +{latestCheckpoint.files.reduce((sum, file) => sum + file.additions, 0)} · -
              {latestCheckpoint.files.reduce((sum, file) => sum + file.deletions, 0)}
            </Text>
          </View>
          <BannerButton label="Diff" onPress={() => void openDiff()} />
          <BannerButton
            label="Revert"
            onPress={() =>
              Alert.alert("Revert checkpoint?", "Later conversation and file changes will be removed.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Revert",
                  style: "destructive",
                  onPress: () => void actions.revertCheckpoint(latestCheckpoint.checkpointTurnCount),
                },
              ])
            }
          />
          {loadingDiff ? <ActivityIndicator /> : null}
        </View>
      ) : null}
      <Modal visible={diff !== null} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-background pt-safe">
          <View className="flex-row items-center border-b border-border px-4 py-3">
            <Text className="flex-1 text-lg font-semibold text-foreground">Thread diff</Text>
            <Pressable onPress={() => setDiff(null)} className="rounded-full bg-muted px-4 py-2">
              <Text className="text-foreground">Done</Text>
            </Pressable>
          </View>
          <ScrollView className="flex-1" contentContainerClassName="p-4">
            <Text selectable className="font-mono text-xs leading-5 text-foreground">{diff}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Please try again.";
}
