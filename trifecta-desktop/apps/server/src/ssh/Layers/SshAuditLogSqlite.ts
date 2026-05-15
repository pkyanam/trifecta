import * as Crypto from "node:crypto";

import {
  SshAuditEvent,
  SshAuditEventId,
  SshAuthMethod,
  SshHostId,
  SshSessionId,
} from "@belweave/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  toPersistenceDecodeError,
  toPersistenceSqlError,
} from "../../persistence/Errors.ts";
import {
  SshAuditLog,
  type SshAuditLogError,
  type SshAuditLogShape,
} from "../Services/SshAuditLog.ts";

const SshAuditEventDbRow = Schema.Struct({
  id: SshAuditEventId,
  type: Schema.Literals([
    "session-opened",
    "session-closed",
    "session-timeout",
    "host-key-accepted",
    "host-key-rejected",
    "host-key-mismatch",
    "auth-failed",
    "host-profile-created",
    "host-profile-removed",
  ]),
  occurredAt: Schema.String,
  actorSessionId: Schema.String,
  hostId: Schema.NullOr(SshHostId),
  hostname: Schema.NullOr(Schema.String),
  port: Schema.NullOr(Schema.Int),
  username: Schema.NullOr(Schema.String),
  authMethod: Schema.NullOr(SshAuthMethod),
  sshSessionId: Schema.NullOr(SshSessionId),
  message: Schema.String,
});

function rowToEvent(row: typeof SshAuditEventDbRow.Type): SshAuditEvent {
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurredAt,
    actorSessionId: row.actorSessionId,
    hostId: row.hostId,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    authMethod: row.authMethod,
    sshSessionId: row.sshSessionId,
    message: row.message,
  };
}

function toError(sqlOp: string, decodeOp: string) {
  return (cause: unknown): SshAuditLogError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOp)(cause)
      : toPersistenceSqlError(sqlOp)(cause);
}

const ListInput = Schema.Struct({ limit: Schema.Int });

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listRows = SqlSchema.findAll({
    Request: ListInput,
    Result: SshAuditEventDbRow,
    execute: ({ limit }) =>
      sql`
        SELECT
          id,
          type,
          occurred_at AS "occurredAt",
          actor_session_id AS "actorSessionId",
          host_id AS "hostId",
          hostname,
          port,
          username,
          auth_method AS "authMethod",
          ssh_session_id AS "sshSessionId",
          message
        FROM ssh_audit_events
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${limit}
      `,
  });

  const append: SshAuditLogShape["append"] = (input) =>
    Effect.gen(function* () {
      const id = SshAuditEventId.make(`ssh-audit-${Crypto.randomUUID()}`);
      const occurredAt = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        INSERT INTO ssh_audit_events (
          id,
          type,
          occurred_at,
          actor_session_id,
          host_id,
          hostname,
          port,
          username,
          auth_method,
          ssh_session_id,
          message
        )
        VALUES (
          ${id},
          ${input.type},
          ${occurredAt},
          ${input.actorSessionId},
          ${input.hostId},
          ${input.hostname},
          ${input.port},
          ${input.username},
          ${input.authMethod},
          ${input.sshSessionId},
          ${input.message}
        )
      `.pipe(Effect.mapError(toPersistenceSqlError("SshAuditLog.append:insert")));
      return {
        id,
        type: input.type,
        occurredAt,
        actorSessionId: input.actorSessionId,
        hostId: input.hostId,
        hostname: input.hostname,
        port: input.port,
        username: input.username,
        authMethod: input.authMethod,
        sshSessionId: input.sshSessionId,
        message: input.message,
      } satisfies SshAuditEvent;
    });

  const list: SshAuditLogShape["list"] = (limit = 200) =>
    listRows({ limit: Math.max(1, Math.min(1000, limit)) }).pipe(
      Effect.mapError(toError("SshAuditLog.list:query", "SshAuditLog.list:decode")),
      Effect.map((rows) => rows.map(rowToEvent)),
    );

  return SshAuditLog.of({ append, list });
});

export const SshAuditLogSqliteLive = Layer.effect(SshAuditLog, make);
