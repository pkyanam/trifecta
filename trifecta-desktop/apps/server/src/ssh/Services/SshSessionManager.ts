import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

import type {
  AuthSessionId,
  SshError,
  SshHostKeyDecision,
  SshHostKeyMismatchError,
  SshHostProfileNotFoundError,
  SshSessionId,
  SshSessionLimitError,
  SshSessionNotFoundError,
  SshSessionSnapshot,
  SshSpawnError,
  SshTerminalEvent,
} from "@belweave/contracts";

export interface SshOpenSessionRequest {
  readonly authSessionId: AuthSessionId;
  readonly hostId: string;
  readonly cols: number;
  readonly rows: number;
}

export interface SshSendInputRequest {
  readonly authSessionId: AuthSessionId;
  readonly sshSessionId: SshSessionId;
  readonly data: string;
}

export interface SshResizeRequest {
  readonly authSessionId: AuthSessionId;
  readonly sshSessionId: SshSessionId;
  readonly cols: number;
  readonly rows: number;
}

export interface SshConfirmHostKeyRequest {
  readonly authSessionId: AuthSessionId;
  readonly sshSessionId: SshSessionId;
  readonly fingerprintSha256: string;
  readonly decision: SshHostKeyDecision;
  readonly remember: boolean;
}

export interface SshSessionAccessRequest {
  readonly authSessionId: AuthSessionId;
  readonly sshSessionId: SshSessionId;
}

export interface SshSessionManagerShape {
  readonly open: (
    input: SshOpenSessionRequest,
  ) => Effect.Effect<
    SshSessionSnapshot,
    | SshHostProfileNotFoundError
    | SshHostKeyMismatchError
    | SshSessionLimitError
    | SshSpawnError
    | SshError
  >;
  readonly get: (
    input: SshSessionAccessRequest,
  ) => Effect.Effect<SshSessionSnapshot, SshSessionNotFoundError | SshError>;
  readonly sendInput: (
    input: SshSendInputRequest,
  ) => Effect.Effect<void, SshSessionNotFoundError | SshError>;
  readonly resize: (
    input: SshResizeRequest,
  ) => Effect.Effect<void, SshSessionNotFoundError | SshError>;
  readonly confirmHostKey: (
    input: SshConfirmHostKeyRequest,
  ) => Effect.Effect<SshSessionSnapshot, SshSessionNotFoundError | SshError>;
  readonly close: (
    input: SshSessionAccessRequest,
  ) => Effect.Effect<void, SshSessionNotFoundError | SshError>;
  readonly subscribe: (
    input: SshSessionAccessRequest,
  ) => Stream.Stream<SshTerminalEvent, SshSessionNotFoundError | SshError>;
}

export class SshSessionManager extends Context.Service<SshSessionManager, SshSessionManagerShape>()(
  "belweave/ssh/Services/SshSessionManager",
) {}
