import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  SshHostId,
  SshHostProfile,
  SshHostProfileConflictError,
  SshHostProfileCreateInput,
  SshHostProfileNotFoundError,
  SshHostProfileUpdateInput,
} from "@belweave/contracts";

import type { PersistenceDecodeError, PersistenceSqlError } from "../../persistence/Errors.ts";

export type SshHostProfileRepositoryError = PersistenceSqlError | PersistenceDecodeError;

export interface SshHostProfilesShape {
  readonly list: () => Effect.Effect<ReadonlyArray<SshHostProfile>, SshHostProfileRepositoryError>;
  readonly get: (
    hostId: SshHostId,
  ) => Effect.Effect<SshHostProfile, SshHostProfileNotFoundError | SshHostProfileRepositoryError>;
  readonly create: (
    input: SshHostProfileCreateInput,
  ) => Effect.Effect<SshHostProfile, SshHostProfileConflictError | SshHostProfileRepositoryError>;
  readonly remove: (
    hostId: SshHostId,
  ) => Effect.Effect<void, SshHostProfileNotFoundError | SshHostProfileRepositoryError>;
  readonly update: (
    input: SshHostProfileUpdateInput,
  ) => Effect.Effect<SshHostProfile, SshHostProfileNotFoundError | SshHostProfileRepositoryError>;
}

export class SshHostProfiles extends Context.Service<SshHostProfiles, SshHostProfilesShape>()(
  "belweave/ssh/Services/SshHostProfiles",
) {}
