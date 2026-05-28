// SSH types matching the desktop contracts
export type SshHostId = string;
export type SshSessionId = string;
export type SshKnownHostId = string;
export type SshAuditEventId = string;

export type SshAuthMethod = "agent-forward" | "keychain-key" | "password-prompt";

export interface SshHostProfile {
  id: SshHostId;
  label: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  expectedFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SshHostProfileCreateInput {
  label: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  expectedFingerprint?: string | null;
}

export interface SshHostProfileRemoveInput {
  hostId: SshHostId;
}

export interface SshHostProfileUpdateInput {
  hostId: SshHostId;
  expectedFingerprint: string | null;
}

export interface SshHostProfileList {
  hosts: SshHostProfile[];
}

export interface SshKnownHostEntry {
  id: SshKnownHostId;
  hostname: string;
  port: number;
  keyType: string;
  fingerprintSha256: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export type SshHostKeyDecision = "approve" | "reject";

export interface SshHostKeyPrompt {
  sessionId: SshSessionId;
  hostId: SshHostId;
  hostname: string;
  port: number;
  keyType: string;
  fingerprintSha256: string;
  promptedAt: string;
}

export type SshSessionStatus =
  | "pending-host-key"
  | "authenticating"
  | "running"
  | "closed"
  | "error";

export interface SshSessionSnapshot {
  sessionId: SshSessionId;
  hostId: SshHostId;
  status: SshSessionStatus;
  cols: number;
  rows: number;
  openedAt: string;
  lastActivityAt: string;
  closedAt: string | null;
  exitCode: number | null;
}

export interface SshOpenSessionInput {
  hostId: SshHostId;
  cols: number;
  rows: number;
}

export interface SshOpenSessionResult {
  snapshot: SshSessionSnapshot;
  sessionToken: string;
  sessionTokenExpiresAt: string;
}

export interface SshSessionInput {
  sessionId: SshSessionId;
}

export interface SshSendInputInput {
  sessionId: SshSessionId;
  data: string;
}

export interface SshResizeInput {
  sessionId: SshSessionId;
  cols: number;
  rows: number;
}

export interface SshConfirmHostKeyInput {
  sessionId: SshSessionId;
  fingerprintSha256: string;
  decision: SshHostKeyDecision;
  remember: boolean;
}

export interface SshIssueSessionTokenInput {
  sessionId: SshSessionId;
}

export interface SshIssueSessionTokenResult {
  sessionToken: string;
  expiresAt: string;
}

export type SshTerminalEventType =
  | "status"
  | "output"
  | "host-key-prompt"
  | "error"
  | "exited";

export interface SshTerminalEventBase {
  sessionId: SshSessionId;
  createdAt: string;
}

export interface SshTerminalStatusEvent extends SshTerminalEventBase {
  type: "status";
  snapshot: SshSessionSnapshot;
}

export interface SshTerminalOutputEvent extends SshTerminalEventBase {
  type: "output";
  data: string;
}

export interface SshTerminalHostKeyPromptEvent extends SshTerminalEventBase {
  type: "host-key-prompt";
  prompt: SshHostKeyPrompt;
}

export interface SshTerminalErrorEvent extends SshTerminalEventBase {
  type: "error";
  message: string;
}

export interface SshTerminalExitedEvent extends SshTerminalEventBase {
  type: "exited";
  exitCode: number | null;
}

export type SshTerminalEvent =
  | SshTerminalStatusEvent
  | SshTerminalOutputEvent
  | SshTerminalHostKeyPromptEvent
  | SshTerminalErrorEvent
  | SshTerminalExitedEvent;

export type SshAuditEventType =
  | "session-opened"
  | "session-closed"
  | "session-timeout"
  | "host-key-accepted"
  | "host-key-rejected"
  | "host-key-mismatch"
  | "auth-failed"
  | "host-profile-created"
  | "host-profile-removed"
  | "host-profile-updated";

export interface SshAuditEvent {
  id: SshAuditEventId;
  type: SshAuditEventType;
  occurredAt: string;
  actorSessionId: string;
  hostId: string | null;
  hostname: string | null;
  port: number | null;
  username: string | null;
  authMethod: SshAuthMethod | null;
  sshSessionId: string | null;
  message: string;
}

export interface SshAuditEventList {
  events: SshAuditEvent[];
}

export interface SshError {
  _tag: string;
  message: string;
}

export interface SshSetupShellProfileResult {
  shellProfile: string;
  alreadyPresent: boolean;
}
