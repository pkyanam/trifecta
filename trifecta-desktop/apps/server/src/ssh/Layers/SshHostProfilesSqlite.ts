import * as Crypto from "node:crypto";

import {
  SshHostId,
  SshHostProfile,
  SshHostProfileConflictError,
  SshHostProfileCreateInput,
  SshHostProfileNotFoundError,
} from "@belweave/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../../persistence/Errors.ts";
import {
  SshHostProfiles,
  type SshHostProfileRepositoryError,
  type SshHostProfilesShape,
} from "../Services/SshHostProfiles.ts";

const SshHostProfileDbRow = Schema.Struct({
  id: SshHostId,
  label: Schema.String,
  hostname: Schema.String,
  port: Schema.Int,
  username: Schema.String,
  authMethod: Schema.Literals(["agent-forward", "keychain-key", "password-prompt"]),
  expectedFingerprint: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

function rowToProfile(row: typeof SshHostProfileDbRow.Type): SshHostProfile {
  return {
    id: row.id,
    label: row.label,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    authMethod: row.authMethod,
    expectedFingerprint: row.expectedFingerprint,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toError(sqlOp: string, decodeOp: string) {
  return (cause: unknown): SshHostProfileRepositoryError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOp)(cause)
      : toPersistenceSqlError(sqlOp)(cause);
}

const ListInput = Schema.Struct({});
const GetInput = Schema.Struct({ id: SshHostId });
const RemoveInput = Schema.Struct({ id: SshHostId });
const FindByConnectionInput = Schema.Struct({
  hostname: Schema.String,
  port: Schema.Int,
  username: Schema.String,
});

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listRows = SqlSchema.findAll({
    Request: ListInput,
    Result: SshHostProfileDbRow,
    execute: () =>
      sql`
        SELECT
          id,
          label,
          hostname,
          port,
          username,
          auth_method AS "authMethod",
          expected_fingerprint AS "expectedFingerprint",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM ssh_host_profiles
        ORDER BY label COLLATE NOCASE ASC
      `,
  });

  const findRowById = SqlSchema.findOneOption({
    Request: GetInput,
    Result: SshHostProfileDbRow,
    execute: ({ id }) =>
      sql`
        SELECT
          id,
          label,
          hostname,
          port,
          username,
          auth_method AS "authMethod",
          expected_fingerprint AS "expectedFingerprint",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM ssh_host_profiles
        WHERE id = ${id}
      `,
  });

  const findRowByConnection = SqlSchema.findOneOption({
    Request: FindByConnectionInput,
    Result: SshHostProfileDbRow,
    execute: ({ hostname, port, username }) =>
      sql`
        SELECT
          id,
          label,
          hostname,
          port,
          username,
          auth_method AS "authMethod",
          expected_fingerprint AS "expectedFingerprint",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM ssh_host_profiles
        WHERE hostname = ${hostname}
          AND port = ${port}
          AND username = ${username}
      `,
  });

  const removeRow = SqlSchema.void({
    Request: RemoveInput,
    execute: ({ id }) => sql`DELETE FROM ssh_host_profiles WHERE id = ${id}`,
  });

  const list: SshHostProfilesShape["list"] = () =>
    listRows({}).pipe(
      Effect.mapError(toError("SshHostProfiles.list:query", "SshHostProfiles.list:decode")),
      Effect.map((rows) => rows.map(rowToProfile)),
    );

  const get: SshHostProfilesShape["get"] = (hostId) =>
    findRowById({ id: hostId }).pipe(
      Effect.mapError(toError("SshHostProfiles.get:query", "SshHostProfiles.get:decode")),
      Effect.flatMap((row) =>
        Option.match(row, {
          onNone: () => Effect.fail(new SshHostProfileNotFoundError({ hostId })),
          onSome: (r) => Effect.succeed(rowToProfile(r)),
        }),
      ),
    );

  const create: SshHostProfilesShape["create"] = (input) =>
    Effect.gen(function* () {
      const existing = yield* findRowByConnection({
        hostname: input.hostname,
        port: input.port,
        username: input.username,
      }).pipe(
        Effect.mapError(
          toError("SshHostProfiles.create:lookup", "SshHostProfiles.create:lookupDecode"),
        ),
      );
      if (Option.isSome(existing)) {
        return yield* Effect.fail(
          new SshHostProfileConflictError({
            hostname: input.hostname,
            port: input.port,
            username: input.username,
          }),
        );
      }
      const id = SshHostId.make(`ssh-host-${Crypto.randomUUID()}`);
      const now = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        INSERT INTO ssh_host_profiles (
          id,
          label,
          hostname,
          port,
          username,
          auth_method,
          expected_fingerprint,
          created_at,
          updated_at
        )
        VALUES (
          ${id},
          ${input.label},
          ${input.hostname},
          ${input.port},
          ${input.username},
          ${input.authMethod},
          NULL,
          ${now},
          ${now}
        )
      `.pipe(Effect.mapError(toPersistenceSqlError("SshHostProfiles.create:insert")));
      return {
        id,
        label: input.label,
        hostname: input.hostname,
        port: input.port,
        username: input.username,
        authMethod: input.authMethod,
        expectedFingerprint: null,
        createdAt: now,
        updatedAt: now,
      } satisfies SshHostProfile;
    });

  const remove: SshHostProfilesShape["remove"] = (hostId) =>
    Effect.gen(function* () {
      yield* get(hostId);
      yield* removeRow({ id: hostId }).pipe(
        Effect.mapError(toError("SshHostProfiles.remove:query", "SshHostProfiles.remove:decode")),
      );
    });

  const setExpectedFingerprint: SshHostProfilesShape["setExpectedFingerprint"] = ({
    hostId,
    fingerprint,
  }) =>
    Effect.gen(function* () {
      const existing = yield* get(hostId);
      const now = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        UPDATE ssh_host_profiles
        SET expected_fingerprint = ${fingerprint}, updated_at = ${now}
        WHERE id = ${hostId}
      `.pipe(
        Effect.mapError(toPersistenceSqlError("SshHostProfiles.setExpectedFingerprint:update")),
      );
      return {
        ...existing,
        expectedFingerprint: fingerprint,
        updatedAt: now,
      } satisfies SshHostProfile;
    });

  return SshHostProfiles.of({ list, get, create, remove, setExpectedFingerprint });
});

export const SshHostProfilesSqliteLive = Layer.effect(SshHostProfiles, make);
