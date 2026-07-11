export type ProjectId = string;
export type ThreadId = string;
export type MessageId = string;
export type TurnId = string;

export type RuntimeMode = "approval-required" | "auto-accept-edits" | "full-access";
export type InteractionMode = "default" | "plan";
export type SessionStatus =
  | "idle" | "starting" | "running" | "ready"
  | "interrupted" | "stopped" | "error";
export type LatestTurnState = "running" | "interrupted" | "completed" | "error";
export type MessageRole = "user" | "assistant" | "system";

export interface ModelSelection {
  /** The model slug, e.g. "claude-sonnet-4-5" */
  model: string;
  /** Provider instance ID from server config */
  instanceId: string;
  options?: { id: string; value: string | boolean }[];
}

export interface LatestTurn {
  turnId: TurnId;
  state: LatestTurnState;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  assistantMessageId?: MessageId;
}

export interface OrchestrationSession {
  threadId: ThreadId;
  status: SessionStatus;
  providerName?: string;
  providerInstanceId?: string;
  runtimeMode: RuntimeMode;
  activeTurnId?: TurnId;
  lastError?: string;
  updatedAt: string;
}

export interface ProjectShell {
  id: ProjectId;
  title: string;
  workspaceRoot?: string;
  defaultModelSelection?: ModelSelection | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadShell {
  id: ThreadId;
  projectId: ProjectId;
  title: string;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: InteractionMode;
  branch?: string;
  worktreePath?: string;
  latestTurn?: LatestTurn;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  session?: OrchestrationSession;
  latestUserMessageAt?: string;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
}

export interface Message {
  id: MessageId;
  role: MessageRole;
  text: string;
  streaming: boolean;
  turnId?: TurnId;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadDetail {
  id: ThreadId;
  projectId: ProjectId;
  title: string;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: InteractionMode;
  branch?: string;
  worktreePath?: string;
  latestTurn?: LatestTurn;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  messages: Message[];
  session?: OrchestrationSession;
}

// ── Server config ──────────────────────────────────────────────────────────

export interface ServerProviderModel {
  /** Unique model slug, used as `model` in ModelSelection */
  slug: string;
  name: string;
  shortName?: string;
  subProvider?: string;
  isCustom?: boolean;
  capabilities?: Record<string, unknown> | null;
  /** Legacy server compatibility; current servers gate at provider readiness. */
  eligible?: boolean;
}

export interface ServerProviderSlashCommand {
  name: string;
  description?: string;
  input?: {
    hint?: string;
  };
}

export interface ServerProviderSkill {
  name: string;
  description?: string;
  shortDescription?: string;
}

export interface ServerProvider {
  /** Unique instance ID across all configured providers */
  instanceId: string;
  /** Driver name, e.g. "claudeAgent", "opencode", "openaiChat" */
  driver: string;
  displayName?: string;
  label?: string; // Alternative display name
  accentColor?: string;
  enabled: boolean;
  installed: boolean;
  status?: string;
  availability?: string;
  models: ServerProviderModel[];
  slashCommands?: ServerProviderSlashCommand[];
  skills?: ServerProviderSkill[];
}

export interface ServerConfig {
  cwd: string;
  projectName: string;
  providers: ServerProvider[];
}
