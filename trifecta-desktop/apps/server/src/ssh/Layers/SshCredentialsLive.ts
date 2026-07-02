import * as Os from "node:os";

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ProcessRunner } from "../../processRunner.ts";
import { SshCredentials, type SshCredentialsShape } from "../Services/SshCredentials.ts";

const DEFAULT_IDENTITY_NAMES = ["id_ed25519", "id_ecdsa", "id_rsa"] as const;

const SSH_ADD_COMMAND = process.platform === "win32" ? "ssh-add.exe" : "ssh-add";
const AGENT_LOAD_TIMEOUT = Duration.seconds(8);

function resolveHomeDirectory(): string | undefined {
  return Os.homedir() || process.env.USERPROFILE || undefined;
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
  const processRunner = yield* ProcessRunner;

  // Returns true if the given identity file's key is already loaded in the agent.
  // Uses ssh-keygen -lf to get the fingerprint, then checks ssh-add -l output.
  // Any failure (missing file, no agent, etc.) returns false.
  const isIdentityInAgent = (identity: string) =>
    Effect.gen(function* () {
      const keygen = yield* processRunner.run({
        command: "ssh-keygen",
        args: ["-lf", identity],
        timeout: Duration.seconds(3),
        timeoutBehavior: "timedOutResult",
        env: process.env,
      });
      if (keygen.timedOut) return false;
      // Output format: "<bits> <SHA256:fingerprint> <comment> (<type>)"
      const fingerprint = keygen.stdout.trim().split(/\s+/)[1];
      if (!fingerprint) return false;
      const agentList = yield* processRunner.run({
        command: SSH_ADD_COMMAND,
        args: ["-l"],
        timeout: Duration.seconds(3),
        timeoutBehavior: "timedOutResult",
        env: process.env,
      });
      // exit 0 = has keys, 1 = no identities, 2 = no agent
      return !agentList.timedOut && agentList.stdout.includes(fingerprint);
    }).pipe(Effect.orElseSucceed(() => false));

  /**
   * Permanent unlock for `agent-forward`: load the desktop's default identity
   * into the running ssh-agent using the macOS Keychain-stored passphrase, so
   * the forwarded agent already holds the *unlocked* key and the mobile client
   * is never prompted.
   *
   * Skips `ssh-add --apple-use-keychain` when the key is already in the agent —
   * avoids the two macOS Keychain authorization dialogs that appear even after
   * the one-time seed when the Electron process hasn't been granted "Always Allow"
   * access to the Keychain item.
   *
   * One-time desktop setup is required to seed the Keychain (survives reboots):
   *   ssh-add --apple-use-keychain ~/.ssh/id_ed25519
   * After that the key stays in the agent and this function is a no-op.
   */
  const ensureAgentIdentityFromKeychain = (identity: string) =>
    Effect.gen(function* () {
      const alreadyLoaded = yield* isIdentityInAgent(identity);
      if (!alreadyLoaded) {
        yield* processRunner
          .run({
            command: SSH_ADD_COMMAND,
            args: ["--apple-use-keychain", identity],
            timeout: AGENT_LOAD_TIMEOUT,
            timeoutBehavior: "timedOutResult",
            env: process.env,
          })
          .pipe(Effect.ignore);
      }
    });

  /**
   * Build the env + extra ssh args for the requested auth method. Raw private
   * keys are NEVER serialised to the wire — they live only in the desktop's
   * SSH agent, OS keychain, or local OpenSSH configuration. The mobile client
   * supplies neither path nor key material; it only chose `agent-forward` / `keychain-key` /
   * `password-prompt` indirectly by saving a host profile.
   */
  const resolve: SshCredentialsShape["resolve"] = ({ host, oneTimePassword }) =>
    Effect.gen(function* () {
      switch (host.authMethod) {
        case "agent-forward": {
          // Repopulate the agent from the Keychain before forwarding it, so the
          // unlocked key is available without any mobile-side prompt.
          if (process.platform === "darwin" && process.env.SSH_AUTH_SOCK && defaultIdentity) {
            yield* ensureAgentIdentityFromKeychain(defaultIdentity);
          }
          return {
            method: host.authMethod,
            env: process.env.SSH_AUTH_SOCK ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : {},
            extraSshArgs: [
              "-A",
              // BatchMode disables ALL interactive prompts, including the local
              // private-key *passphrase* prompt (which PasswordAuthentication=no
              // does NOT cover — that only governs SSH-protocol password auth).
              // Without this, an encrypted on-disk key with no agent entry makes
              // ssh prompt for a passphrase on the PTY, which loops endlessly on
              // a non-interactive mobile terminal. With it, ssh uses the agent or
              // fails fast with "Permission denied (publickey)".
              "-o",
              "BatchMode=yes",
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
        }
        case "keychain-key":
          return {
            method: host.authMethod,
            env: {},
            extraSshArgs: [
              // See agent-forward: prevent an interactive passphrase prompt loop.
              // On macOS the passphrase is read non-interactively from the
              // Keychain (UseKeychain), so BatchMode does not block a configured key.
              "-o",
              "BatchMode=yes",
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
