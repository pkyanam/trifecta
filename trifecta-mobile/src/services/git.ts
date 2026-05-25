/**
 * Git service for version control operations.
 * Wraps git-related WebSocket RPC methods from the desktop server.
 */

import { useWsClient } from "@/stores/ws-client";

// Types matching desktop contracts

export type GitStackedAction = "commit" | "push" | "pull" | "create_pr" | "commit_push" | "commit_push_pr";

export interface VcsRef {
  name: string;
  isRemote?: boolean;
  remoteName?: string;
  current: boolean;
  isDefault: boolean;
  worktreePath: string | null;
}

export interface VcsStatusLocalResult {
  isRepo: boolean;
  sourceControlProvider?: {
    name: string;
    kind: string;
  };
  hasPrimaryRemote: boolean;
  isDefaultRef: boolean;
  refName: string | null;
  hasWorkingTreeChanges: boolean;
  workingTree: {
    files: {
      path: string;
      insertions: number;
      deletions: number;
    }[];
    insertions: number;
    deletions: number;
  };
}

export interface VcsStatusRemoteResult {
  hasUpstream: boolean;
  aheadCount: number;
  behindCount: number;
  aheadOfDefaultCount?: number;
  pr?: {
    number: number;
    title: string;
    url: string;
    baseRef: string;
    headRef: string;
    state: "open" | "closed" | "merged";
  };
}

export interface VcsStatusResult extends VcsStatusLocalResult, VcsStatusRemoteResult {}

export type VcsStatusStreamEvent =
  | { _tag: "snapshot"; local: VcsStatusLocalResult; remote: VcsStatusRemoteResult | null }
  | { _tag: "localUpdated"; local: VcsStatusLocalResult }
  | { _tag: "remoteUpdated"; remote: VcsStatusRemoteResult | null };

export interface VcsListRefsResult {
  refs: VcsRef[];
  isRepo: boolean;
  hasPrimaryRemote: boolean;
  nextCursor: number | null;
  totalCount: number;
}

export interface VcsPullResult {
  status: "pulled" | "skipped_up_to_date";
  refName: string;
  upstreamRef: string | null;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isCurrent: boolean;
  isBare: boolean;
  isDetached: boolean;
  isLocked: boolean;
}

export interface GitRunStackedActionResult {
  action: GitStackedAction;
  branch: {
    status: "created" | "skipped_not_requested";
    name?: string;
  };
  commit: {
    status: "created" | "skipped_no_changes" | "skipped_not_requested";
    commitSha?: string;
    subject?: string;
  };
  push: {
    status: "pushed" | "skipped_not_requested" | "skipped_up_to_date";
    branch?: string;
    upstreamBranch?: string;
    setUpstream?: boolean;
  };
  pr: {
    status: "created" | "opened_existing" | "skipped_not_requested";
    url?: string;
    number?: number;
    baseBranch?: string;
    headBranch?: string;
    title?: string;
  };
  toast: {
    title: string;
    description?: string;
    cta: {
      kind: "none" | "open_pr" | "run_action";
      label?: string;
      url?: string;
      action?: GitStackedAction;
    };
  };
}

export interface GitActionProgressEvent {
  actionId: string;
  cwd: string;
  action: GitStackedAction;
  kind: "action_started" | "phase_started" | "hook_started" | "hook_output" | "hook_finished" | "action_finished" | "action_failed";
  phase?: "branch" | "commit" | "push" | "pr";
  label?: string;
  hookName?: string | null;
  stream?: "stdout" | "stderr";
  text?: string;
  exitCode?: number | null;
  durationMs?: number | null;
  result?: GitRunStackedActionResult;
  message?: string;
}

// Git service hooks

export function useGitService() {
  const { request, subscribe } = useWsClient();

  const refreshStatus = async (cwd: string): Promise<VcsStatusResult> => {
    const result = await request("vcs.refreshStatus", { cwd }) as VcsStatusResult;
    return result;
  };

  const pull = async (cwd: string): Promise<VcsPullResult> => {
    const result = await request("vcs.pull", { cwd }) as VcsPullResult;
    return result;
  };

  const listRefs = async (cwd: string, query?: string, limit?: number): Promise<VcsListRefsResult> => {
    const result = await request("vcs.listRefs", {
      cwd,
      query,
      cursor: 0,
      limit: limit ?? 200,
    }) as VcsListRefsResult;
    return result;
  };

  const createRef = async (cwd: string, refName: string, switchRef?: boolean): Promise<{ refName: string }> => {
    const result = await request("vcs.createRef", {
      cwd,
      refName,
      switchRef,
    }) as { refName: string };
    return result;
  };

  const switchRef = async (cwd: string, refName: string): Promise<{ refName: string | null }> => {
    const result = await request("vcs.switchRef", {
      cwd,
      refName,
    }) as { refName: string | null };
    return result;
  };

  const createWorktree = async (cwd: string, refName: string, newRefName?: string, path?: string | null): Promise<{
    worktree: {
      path: string;
      refName: string;
    };
  }> => {
    const result = await request("vcs.createWorktree", {
      cwd,
      refName,
      newRefName,
      path,
    }) as { worktree: { path: string; refName: string } };
    return result;
  };

  const removeWorktree = async (cwd: string, path: string, force?: boolean): Promise<void> => {
    await request("vcs.removeWorktree", {
      cwd,
      path,
      force,
    });
  };

  const listWorktrees = async (cwd: string): Promise<{ worktrees: WorktreeInfo[] }> => {
    const result = await request("vcs.listWorktrees", {
      cwd,
    }) as { worktrees: WorktreeInfo[] };
    return result;
  };

  const init = async (cwd: string): Promise<void> => {
    await request("vcs.init", {
      cwd,
      kind: "git" as const,
    });
  };

  const runStackedAction = async (
    actionId: string,
    cwd: string,
    action: GitStackedAction,
    options?: {
      commitMessage?: string;
      featureBranch?: boolean;
      filePaths?: string[];
    },
  ): Promise<GitRunStackedActionResult> => {
    const result = await request("git.runStackedAction", {
      actionId,
      cwd,
      action,
      commitMessage: options?.commitMessage,
      featureBranch: options?.featureBranch,
      filePaths: options?.filePaths,
    }) as GitRunStackedActionResult;
    return result;
  };

  const resolvePullRequest = async (cwd: string, reference: string): Promise<{
    pullRequest: {
      number: number;
      title: string;
      url: string;
      baseBranch: string;
      headBranch: string;
      state: "open" | "closed" | "merged";
    };
  }> => {
    const result = await request("git.resolvePullRequest", {
      cwd,
      reference,
    }) as { pullRequest: { number: number; title: string; url: string; baseBranch: string; headBranch: string; state: "open" | "closed" | "merged" } };
    return result;
  };

  const preparePullRequestThread = async (
    cwd: string,
    reference: string,
    mode: "local" | "worktree",
    threadId?: string,
  ): Promise<{
    pullRequest: {
      number: number;
      title: string;
      url: string;
      baseBranch: string;
      headBranch: string;
      state: "open" | "closed" | "merged";
    };
    branch: string;
    worktreePath: string | null;
  }> => {
    const result = await request("git.preparePullRequestThread", {
      cwd,
      reference,
      mode,
      threadId,
    }) as { pullRequest: { number: number; title: string; url: string; baseBranch: string; headBranch: string; state: "open" | "closed" | "merged" }; branch: string; worktreePath: string | null };
    return result;
  };

  const subscribeVcsStatus = (cwd: string, onEvent: (event: VcsStatusStreamEvent) => void): (() => void) => {
    return subscribe("subscribeVcsStatus", { cwd }, (value: unknown) => {
      onEvent(value as VcsStatusStreamEvent);
    });
  };

  const subscribeGitActionProgress = (
    actionId: string,
    cwd: string,
    action: GitStackedAction,
    onEvent: (event: GitActionProgressEvent) => void,
    options?: {
      commitMessage?: string;
      featureBranch?: boolean;
      filePaths?: string[];
    },
  ): (() => void) => {
    return subscribe("git.runStackedAction", {
      actionId,
      cwd,
      action,
      commitMessage: options?.commitMessage,
      featureBranch: options?.featureBranch,
      filePaths: options?.filePaths,
    }, (value: unknown) => {
      onEvent(value as GitActionProgressEvent);
    });
  };

  return {
    refreshStatus,
    pull,
    listRefs,
    createRef,
    switchRef,
    createWorktree,
    removeWorktree,
    listWorktrees,
    init,
    runStackedAction,
    resolvePullRequest,
    preparePullRequestThread,
    subscribeVcsStatus,
    subscribeGitActionProgress,
  };
}