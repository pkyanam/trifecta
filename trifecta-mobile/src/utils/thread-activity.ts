import type {
  ActivePlan,
  PendingApproval,
  PendingUserInput,
  ThreadActivity,
  UserInputQuestion,
} from "@/types/thread";

function payloadOf(activity: ThreadActivity): Record<string, unknown> | null {
  return activity.payload && typeof activity.payload === "object"
    ? (activity.payload as Record<string, unknown>)
    : null;
}

function ordered(activities: readonly ThreadActivity[]): ThreadActivity[] {
  return [...activities].sort(
    (a, b) =>
      (a.sequence ?? Number.MAX_SAFE_INTEGER) -
        (b.sequence ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

function requestKind(value: unknown): PendingApproval["requestKind"] | null {
  switch (value) {
    case "command":
    case "command_execution_approval":
    case "exec_command_approval":
    case "dynamic_tool_call":
      return "command";
    case "file-read":
    case "file_read_approval":
      return "file-read";
    case "file-change":
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    default:
      return null;
  }
}

export function derivePendingApprovals(
  activities: readonly ThreadActivity[],
): PendingApproval[] {
  const pending = new Map<string, PendingApproval>();
  for (const activity of ordered(activities)) {
    const payload = payloadOf(activity);
    const requestId =
      typeof payload?.requestId === "string" ? payload.requestId : null;
    if (!requestId) continue;
    if (activity.kind === "approval.requested" && payload) {
      const kind = requestKind(payload.requestKind ?? payload.requestType);
      if (!kind) continue;
      const detail =
        typeof payload.detail === "string" ? payload.detail : undefined;
      pending.set(requestId, {
        requestId,
        requestKind: kind,
        createdAt: activity.createdAt,
        ...(detail ? { detail } : {}),
      });
    } else if (
      activity.kind === "approval.resolved" ||
      activity.kind === "provider.approval.respond.failed"
    ) {
      pending.delete(requestId);
    }
  }
  return [...pending.values()];
}

function parseQuestions(value: unknown): UserInputQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.header !== "string" ||
      typeof record.question !== "string" ||
      !Array.isArray(record.options)
    ) {
      return [];
    }
    const options = record.options.flatMap((option) => {
      if (!option || typeof option !== "object") return [];
      const candidate = option as Record<string, unknown>;
      return typeof candidate.label === "string" &&
        typeof candidate.description === "string"
        ? [{ label: candidate.label, description: candidate.description }]
        : [];
    });
    if (options.length === 0) return [];
    return [
      {
        id: record.id,
        header: record.header,
        question: record.question,
        options,
        multiSelect: record.multiSelect === true,
      },
    ];
  });
}

export function derivePendingUserInputs(
  activities: readonly ThreadActivity[],
): PendingUserInput[] {
  const pending = new Map<string, PendingUserInput>();
  for (const activity of ordered(activities)) {
    const payload = payloadOf(activity);
    const requestId =
      typeof payload?.requestId === "string" ? payload.requestId : null;
    if (!requestId) continue;
    if (activity.kind === "user-input.requested" && payload) {
      const questions = parseQuestions(payload.questions);
      if (questions.length > 0) {
        pending.set(requestId, {
          requestId,
          questions,
          createdAt: activity.createdAt,
        });
      }
    } else if (
      activity.kind === "user-input.resolved" ||
      activity.kind === "provider.user-input.respond.failed"
    ) {
      pending.delete(requestId);
    }
  }
  return [...pending.values()];
}

export function deriveActivePlan(
  activities: readonly ThreadActivity[],
  latestTurnId?: string | null,
): ActivePlan | null {
  const plans = ordered(activities).filter(
    (activity) => activity.kind === "turn.plan.updated",
  );
  const activity =
    [...plans].reverse().find((item) => item.turnId === latestTurnId) ??
    plans.at(-1);
  if (!activity) return null;
  const payload = payloadOf(activity);
  if (!Array.isArray(payload?.plan)) return null;
  const steps: ActivePlan["steps"] = payload.plan.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.step !== "string") return [];
    const status: ActivePlan["steps"][number]["status"] =
      record.status === "completed" || record.status === "inProgress"
        ? record.status
        : "pending";
    return [{ step: record.step, status }];
  });
  if (steps.length === 0) return null;
  return {
    createdAt: activity.createdAt,
    turnId: activity.turnId,
    explanation:
      typeof payload.explanation === "string" || payload.explanation === null
        ? payload.explanation
        : undefined,
    steps,
  };
}

export function visibleWorkActivities(
  activities: readonly ThreadActivity[],
  latestTurnId?: string | null,
): ThreadActivity[] {
  return ordered(activities).filter((activity) => {
    if (latestTurnId && activity.turnId !== latestTurnId) return false;
    return ![
      "tool.started",
      "task.started",
      "context-window.updated",
      "approval.requested",
      "approval.resolved",
      "user-input.requested",
      "user-input.resolved",
      "turn.plan.updated",
    ].includes(activity.kind);
  });
}
