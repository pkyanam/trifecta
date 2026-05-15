import {
  AuthSessionId,
  SshSessionId,
  SshSessionTokenInvalidError,
} from "@belweave/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import { ServerSecretStore } from "../../auth/Services/ServerSecretStore.ts";
import {
  base64UrlDecodeUtf8,
  base64UrlEncode,
  signPayload,
  timingSafeEqualBase64Url,
} from "../../auth/utils.ts";
import {
  SshTokenAuthority,
  type SshTokenAuthorityShape,
} from "../Services/SshTokenAuthority.ts";

const SIGNING_SECRET_NAME = "ssh-session-signing-key";
const DEFAULT_SSH_TOKEN_TTL = Duration.minutes(2);

const SshSessionClaims = Schema.Struct({
  v: Schema.Literal(1),
  kind: Schema.Literal("ssh-session"),
  sid: AuthSessionId,
  ssh: SshSessionId,
  iat: Schema.Number,
  exp: Schema.Number,
});
type SshSessionClaims = typeof SshSessionClaims.Type;

const decodeSshSessionClaims = Schema.decodeUnknownEffect(Schema.fromJsonString(SshSessionClaims));

const make = Effect.gen(function* () {
  const secretStore = yield* ServerSecretStore;
  const signingKey = yield* secretStore.getOrCreateRandom(SIGNING_SECRET_NAME, 64).pipe(
    Effect.orDie,
  );

  const revoked = yield* Ref.make<Set<SshSessionId>>(new Set());

  const sign = (claims: SshSessionClaims) => {
    const payload = base64UrlEncode(JSON.stringify(claims));
    const signature = signPayload(payload, signingKey);
    return `${payload}.${signature}`;
  };

  const issue: SshTokenAuthorityShape["issue"] = (input) =>
    Effect.gen(function* () {
      const ttl = input.ttl ?? DEFAULT_SSH_TOKEN_TTL;
      const issuedAt = yield* DateTime.now;
      const expiresAt = DateTime.add(issuedAt, { milliseconds: Duration.toMillis(ttl) });
      const claims: SshSessionClaims = {
        v: 1,
        kind: "ssh-session",
        sid: input.authSessionId,
        ssh: input.sshSessionId,
        iat: issuedAt.epochMilliseconds,
        exp: expiresAt.epochMilliseconds,
      };
      const token = sign(claims);
      yield* Ref.update(revoked, (set) => {
        const next = new Set(set);
        next.delete(input.sshSessionId);
        return next;
      });
      return {
        token,
        authSessionId: input.authSessionId,
        sshSessionId: input.sshSessionId,
        expiresAt,
      };
    });

  const verify: SshTokenAuthorityShape["verify"] = ({ token, expectedSshSessionId }) =>
    Effect.gen(function* () {
      const dotIndex = token.indexOf(".");
      if (dotIndex <= 0 || dotIndex === token.length - 1) {
        return yield* new SshSessionTokenInvalidError({ reason: "malformed" });
      }
      const payload = token.slice(0, dotIndex);
      const signature = token.slice(dotIndex + 1);
      const expected = signPayload(payload, signingKey);
      if (!timingSafeEqualBase64Url(signature, expected)) {
        return yield* new SshSessionTokenInvalidError({ reason: "signature" });
      }
      const decoded = yield* decodeSshSessionClaims(base64UrlDecodeUtf8(payload)).pipe(
        Effect.mapError(() => new SshSessionTokenInvalidError({ reason: "malformed" })),
      );
      if (decoded.ssh !== expectedSshSessionId) {
        return yield* new SshSessionTokenInvalidError({ reason: "scope-mismatch" });
      }
      const isRevoked = yield* Ref.get(revoked).pipe(
        Effect.map((set) => set.has(expectedSshSessionId)),
      );
      if (isRevoked) {
        return yield* new SshSessionTokenInvalidError({ reason: "revoked" });
      }
      const nowMs = yield* Clock.currentTimeMillis;
      if (decoded.exp <= nowMs) {
        return yield* new SshSessionTokenInvalidError({ reason: "expired" });
      }
      const expiresAt = DateTime.make(decoded.exp);
      if (Option.isNone(expiresAt)) {
        return yield* new SshSessionTokenInvalidError({ reason: "malformed" });
      }
      return {
        authSessionId: decoded.sid,
        sshSessionId: decoded.ssh,
        expiresAt: expiresAt.value,
      };
    });

  const revokeForSession: SshTokenAuthorityShape["revokeForSession"] = (sshSessionId) =>
    Ref.update(revoked, (set) => {
      const next = new Set(set);
      next.add(sshSessionId);
      return next;
    });

  return SshTokenAuthority.of({ issue, verify, revokeForSession });
});

export const SshTokenAuthorityLive = Layer.effect(SshTokenAuthority, make);
