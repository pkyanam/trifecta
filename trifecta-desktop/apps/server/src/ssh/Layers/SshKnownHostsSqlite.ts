import * as Crypto from "node:crypto";

import { SshKnownHostEntry, SshKnownHostId } from "@belweave/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../../persistence/Errors.ts";
import {
  SshKnownHosts,
  type SshKnownHostsRepositoryError,
  type SshKnownHostsShape,
} from "../Services/SshKnownHosts.ts";

const SshKnownHostDbRow = Schema.Struct({
  id: SshKnownHostId,
  hostname: Schema.String,
  port: Schema.Int,
  keyType: Schema.String,
  fingerprintSha256: Schema.String,
  firstSeenAt: Schema.String,
  lastSeenAt: Schema.String,
});

function rowToEntry(row: typeof SshKnownHostDbRow.Type): SshKnownHostEntry {
  return {
    id: row.id,
    hostname: row.hostname,
    port: row.port,
    keyType: row.keyType,
    fingerprintSha256: row.fingerprintSha256,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
  };
}

function toError(sqlOp: string, decodeOp: string) {
  return (cause: unknown): SshKnownHostsRepositoryError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOp)(cause)
      : toPersistenceSqlError(sqlOp)(cause);
}

const ListInput = Schema.Struct({});
const FindInput = Schema.Struct({ hostname: Schema.String, port: Schema.Int });

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listRows = SqlSchema.findAll({
    Request: ListInput,
    Result: SshKnownHostDbRow,
    execute: () =>
      sql`
        SELECT
          id,
          hostname,
          port,
          key_type AS "keyType",
          fingerprint_sha256 AS "fingerprintSha256",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt"
        FROM ssh_known_hosts
        ORDER BY hostname COLLATE NOCASE ASC, port ASC
      `,
  });

  const findRow = SqlSchema.findOneOption({
    Request: FindInput,
    Result: SshKnownHostDbRow,
    execute: ({ hostname, port }) =>
      sql`
        SELECT
          id,
          hostname,
          port,
          key_type AS "keyType",
          fingerprint_sha256 AS "fingerprintSha256",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt"
        FROM ssh_known_hosts
        WHERE hostname = ${hostname} AND port = ${port}
      `,
  });

  const list: SshKnownHostsShape["list"] = () =>
    listRows({}).pipe(
      Effect.mapError(toError("SshKnownHosts.list:query", "SshKnownHosts.list:decode")),
      Effect.map((rows) => rows.map(rowToEntry)),
    );

  const find: SshKnownHostsShape["find"] = (input) =>
    findRow(input).pipe(
      Effect.mapError(toError("SshKnownHosts.find:query", "SshKnownHosts.find:decode")),
      Effect.map((rowOpt) => Option.map(rowOpt, rowToEntry)),
    );

  const upsert: SshKnownHostsShape["upsert"] = (input) =>
    Effect.gen(function* () {
      const existing = yield* find({ hostname: input.hostname, port: input.port });
      const now = DateTime.formatIso(yield* DateTime.now);
      if (Option.isSome(existing)) {
        const entry = existing.value;
        yield* sql`
          UPDATE ssh_known_hosts
          SET key_type = ${input.keyType},
              fingerprint_sha256 = ${input.fingerprintSha256},
              last_seen_at = ${now}
          WHERE id = ${entry.id}
        `.pipe(Effect.mapError(toPersistenceSqlError("SshKnownHosts.upsert:update")));
        return {
          ...entry,
          keyType: input.keyType,
          fingerprintSha256: input.fingerprintSha256,
          lastSeenAt: now,
        } satisfies SshKnownHostEntry;
      }
      const id = SshKnownHostId.make(`ssh-known-${Crypto.randomUUID()}`);
      yield* sql`
        INSERT INTO ssh_known_hosts (
          id,
          hostname,
          port,
          key_type,
          fingerprint_sha256,
          first_seen_at,
          last_seen_at
        )
        VALUES (
          ${id},
          ${input.hostname},
          ${input.port},
          ${input.keyType},
          ${input.fingerprintSha256},
          ${now},
          ${now}
        )
      `.pipe(Effect.mapError(toPersistenceSqlError("SshKnownHosts.upsert:insert")));
      return {
        id,
        hostname: input.hostname,
        port: input.port,
        keyType: input.keyType,
        fingerprintSha256: input.fingerprintSha256,
        firstSeenAt: now,
        lastSeenAt: now,
      } satisfies SshKnownHostEntry;
    });

  const remove: SshKnownHostsShape["remove"] = ({ hostname, port }) =>
    sql`DELETE FROM ssh_known_hosts WHERE hostname = ${hostname} AND port = ${port}`.pipe(
      Effect.mapError(toPersistenceSqlError("SshKnownHosts.remove:delete")),
      Effect.asVoid,
    );

  return SshKnownHosts.of({ list, find, upsert, remove });
});

export const SshKnownHostsSqliteLive = Layer.effect(SshKnownHosts, make);
