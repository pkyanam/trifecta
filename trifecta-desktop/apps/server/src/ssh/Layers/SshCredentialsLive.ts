import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SshCredentials, type SshCredentialsShape } from "../Services/SshCredentials.ts";

const make = Effect.sync(() => {
  /**
   * Build the env + extra ssh args for the requested auth method. Raw private
   * keys are NEVER serialised to the wire — they live only in the desktop's
   * SSH agent or OS keychain. The mobile client supplies neither path nor
   * key material; it only chose `agent-forward` / `keychain-key` /
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
