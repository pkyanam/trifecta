import { useWsClient } from "@/stores/ws-client";
import type {
  InteractionMode,
  ModelSelection,
  RuntimeMode,
} from "@/types/thread";
import { secureRandomId } from "@/utils/secure-id";
import { useCallback } from "react";

function command(type: string, fields: Record<string, unknown>) {
  return {
    type,
    commandId: secureRandomId(),
    ...fields,
    createdAt: new Date().toISOString(),
  };
}

export function useThreadActions(threadId: string | null) {
  const { request } = useWsClient();
  const dispatch = useCallback(
    (type: string, fields: Record<string, unknown> = {}) => {
      if (!threadId) return Promise.resolve();
      return request(
        "orchestration.dispatchCommand",
        command(type, { threadId, ...fields }),
      ).then(() => undefined);
    },
    [request, threadId],
  );

  return {
    rename: (title: string) => dispatch("thread.meta.update", { title }),
    setModel: (modelSelection: ModelSelection) =>
      dispatch("thread.meta.update", { modelSelection }),
    setRuntimeMode: (runtimeMode: RuntimeMode) =>
      dispatch("thread.runtime-mode.set", { runtimeMode }),
    setInteractionMode: (interactionMode: InteractionMode) =>
      dispatch("thread.interaction-mode.set", { interactionMode }),
    archive: () => dispatch("thread.archive"),
    unarchive: () => dispatch("thread.unarchive"),
    remove: () => dispatch("thread.delete"),
    stopSession: () => dispatch("thread.session.stop"),
    respondToApproval: (
      requestId: string,
      decision: "accept" | "acceptForSession" | "decline" | "cancel",
    ) => dispatch("thread.approval.respond", { requestId, decision }),
    respondToUserInput: (requestId: string, answers: Record<string, unknown>) =>
      dispatch("thread.user-input.respond", { requestId, answers }),
    revertCheckpoint: (turnCount: number) =>
      dispatch("thread.checkpoint.revert", { turnCount }),
  };
}

export function useProjectActions() {
  const { request } = useWsClient();
  const dispatch = useCallback(
    (type: string, fields: Record<string, unknown>) =>
      request(
        "orchestration.dispatchCommand",
        command(type, fields),
      ).then(() => undefined),
    [request],
  );
  return {
    create: (input: {
      projectId: string;
      title: string;
      workspaceRoot: string;
      createWorkspaceRootIfMissing?: boolean;
      defaultModelSelection?: ModelSelection | null;
    }) => dispatch("project.create", input),
    update: (
      projectId: string,
      fields: Record<string, unknown>,
    ) => dispatch("project.meta.update", { projectId, ...fields }),
    remove: (projectId: string, force = false) =>
      dispatch("project.delete", { projectId, force }),
  };
}
