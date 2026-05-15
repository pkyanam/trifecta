import * as Context from "effect/Context";
import type * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import type * as Effect from "effect/Effect";

import type {
  AuthSessionId,
  SshSessionId,
  SshSessionTokenInvalidError,
} from "@belweave/contracts";

export interface SshTokenIssueInput {
  readonly authSessionId: AuthSessionId;
  readonly sshSessionId: SshSessionId;
  readonly ttl?: Duration.Duration;
}

export interface SshIssuedToken {
  readonly token: string;
  readonly authSessionId: AuthSessionId;
  readonly sshSessionId: SshSessionId;
  readonly expiresAt: DateTime.DateTime;
}

export interface SshVerifiedToken {
  readonly authSessionId: AuthSessionId;
  readonly sshSessionId: SshSessionId;
  readonly expiresAt: DateTime.DateTime;
}

export interface SshTokenVerifyInput {
  readonly token: string;
  readonly expectedSshSessionId: SshSessionId;
}

export interface SshTokenAuthorityShape {
  readonly issue: (input: SshTokenIssueInput) => Effect.Effect<SshIssuedToken>;
  readonly verify: (
    input: SshTokenVerifyInput,
  ) => Effect.Effect<SshVerifiedToken, SshSessionTokenInvalidError>;
  readonly revokeForSession: (sshSessionId: SshSessionId) => Effect.Effect<void>;
}

export class SshTokenAuthority extends Context.Service<
  SshTokenAuthority,
  SshTokenAuthorityShape
>()("belweave/ssh/Services/SshTokenAuthority") {}
