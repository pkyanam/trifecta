import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { SshAuthMethod, SshHostProfile } from "@belweave/contracts";

/**
 * The result of resolving a credential for an SSH session. We never expose the
 * raw secret material to callers — the manager only learns *how* the child
 * process was prepared (env variables, askpass helper, agent socket path) and
 * the auth method label for audit logging.
 */
export interface SshResolvedCredential {
  readonly method: SshAuthMethod;
  readonly env: Readonly<Record<string, string>>;
  readonly extraSshArgs: ReadonlyArray<string>;
  /**
   * Cleanup tied to scope: erase any temp files (askpass scripts, agent
   * sockets) created on behalf of this session.
   */
  readonly dispose: Effect.Effect<void>;
}

export interface SshCredentialResolveInput {
  readonly host: SshHostProfile;
  /**
   * Optional one-time password for `password-prompt` auth. Never persisted
   * unless the host profile explicitly opted into keychain storage (which is
   * a separate API call not reachable from the mobile client).
   */
  readonly oneTimePassword?: string;
}

export interface SshCredentialsShape {
  readonly resolve: (input: SshCredentialResolveInput) => Effect.Effect<SshResolvedCredential>;
}

export class SshCredentials extends Context.Service<SshCredentials, SshCredentialsShape>()(
  "belweave/ssh/Services/SshCredentials",
) {}
