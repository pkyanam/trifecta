export type ProjectId = string;
export type ThreadId = string;
export type MessageId = string;
export type TurnId = string;

export type RuntimeMode =
  | "approval-required"
  | "auto-accept-edits"
  | "full-access";
export type InteractionMode = "default" | "plan";
export type SessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "ready"
  | "interrupted"
  | "stopped"
  | "error";
export type LatestTurnState =
  | "running"
  | "interrupted"
  | "completed"
  | "error";
export type MessageRole = "user" | "assistant" | "system";

export interface ModelSelection {
  model: string;
  instanceId: string;
  options?: { id: string; value: string | boolean }[];
}

export interface ChatImageAttachment {
  type: "image";
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadChatImageAttachment {
  type: "image";
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export type ChatAttachment = ChatImageAttachment;
export type UploadChatAttachment = UploadChatImageAttachment;

export interface LatestTurn {
  turnId: TurnId;
  state: LatestTurnState;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  assistantMessageId: MessageId | null;
  sourceProposedPlan?: { threadId: ThreadId; planId: string };
}

export interface OrchestrationSession {
  threadId: ThreadId;
  status: SessionStatus;
  providerName: string | null;
  providerInstanceId?: string;
  runtimeMode: RuntimeMode;
  activeTurnId: TurnId | null;
  lastError: string | null;
  updatedAt: string;
}

export interface ProjectScript {
  id: string;
  name: string;
  command: string;
  icon: "play" | "test" | "lint" | "configure" | "build" | "debug";
  runOnWorktreeCreate: boolean;
}

export interface ProjectShell {
  id: ProjectId;
  title: string;
  workspaceRoot: string;
  repositoryIdentity?: Record<string, unknown> | null;
  defaultModelSelection: ModelSelection | null;
  scripts: ProjectScript[];
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
  branch: string | null;
  worktreePath: string | null;
  latestTurn: LatestTurn | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  session: OrchestrationSession | null;
  latestUserMessageAt: string | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
}

export interface Message {
  id: MessageId;
  role: MessageRole;
  text: string;
  attachments?: ChatAttachment[];
  streaming: boolean;
  turnId: TurnId | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposedPlan {
  id: string;
  turnId: TurnId | null;
  planMarkdown: string;
  implementedAt: string | null;
  implementationThreadId: ThreadId | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadActivity {
  id: string;
  tone: "info" | "tool" | "approval" | "error";
  kind: string;
  summary: string;
  payload: unknown;
  turnId: TurnId | null;
  sequence?: number;
  createdAt: string;
}

export interface CheckpointFile {
  path: string;
  kind: string;
  additions: number;
  deletions: number;
}

export interface CheckpointSummary {
  turnId: TurnId;
  checkpointTurnCount: number;
  checkpointRef: string;
  status: "ready" | "missing" | "error";
  files: CheckpointFile[];
  assistantMessageId: MessageId | null;
  completedAt: string;
}

export interface ThreadDetail {
  id: ThreadId;
  projectId: ProjectId;
  title: string;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: InteractionMode;
  branch: string | null;
  worktreePath: string | null;
  latestTurn: LatestTurn | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  messages: Message[];
  proposedPlans: ProposedPlan[];
  activities: ThreadActivity[];
  checkpoints: CheckpointSummary[];
  session: OrchestrationSession | null;
}

export interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  options: { label: string; description: string }[];
  multiSelect: boolean;
}

export interface PendingApproval {
  requestId: string;
  requestKind: "command" | "file-read" | "file-change";
  createdAt: string;
  detail?: string;
}

export interface PendingUserInput {
  requestId: string;
  createdAt: string;
  questions: UserInputQuestion[];
}

export interface ActivePlan {
  createdAt: string;
  turnId: TurnId | null;
  explanation?: string | null;
  steps: {
    step: string;
    status: "pending" | "inProgress" | "completed";
  }[];
}

// Server config is intentionally a plain wire representation so React Native
// does not ship Effect's schema runtime. Its field names mirror
// packages/contracts/src/server.ts and orchestration.ts.
export interface ServerProviderModel {
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
  input?: { hint?: string };
}

export interface ServerProviderSkill {
  name: string;
  description?: string;
  shortDescription?: string;
}

export interface ServerProvider {
  instanceId: string;
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
  [key: string]: unknown;
}

export interface ServerConfig {
  cwd: string;
  projectName: string;
  providers: ServerProvider[];
  [key: string]: unknown;
}
