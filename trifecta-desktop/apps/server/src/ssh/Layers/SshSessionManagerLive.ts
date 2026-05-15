import * as Crypto from "node:crypto";

import {
  AuthSessionId,
  SshAuthorizationError,
  SshHostId,
  SshHostKeyMismatchError,
  SshHostProfile,
  SshHostProfileNotFoundError,
  SshSessionId,
  SshSessionLimitError,
  SshSessionNotFoundError,
  type SshSessionSnapshot,
  type SshSessionStatus,
  type SshTerminalEvent,
  SshSpawnError,
} from "@belweave/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import { ProcessRunner } from "../../processRunner.ts";
import { PtyAdapter, type PtyProcess } from "../../terminal/Services/PTY.ts";
import { SshAuditLog, type SshAuditAppendInput } from "../Services/SshAuditLog.ts";
import { SshCredentials, type SshResolvedCredential } from "../Services/SshCredentials.ts";
import { SshHostProfiles } from "../Services/SshHostProfiles.ts";
import { SshKnownHosts } from "../Services/SshKnownHosts.ts";
import {
  SshSessionManager,
  type SshConfirmHostKeyRequest,
  type SshOpenSessionRequest,
  type SshResizeRequest,
  type SshSendInputRequest,
  type SshSessionAccessRequest,
  type SshSessionManagerShape,
} from "../Services/SshSessionManager.ts";
import { SshTokenAuthority } from "../Services/SshTokenAuthority.ts";

const MAX_SESSIONS = 16;
const IDLE_TIMEOUT = Duration.minutes(15);
const MAX_LIFETIME = Duration.hours(8);
const WATCHDOG_TICK = Duration.seconds(30);
const KEYSCAN_TIMEOUT = Duration.seconds(15);
const FINGERPRINT_TIMEOUT = Duration.seconds(5);
const SSH_KEY_TYPES = "ed25519,ecdsa,rsa";

interface SshSessionState {
  readonly sessionId: SshSessionId;
  readonly authSessionId: AuthSessionId;
  readonly host: SshHostProfile;
  readonly knownHostsPath: string;
  readonly tempDir: string;
  readonly hub: PubSub.PubSub<SshTerminalEvent>;
  readonly credential: SshResolvedCredential;
  status: SshSessionStatus;
  cols: number;
  rows: number;
  openedAtMs: number;
  lastActivityMs: number;
  closedAt: string | null;
  exitCode: number | null;
  pendingFingerprint: { sha256: string; rawLine: string; keyType: string } | null;
  process: PtyProcess | null;
  unsubscribeData: (() => void) | null;
  unsubscribeExit: (() => void) | null;
  watchdog: Fiber.Fiber<unknown, unknown> | null;
}

function isoFromMillis(ms: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(ms));
}

function snapshotOf(state: SshSessionState): SshSessionSnapshot {
  return {
    sessionId: state.sessionId,
    hostId: state.host.id,
    status: state.status,
    cols: state.cols,
    rows: state.rows,
    openedAt: isoFromMillis(state.openedAtMs),
    lastActivityAt: isoFromMillis(state.lastActivityMs),
    closedAt: state.closedAt,
    exitCode: state.exitCode,
  };
}

const make = Effect.gen(function* () {
  const hostProfiles = yield* SshHostProfiles;
  const knownHosts = yield* SshKnownHosts;
  const credentials = yield* SshCredentials;
  const auditLog = yield* SshAuditLog;
  const tokenAuthority = yield* SshTokenAuthority;
  const ptyAdapter = yield* PtyAdapter;
  const processRunner = yield* ProcessRunner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const callbackContext = yield* Effect.context<never>();
  const runFork = Effect.runForkWith(callbackContext);

  const sessions = yield* Ref.make<Map<SshSessionId, SshSessionState>>(new Map());

  const audit = (input: SshAuditAppendInput): Effect.Effect<void> =>
    auditLog.append(input).pipe(
      Effect.asVoid,
      Effect.catch((cause) =>
        Effect.logWarning("ssh.audit.append.failed", { cause: cause.message }),
      ),
    );

  const writeKnownHostsFile = (knownHostsPath: string, rawLine: string) =>
    fs.writeFileString(knownHostsPath, `${rawLine}\n`, { flag: "w" }).pipe(
      Effect.mapError(
        (cause) =>
          new SshSpawnError({ detail: `Failed to write known_hosts: ${cause.message}` }),
      ),
    );

  const runHostKeyScan = (hostname: string, port: number) =>
    processRunner
      .run({
        command: "ssh-keyscan",
        args: ["-T", "5", "-t", SSH_KEY_TYPES, "-p", String(port), hostname],
        timeout: KEYSCAN_TIMEOUT,
      })
      .pipe(
        Effect.mapError(
          (cause) => new SshSpawnError({ detail: `ssh-keyscan failed: ${cause._tag}` }),
        ),
        Effect.flatMap((result) => {
          if (Number(result.code) !== 0 || result.stdout.trim().length === 0) {
            return Effect.fail(
              new SshSpawnError({
                detail: `ssh-keyscan returned no host keys for ${hostname}:${port} (exit ${result.code})`,
              }),
            );
          }
          const lines = result.stdout.split(/\r?\n/u).filter((line) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith("#");
          });
          if (lines.length === 0) {
            return Effect.fail(
              new SshSpawnError({
                detail: `ssh-keyscan returned no host keys for ${hostname}:${port}`,
              }),
            );
          }
          return Effect.succeed(lines[0]!);
        }),
      );

  const extractFingerprint = (rawLine: string) =>
    processRunner
      .run({
        command: "ssh-keygen",
        args: ["-l", "-f", "-"],
        stdin: `${rawLine}\n`,
        timeout: FINGERPRINT_TIMEOUT,
      })
      .pipe(
        Effect.mapError(
          (cause) => new SshSpawnError({ detail: `ssh-keygen failed: ${cause._tag}` }),
        ),
        Effect.flatMap((result) => {
          if (Number(result.code) !== 0) {
            return Effect.fail(
              new SshSpawnError({ detail: `ssh-keygen failed (exit ${result.code})` }),
            );
          }
          const fp = /\bSHA256:[A-Za-z0-9+/=]+/u.exec(result.stdout);
          if (!fp) {
            return Effect.fail(
              new SshSpawnError({
                detail: `Could not parse SHA256 fingerprint from: ${result.stdout}`,
              }),
            );
          }
          const keyTypeMatch = /\(([^)]+)\)\s*$/u.exec(result.stdout.trim());
          return Effect.succeed({ sha256: fp[0], keyType: keyTypeMatch?.[1] ?? "unknown" });
        }),
      );

  const requireSession = (sshSessionId: SshSessionId, authSessionId: AuthSessionId) =>
    Effect.gen(function* () {
      const map = yield* Ref.get(sessions);
      const state = map.get(sshSessionId);
      if (!state) {
        return yield* Effect.fail(new SshSessionNotFoundError({ sessionId: sshSessionId }));
      }
      if (state.authSessionId !== authSessionId) {
        return yield* Effect.fail(
          new SshAuthorizationError({
            reason: "Session belongs to a different authenticated client",
          }),
        );
      }
      return state;
    });

  const updateState = (
    sshSessionId: SshSessionId,
    mutate: (state: SshSessionState) => void,
  ): Effect.Effect<void> =>
    Ref.update(sessions, (map) => {
      const state = map.get(sshSessionId);
      if (state) {
        mutate(state);
      }
      return map;
    });

  const removeState = (sshSessionId: SshSessionId) =>
    Ref.modify(sessions, (map) => {
      const next = new Map(map);
      const state = next.get(sshSessionId);
      next.delete(sshSessionId);
      return [state ?? null, next] as const;
    });

  const publishStatus = (state: SshSessionState) =>
    Effect.gen(function* () {
      const now = DateTime.formatIso(yield* DateTime.now);
      yield* PubSub.publish(state.hub, {
        type: "status",
        sessionId: state.sessionId,
        createdAt: now,
        snapshot: snapshotOf(state),
      });
    });

  const closeSessionInternal = (sshSessionId: SshSessionId, reason: "user" | "timeout" | "error") =>
    Effect.gen(function* () {
      const state = yield* removeState(sshSessionId);
      if (!state) return;
      state.unsubscribeData?.();
      state.unsubscribeExit?.();
      try {
        state.process?.kill();
      } catch {
        // best effort
      }
      if (state.watchdog) {
        yield* Fiber.interrupt(state.watchdog);
      }
      yield* state.credential.dispose;
      yield* fs.remove(state.tempDir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
      const closedAt = DateTime.formatIso(yield* DateTime.now);
      state.status = "closed";
      state.closedAt = closedAt;
      yield* PubSub.publish(state.hub, {
        type: "status",
        sessionId: state.sessionId,
        createdAt: closedAt,
        snapshot: snapshotOf(state),
      });
      yield* PubSub.shutdown(state.hub);
      yield* tokenAuthority.revokeForSession(sshSessionId);
      yield* audit({
        type: reason === "timeout" ? "session-timeout" : "session-closed",
        actorSessionId: state.authSessionId,
        hostId: state.host.id,
        hostname: state.host.hostname,
        port: state.host.port,
        username: state.host.username,
        authMethod: state.credential.method,
        sshSessionId: state.sessionId,
        message:
          reason === "timeout"
            ? "Session ended by idle timeout"
            : reason === "error"
              ? "Session ended due to error"
              : "Session closed by client",
      });
    });

  const startWatchdog = (sshSessionId: SshSessionId) =>
    Effect.gen(function* () {
      const tick = Effect.gen(function* () {
        yield* Effect.sleep(WATCHDOG_TICK);
        const map = yield* Ref.get(sessions);
        const state = map.get(sshSessionId);
        if (!state) return;
        const now = yield* Clock.currentTimeMillis;
        const idleFor = now - state.lastActivityMs;
        const lifetime = now - state.openedAtMs;
        if (
          idleFor >= Duration.toMillis(IDLE_TIMEOUT) ||
          lifetime >= Duration.toMillis(MAX_LIFETIME)
        ) {
          yield* closeSessionInternal(sshSessionId, "timeout");
        }
      });
      const fiber = runFork(Effect.forever(tick));
      yield* updateState(sshSessionId, (state) => {
        state.watchdog = fiber as Fiber.Fiber<unknown, unknown>;
      });
    });

  const spawnShell = (sshSessionId: SshSessionId) =>
    Effect.gen(function* () {
      const map = yield* Ref.get(sessions);
      const state = map.get(sshSessionId);
      if (!state) {
        return yield* Effect.fail(new SshSessionNotFoundError({ sessionId: sshSessionId }));
      }
      const args = [
        "-tt",
        "-o",
        `UserKnownHostsFile=${state.knownHostsPath}`,
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ServerAliveInterval=30",
        "-p",
        String(state.host.port),
        ...state.credential.extraSshArgs,
        `${state.host.username}@${state.host.hostname}`,
      ];
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...state.credential.env,
        TERM: "xterm-256color",
      };
      const childProcess = yield* ptyAdapter
        .spawn({
          shell: "ssh",
          args,
          cwd: process.env.HOME ?? process.cwd(),
          cols: state.cols,
          rows: state.rows,
          env,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new SshSpawnError({ detail: cause.message, cause: cause as unknown as Error }),
          ),
        );

      const nowMs = yield* Clock.currentTimeMillis;
      yield* updateState(sshSessionId, (s) => {
        s.process = childProcess;
        s.status = "running";
        s.lastActivityMs = nowMs;
      });

      const unsubscribeData = childProcess.onData((data) => {
        runFork(
          Effect.gen(function* () {
            const eventNow = yield* Clock.currentTimeMillis;
            yield* updateState(sshSessionId, (s) => {
              s.lastActivityMs = eventNow;
            });
            const isoNow = DateTime.formatIso(yield* DateTime.now);
            const current = (yield* Ref.get(sessions)).get(sshSessionId);
            if (!current) return;
            yield* PubSub.publish(current.hub, {
              type: "output",
              sessionId: sshSessionId,
              createdAt: isoNow,
              data,
            });
          }),
        );
      });

      const unsubscribeExit = childProcess.onExit(({ exitCode }) => {
        runFork(
          Effect.gen(function* () {
            yield* updateState(sshSessionId, (s) => {
              s.exitCode = exitCode;
              s.status = "closed";
            });
            const isoNow = DateTime.formatIso(yield* DateTime.now);
            const current = (yield* Ref.get(sessions)).get(sshSessionId);
            if (current) {
              yield* PubSub.publish(current.hub, {
                type: "exited",
                sessionId: sshSessionId,
                createdAt: isoNow,
                exitCode,
              });
            }
            yield* closeSessionInternal(sshSessionId, "user");
          }),
        );
      });

      yield* updateState(sshSessionId, (s) => {
        s.unsubscribeData = unsubscribeData;
        s.unsubscribeExit = unsubscribeExit;
      });

      const refreshed = (yield* Ref.get(sessions)).get(sshSessionId);
      if (refreshed) {
        yield* publishStatus(refreshed);
      }
      yield* startWatchdog(sshSessionId);
    });

  const open: SshSessionManagerShape["open"] = (input: SshOpenSessionRequest) =>
    Effect.gen(function* () {
      const map = yield* Ref.get(sessions);
      if (map.size >= MAX_SESSIONS) {
        return yield* Effect.fail(new SshSessionLimitError({ limit: MAX_SESSIONS }));
      }

      // Authorization boundary: mobile may only request saved hosts by ID. The
      // host string never crosses the wire from the client into the spawn path.
      const host = yield* hostProfiles.get(SshHostId.make(input.hostId)).pipe(
        Effect.catchTag("PersistenceSqlError", (cause) =>
          Effect.fail(new SshSpawnError({ detail: `Host lookup failed: ${cause.message}` })),
        ),
        Effect.catchTag("PersistenceDecodeError", (cause) =>
          Effect.fail(new SshSpawnError({ detail: `Host decode failed: ${cause.message}` })),
        ),
      );

      const sessionId = SshSessionId.make(`ssh-session-${Crypto.randomUUID()}`);
      const tempDir = yield* fs.makeTempDirectory({ prefix: "belweave-ssh-known-" }).pipe(
        Effect.mapError(
          (cause) =>
            new SshSpawnError({ detail: `Failed to allocate temp dir: ${cause.message}` }),
        ),
      );
      const knownHostsPath = path.join(tempDir, "known_hosts");

      const rawLine = yield* runHostKeyScan(host.hostname, host.port);
      const fp = yield* extractFingerprint(rawLine);

      const dbEntry = yield* knownHosts.find({ hostname: host.hostname, port: host.port }).pipe(
        Effect.catchTag("PersistenceSqlError", (cause) =>
          Effect.fail(new SshSpawnError({ detail: `Known-hosts lookup failed: ${cause.message}` })),
        ),
        Effect.catchTag("PersistenceDecodeError", (cause) =>
          Effect.fail(new SshSpawnError({ detail: `Known-hosts decode failed: ${cause.message}` })),
        ),
      );
      const expected =
        host.expectedFingerprint ??
        Option.match(dbEntry, { onNone: () => null, onSome: (entry) => entry.fingerprintSha256 });

      if (expected !== null && expected !== fp.sha256) {
        yield* audit({
          type: "host-key-mismatch",
          actorSessionId: input.authSessionId,
          hostId: host.id,
          hostname: host.hostname,
          port: host.port,
          username: host.username,
          authMethod: host.authMethod,
          sshSessionId: sessionId,
          message: `Expected ${expected}, got ${fp.sha256}`,
        });
        yield* fs.remove(tempDir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
        return yield* Effect.fail(
          new SshHostKeyMismatchError({
            hostId: host.id,
            hostname: host.hostname,
            port: host.port,
            expectedFingerprint: expected,
            actualFingerprint: fp.sha256,
          }),
        );
      }

      const credential = yield* credentials.resolve({ host });
      const hub = yield* PubSub.bounded<SshTerminalEvent>(256);
      const nowMs = yield* Clock.currentTimeMillis;

      const state: SshSessionState = {
        sessionId,
        authSessionId: input.authSessionId,
        host,
        knownHostsPath,
        tempDir,
        hub,
        credential,
        status: expected === null ? "pending-host-key" : "authenticating",
        cols: input.cols,
        rows: input.rows,
        openedAtMs: nowMs,
        lastActivityMs: nowMs,
        closedAt: null,
        exitCode: null,
        pendingFingerprint:
          expected === null ? { sha256: fp.sha256, rawLine, keyType: fp.keyType } : null,
        process: null,
        unsubscribeData: null,
        unsubscribeExit: null,
        watchdog: null,
      };

      yield* Ref.update(sessions, (current) => {
        const next = new Map(current);
        next.set(sessionId, state);
        return next;
      });

      yield* audit({
        type: "session-opened",
        actorSessionId: input.authSessionId,
        hostId: host.id,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        authMethod: host.authMethod,
        sshSessionId: sessionId,
        message: `Session opened (status=${state.status})`,
      });

      if (expected === null) {
        const promptedAt = DateTime.formatIso(yield* DateTime.now);
        yield* PubSub.publish(hub, {
          type: "host-key-prompt",
          sessionId,
          createdAt: promptedAt,
          prompt: {
            sessionId,
            hostId: host.id,
            hostname: host.hostname,
            port: host.port,
            keyType: fp.keyType,
            fingerprintSha256: fp.sha256,
            promptedAt,
          },
        });
        return snapshotOf(state);
      }

      yield* writeKnownHostsFile(knownHostsPath, rawLine);
      yield* spawnShell(sessionId).pipe(
        Effect.tapError(() =>
          closeSessionInternal(sessionId, "error").pipe(Effect.catch(() => Effect.void)),
        ),
      );
      const refreshed = (yield* Ref.get(sessions)).get(sessionId);
      return snapshotOf(refreshed ?? state);
    });

  const get: SshSessionManagerShape["get"] = (input: SshSessionAccessRequest) =>
    requireSession(input.sshSessionId, input.authSessionId).pipe(Effect.map(snapshotOf));

  const sendInput: SshSessionManagerShape["sendInput"] = (input: SshSendInputRequest) =>
    Effect.gen(function* () {
      const state = yield* requireSession(input.sshSessionId, input.authSessionId);
      if (state.status !== "running" || !state.process) {
        return yield* Effect.fail(
          new SshSessionNotFoundError({ sessionId: input.sshSessionId }),
        );
      }
      state.process.write(input.data);
      state.lastActivityMs = yield* Clock.currentTimeMillis;
    });

  const resize: SshSessionManagerShape["resize"] = (input: SshResizeRequest) =>
    Effect.gen(function* () {
      const state = yield* requireSession(input.sshSessionId, input.authSessionId);
      if (state.status !== "running" || !state.process) {
        return yield* Effect.fail(
          new SshSessionNotFoundError({ sessionId: input.sshSessionId }),
        );
      }
      state.process.resize(input.cols, input.rows);
      state.cols = input.cols;
      state.rows = input.rows;
      state.lastActivityMs = yield* Clock.currentTimeMillis;
    });

  const confirmHostKey: SshSessionManagerShape["confirmHostKey"] = (
    input: SshConfirmHostKeyRequest,
  ) =>
    Effect.gen(function* () {
      const state = yield* requireSession(input.sshSessionId, input.authSessionId);
      if (state.status !== "pending-host-key" || !state.pendingFingerprint) {
        return yield* Effect.fail(
          new SshSessionNotFoundError({ sessionId: input.sshSessionId }),
        );
      }
      if (state.pendingFingerprint.sha256 !== input.fingerprintSha256) {
        yield* audit({
          type: "host-key-rejected",
          actorSessionId: input.authSessionId,
          hostId: state.host.id,
          hostname: state.host.hostname,
          port: state.host.port,
          username: state.host.username,
          authMethod: state.credential.method,
          sshSessionId: state.sessionId,
          message: `Confirmation fingerprint mismatch: ${input.fingerprintSha256}`,
        });
        yield* closeSessionInternal(state.sessionId, "error");
        return yield* Effect.fail(
          new SshHostKeyMismatchError({
            hostId: state.host.id,
            hostname: state.host.hostname,
            port: state.host.port,
            expectedFingerprint: state.pendingFingerprint.sha256,
            actualFingerprint: input.fingerprintSha256,
          }),
        );
      }

      if (input.decision === "reject") {
        yield* audit({
          type: "host-key-rejected",
          actorSessionId: input.authSessionId,
          hostId: state.host.id,
          hostname: state.host.hostname,
          port: state.host.port,
          username: state.host.username,
          authMethod: state.credential.method,
          sshSessionId: state.sessionId,
          message: `Rejected fingerprint ${input.fingerprintSha256}`,
        });
        yield* closeSessionInternal(state.sessionId, "user");
        return snapshotOf(state);
      }

      if (input.remember) {
        yield* knownHosts
          .upsert({
            hostname: state.host.hostname,
            port: state.host.port,
            keyType: state.pendingFingerprint.keyType,
            fingerprintSha256: state.pendingFingerprint.sha256,
          })
          .pipe(
            Effect.catch((cause) =>
              Effect.logWarning("ssh.knownHosts.upsert.failed", { cause: cause.message }),
            ),
          );
        yield* hostProfiles
          .setExpectedFingerprint({
            hostId: state.host.id,
            fingerprint: state.pendingFingerprint.sha256,
          })
          .pipe(Effect.catch(() => Effect.void));
      }
      yield* audit({
        type: "host-key-accepted",
        actorSessionId: input.authSessionId,
        hostId: state.host.id,
        hostname: state.host.hostname,
        port: state.host.port,
        username: state.host.username,
        authMethod: state.credential.method,
        sshSessionId: state.sessionId,
        message: `Accepted fingerprint ${input.fingerprintSha256}${input.remember ? " (remembered)" : ""}`,
      });
      yield* writeKnownHostsFile(state.knownHostsPath, state.pendingFingerprint.rawLine);
      yield* updateState(state.sessionId, (s) => {
        s.status = "authenticating";
        s.pendingFingerprint = null;
      });
      yield* spawnShell(state.sessionId).pipe(
        Effect.tapError(() =>
          closeSessionInternal(state.sessionId, "error").pipe(Effect.catch(() => Effect.void)),
        ),
      );
      const refreshed = (yield* Ref.get(sessions)).get(state.sessionId);
      return snapshotOf(refreshed ?? state);
    });

  const close: SshSessionManagerShape["close"] = (input: SshSessionAccessRequest) =>
    Effect.gen(function* () {
      yield* requireSession(input.sshSessionId, input.authSessionId);
      yield* closeSessionInternal(input.sshSessionId, "user");
    });

  const subscribe: SshSessionManagerShape["subscribe"] = (input: SshSessionAccessRequest) =>
    Stream.unwrap(
      requireSession(input.sshSessionId, input.authSessionId).pipe(
        Effect.map((state) => Stream.fromPubSub(state.hub)),
      ),
    );

  return SshSessionManager.of({ open, get, sendInput, resize, confirmHostKey, close, subscribe });
});

export const SshSessionManagerLive = Layer.effect(SshSessionManager, make);
