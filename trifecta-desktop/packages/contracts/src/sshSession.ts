import * as Schema from "effect/Schema";

import { IsoDateTime, PortSchema, TrimmedNonEmptyString } from "./baseSchemas.ts";

const makeSshId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.check(Schema.isMaxLength(128)).pipe(Schema.brand(brand));

export const SshHostId = makeSshId("SshHostId");
export type SshHostId = typeof SshHostId.Type;

export const SshSessionId = makeSshId("SshSessionId");
export type SshSessionId = typeof SshSessionId.Type;

export const SshKnownHostId = makeSshId("SshKnownHostId");
export type SshKnownHostId = typeof SshKnownHostId.Type;

export const SshAuditEventId = makeSshId("SshAuditEventId");
export type SshAuditEventId = typeof SshAuditEventId.Type;

export const SshHostnameSchema = TrimmedNonEmptyString.check(Schema.isMaxLength(253));
export const SshUsernameSchema = TrimmedNonEmptyString.check(Schema.isMaxLength(64)).check(
  Schema.isPattern(/^[A-Za-z0-9._@-][A-Za-z0-9._@-]*$/),
);
export const SshHostLabelSchema = TrimmedNonEmptyString.check(Schema.isMaxLength(80));

/**
 * A credential class label, never a credential itself. Audit logs and the wire
 * protocol must only ever describe how authentication happened, never carry
 * the secret material that authenticated it.
 */
export const SshAuthMethod = Schema.Literals(["agent-forward", "keychain-key", "password-prompt"]);
export type SshAuthMethod = typeof SshAuthMethod.Type;

/**
 * A saved host profile. The mobile client can request a session against a
 * profile by ID; it cannot supply ad-hoc host strings or arbitrary remote
 * commands.
 */
export const SshHostProfile = Schema.Struct({
  id: SshHostId,
  label: SshHostLabelSchema,
  hostname: SshHostnameSchema,
  port: PortSchema,
  username: SshUsernameSchema,
  authMethod: SshAuthMethod,
  /**
   * When set, the profile is keyed to a specific host key fingerprint. A
   * mismatch on connect must hard-fail the session and emit an audit event.
   */
  expectedFingerprint: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type SshHostProfile = typeof SshHostProfile.Type;

export const SshHostProfileCreateInput = Schema.Struct({
  label: SshHostLabelSchema,
  hostname: SshHostnameSchema,
  port: PortSchema,
  username: SshUsernameSchema,
  authMethod: SshAuthMethod,
});
export type SshHostProfileCreateInput = typeof SshHostProfileCreateInput.Type;

export const SshHostProfileRemoveInput = Schema.Struct({
  hostId: SshHostId,
});
export type SshHostProfileRemoveInput = typeof SshHostProfileRemoveInput.Type;

export const SshHostProfileList = Schema.Struct({
  hosts: Schema.Array(SshHostProfile),
});
export type SshHostProfileList = typeof SshHostProfileList.Type;

export const SshKnownHostEntry = Schema.Struct({
  id: SshKnownHostId,
  hostname: SshHostnameSchema,
  port: PortSchema,
  keyType: TrimmedNonEmptyString,
  fingerprintSha256: TrimmedNonEmptyString,
  firstSeenAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
});
export type SshKnownHostEntry = typeof SshKnownHostEntry.Type;

export const SshHostKeyDecision = Schema.Literals(["approve", "reject"]);
export type SshHostKeyDecision = typeof SshHostKeyDecision.Type;

export const SshHostKeyPrompt = Schema.Struct({
  sessionId: SshSessionId,
  hostId: SshHostId,
  hostname: SshHostnameSchema,
  port: PortSchema,
  keyType: TrimmedNonEmptyString,
  fingerprintSha256: TrimmedNonEmptyString,
  promptedAt: IsoDateTime,
});
export type SshHostKeyPrompt = typeof SshHostKeyPrompt.Type;

export const SshSessionStatus = Schema.Literals([
  "pending-host-key",
  "authenticating",
  "running",
  "closed",
  "error",
]);
export type SshSessionStatus = typeof SshSessionStatus.Type;

export const SshSessionSnapshot = Schema.Struct({
  sessionId: SshSessionId,
  hostId: SshHostId,
  status: SshSessionStatus,
  cols: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
  rows: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })),
  openedAt: IsoDateTime,
  lastActivityAt: IsoDateTime,
  closedAt: Schema.NullOr(IsoDateTime),
  exitCode: Schema.NullOr(Schema.Int),
});
export type SshSessionSnapshot = typeof SshSessionSnapshot.Type;

export const SshOpenSessionInput = Schema.Struct({
  hostId: SshHostId,
  cols: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
  rows: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })),
});
export type SshOpenSessionInput = typeof SshOpenSessionInput.Type;

export const SshOpenSessionResult = Schema.Struct({
  snapshot: SshSessionSnapshot,
  /**
   * Scoped bearer token for stream/input/resize/close calls on this session
   * only. Expires quickly; replaced via sshIssueSessionToken if the client
   * needs to keep the session alive longer.
   */
  sessionToken: TrimmedNonEmptyString,
  sessionTokenExpiresAt: IsoDateTime,
});
export type SshOpenSessionResult = typeof SshOpenSessionResult.Type;

export const SshSessionInput = Schema.Struct({
  sessionId: SshSessionId,
});
export type SshSessionInput = typeof SshSessionInput.Type;

export const SshSendInputInput = Schema.Struct({
  sessionId: SshSessionId,
  data: Schema.String.check(Schema.isNonEmpty()).check(Schema.isMaxLength(65_536)),
});
export type SshSendInputInput = typeof SshSendInputInput.Type;

export const SshResizeInput = Schema.Struct({
  sessionId: SshSessionId,
  cols: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
  rows: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })),
});
export type SshResizeInput = typeof SshResizeInput.Type;

export const SshConfirmHostKeyInput = Schema.Struct({
  sessionId: SshSessionId,
  fingerprintSha256: TrimmedNonEmptyString,
  decision: SshHostKeyDecision,
  /**
   * When true and the decision is `approve`, persist the fingerprint so
   * subsequent connects to the same host/port skip the prompt and hard-fail
   * on mismatch.
   */
  remember: Schema.Boolean,
});
export type SshConfirmHostKeyInput = typeof SshConfirmHostKeyInput.Type;

export const SshIssueSessionTokenInput = Schema.Struct({
  sessionId: SshSessionId,
});
export type SshIssueSessionTokenInput = typeof SshIssueSessionTokenInput.Type;

export const SshIssueSessionTokenResult = Schema.Struct({
  sessionToken: TrimmedNonEmptyString,
  expiresAt: IsoDateTime,
});
export type SshIssueSessionTokenResult = typeof SshIssueSessionTokenResult.Type;

const SshTerminalEventBase = Schema.Struct({
  sessionId: SshSessionId,
  createdAt: IsoDateTime,
});

const SshTerminalStatusEvent = Schema.Struct({
  ...SshTerminalEventBase.fields,
  type: Schema.Literal("status"),
  snapshot: SshSessionSnapshot,
});

const SshTerminalOutputEvent = Schema.Struct({
  ...SshTerminalEventBase.fields,
  type: Schema.Literal("output"),
  data: Schema.String,
});

const SshTerminalHostKeyPromptEvent = Schema.Struct({
  ...SshTerminalEventBase.fields,
  type: Schema.Literal("host-key-prompt"),
  prompt: SshHostKeyPrompt,
});

const SshTerminalErrorEvent = Schema.Struct({
  ...SshTerminalEventBase.fields,
  type: Schema.Literal("error"),
  message: TrimmedNonEmptyString,
});

const SshTerminalExitedEvent = Schema.Struct({
  ...SshTerminalEventBase.fields,
  type: Schema.Literal("exited"),
  exitCode: Schema.NullOr(Schema.Int),
});

export const SshTerminalEvent = Schema.Union([
  SshTerminalStatusEvent,
  SshTerminalOutputEvent,
  SshTerminalHostKeyPromptEvent,
  SshTerminalErrorEvent,
  SshTerminalExitedEvent,
]);
export type SshTerminalEvent = typeof SshTerminalEvent.Type;

export const SshAuditEventType = Schema.Literals([
  "session-opened",
  "session-closed",
  "session-timeout",
  "host-key-accepted",
  "host-key-rejected",
  "host-key-mismatch",
  "auth-failed",
  "host-profile-created",
  "host-profile-removed",
]);
export type SshAuditEventType = typeof SshAuditEventType.Type;

export const SshAuditEvent = Schema.Struct({
  id: SshAuditEventId,
  type: SshAuditEventType,
  occurredAt: IsoDateTime,
  /** AuthSessionId of the caller, never the credential. */
  actorSessionId: TrimmedNonEmptyString,
  hostId: Schema.NullOr(SshHostId),
  hostname: Schema.NullOr(SshHostnameSchema),
  port: Schema.NullOr(PortSchema),
  username: Schema.NullOr(SshUsernameSchema),
  authMethod: Schema.NullOr(SshAuthMethod),
  sshSessionId: Schema.NullOr(SshSessionId),
  message: TrimmedNonEmptyString,
});
export type SshAuditEvent = typeof SshAuditEvent.Type;

export const SshAuditEventList = Schema.Struct({
  events: Schema.Array(SshAuditEvent),
});
export type SshAuditEventList = typeof SshAuditEventList.Type;

export class SshHostProfileNotFoundError extends Schema.TaggedErrorClass<SshHostProfileNotFoundError>()(
  "SshHostProfileNotFoundError",
  { hostId: SshHostId },
) {
  override get message() {
    return `No saved SSH host with id: ${this.hostId}`;
  }
}

export class SshHostProfileConflictError extends Schema.TaggedErrorClass<SshHostProfileConflictError>()(
  "SshHostProfileConflictError",
  {
    hostname: SshHostnameSchema,
    port: PortSchema,
    username: SshUsernameSchema,
  },
) {
  override get message() {
    return `An SSH host profile already exists for ${this.username}@${this.hostname}:${this.port}`;
  }
}

export class SshHostKeyMismatchError extends Schema.TaggedErrorClass<SshHostKeyMismatchError>()(
  "SshHostKeyMismatchError",
  {
    hostId: SshHostId,
    hostname: SshHostnameSchema,
    port: PortSchema,
    expectedFingerprint: TrimmedNonEmptyString,
    actualFingerprint: TrimmedNonEmptyString,
  },
) {
  override get message() {
    return `Host key mismatch for ${this.hostname}:${this.port} — refusing to connect`;
  }
}

export class SshSessionNotFoundError extends Schema.TaggedErrorClass<SshSessionNotFoundError>()(
  "SshSessionNotFoundError",
  { sessionId: SshSessionId },
) {
  override get message() {
    return `No active SSH session with id: ${this.sessionId}`;
  }
}

export class SshSessionTokenInvalidError extends Schema.TaggedErrorClass<SshSessionTokenInvalidError>()(
  "SshSessionTokenInvalidError",
  {
    reason: Schema.Literals(["expired", "scope-mismatch", "signature", "malformed", "revoked"]),
  },
) {
  override get message() {
    return `SSH session token rejected (${this.reason})`;
  }
}

export class SshAuthorizationError extends Schema.TaggedErrorClass<SshAuthorizationError>()(
  "SshAuthorizationError",
  { reason: TrimmedNonEmptyString },
) {
  override get message() {
    return `SSH operation denied: ${this.reason}`;
  }
}

export class SshSessionLimitError extends Schema.TaggedErrorClass<SshSessionLimitError>()(
  "SshSessionLimitError",
  { limit: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
) {
  override get message() {
    return `SSH session limit reached (${this.limit})`;
  }
}

export class SshSpawnError extends Schema.TaggedErrorClass<SshSpawnError>()("SshSpawnError", {
  detail: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return `Failed to spawn SSH session: ${this.detail}`;
  }
}

export const SshError = Schema.Union([
  SshHostProfileNotFoundError,
  SshHostProfileConflictError,
  SshHostKeyMismatchError,
  SshSessionNotFoundError,
  SshSessionTokenInvalidError,
  SshAuthorizationError,
  SshSessionLimitError,
  SshSpawnError,
]);
export type SshError = typeof SshError.Type;

export const SshSetupShellProfileResult = Schema.Struct({
  shellProfile: TrimmedNonEmptyString,
  alreadyPresent: Schema.Boolean,
});
export type SshSetupShellProfileResult = typeof SshSetupShellProfileResult.Type;
