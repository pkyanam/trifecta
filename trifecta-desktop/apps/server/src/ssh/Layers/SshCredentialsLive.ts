import * as Os from "node:os";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { SshCredentials, type SshCredentialsShape } from "../Services/SshCredentials.ts";

const DEFAULT_IDENTITY_NAMES = ["id_ed25519", "id_ecdsa", "id_rsa"] as const;

function resolveHomeDirectory(): string | undefined {
  return process.env.HOME || process.env.USERPROFILE || Os.homedir() || undefined;
}

const resolveDefaultIdentity = Effect.fn(function* () {
  const home = resolveHomeDirectory();
  if (!home) return undefined;

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  for (const name of DEFAULT_IDENTITY_NAMES) {
    const candidate = path.join(home, ".ssh", name);
    if (yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))) {
      return candidate;
    }
  }
  return undefined;
});

const make = Effect.gen(function* () {
  const defaultIdentity = yield* resolveDefaultIdentity();

  /**
   * Build the env + extra ssh args for the requested auth method. Raw private
   * keys are NEVER serialised to the wire — they live only in the desktop's
   * SSH agent, OS keychain, or local OpenSSH configuration. The mobile client
   * supplies neither path nor key material; it only chose `agent-forward` / `keychain-key` /
   * `password-prompt` indirectly by saving a host profile.
   */
  const resolve: SshCredentialsShape["resolve"] = ({ host, oneTimePassword }) =>
    Effect.sync(() => {
      switch (host.authMethod) {
        case "agent-forward":
          return {
            method: host.authMethod,
            env: process.env.SSH_AUTH_SOCK ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : {},
            extraSshArgs: [
              "-A",
              "-o",
              "PreferredAuthentications=publickey",
              "-o",
              "PubkeyAuthentication=yes",
              "-o",
              "PasswordAuthentication=no",
              "-o",
              "KbdInteractiveAuthentication=no",
            ],
            dispose: Effect.void,
          };
        case "keychain-key":
          return {
            method: host.authMethod,
            env: {},
            extraSshArgs: [
              "-o",
              "PreferredAuthentications=publickey",
              ...(process.platform === "darwin"
                ? ["-o", "UseKeychain=yes", "-o", "AddKeysToAgent=yes"]
                : []),
              ...(defaultIdentity ? ["-i", defaultIdentity] : []),
              "-o",
              "PasswordAuthentication=no",
              "-o",
              "KbdInteractiveAuthentication=no",
            ],
            dispose: Effect.void,
          };
        case "password-prompt":
          return {
            method: host.authMethod,
            env: oneTimePassword === undefined ? {} : { BELWEAVE_SSH_AUTH_SECRET: oneTimePassword },
            extraSshArgs: [
              "-o",
              "PreferredAuthentications=password,keyboard-interactive",
              "-o",
              "PubkeyAuthentication=no",
            ],
            dispose: Effect.void,
          };
      }
    });

  return SshCredentials.of({ resolve });
});

export const SshCredentialsLive = Layer.effect(SshCredentials, make);
