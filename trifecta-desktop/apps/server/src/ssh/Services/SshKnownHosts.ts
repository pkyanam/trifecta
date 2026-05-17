import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { SshKnownHostEntry } from "@belweave/contracts";

import type { PersistenceDecodeError, PersistenceSqlError } from "../../persistence/Errors.ts";

export type SshKnownHostsRepositoryError = PersistenceSqlError | PersistenceDecodeError;

export interface SshKnownHostLookupInput {
  readonly hostname: string;
  readonly port: number;
}

export interface SshKnownHostUpsertInput extends SshKnownHostLookupInput {
  readonly keyType: string;
  readonly fingerprintSha256: string;
}

export interface SshKnownHostsShape {
  readonly list: () => Effect.Effect<
    ReadonlyArray<SshKnownHostEntry>,
    SshKnownHostsRepositoryError
  >;
  readonly find: (
    input: SshKnownHostLookupInput,
  ) => Effect.Effect<Option.Option<SshKnownHostEntry>, SshKnownHostsRepositoryError>;
  readonly upsert: (
    input: SshKnownHostUpsertInput,
  ) => Effect.Effect<SshKnownHostEntry, SshKnownHostsRepositoryError>;
  readonly remove: (
    input: SshKnownHostLookupInput,
  ) => Effect.Effect<void, SshKnownHostsRepositoryError>;
}

export class SshKnownHosts extends Context.Service<SshKnownHosts, SshKnownHostsShape>()(
  "belweave/ssh/Services/SshKnownHosts",
) {}
