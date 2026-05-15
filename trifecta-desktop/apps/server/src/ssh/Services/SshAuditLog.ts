import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  AuthSessionId,
  SshAuditEvent,
  SshAuditEventType,
  SshAuthMethod,
  SshHostId,
  SshSessionId,
} from "@belweave/contracts";

import type { PersistenceDecodeError, PersistenceSqlError } from "../../persistence/Errors.ts";

export type SshAuditLogError = PersistenceSqlError | PersistenceDecodeError;

export interface SshAuditAppendInput {
  readonly type: SshAuditEventType;
  readonly actorSessionId: AuthSessionId;
  readonly hostId: SshHostId | null;
  readonly hostname: string | null;
  readonly port: number | null;
  readonly username: string | null;
  readonly authMethod: SshAuthMethod | null;
  readonly sshSessionId: SshSessionId | null;
  readonly message: string;
}

export interface SshAuditLogShape {
  readonly append: (input: SshAuditAppendInput) => Effect.Effect<SshAuditEvent, SshAuditLogError>;
  readonly list: (limit?: number) => Effect.Effect<ReadonlyArray<SshAuditEvent>, SshAuditLogError>;
}

export class SshAuditLog extends Context.Service<SshAuditLog, SshAuditLogShape>()(
  "belweave/ssh/Services/SshAuditLog",
) {}
