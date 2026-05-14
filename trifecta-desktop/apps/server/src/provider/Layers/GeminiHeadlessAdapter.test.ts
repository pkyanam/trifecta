import {
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import { ProviderAdapterProcessError, ProviderAdapterRequestError } from "../Errors.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import {
  isRetriableGeminiHeadlessRequestFailure,
  makeGeminiHeadlessAdapter,
  parseGeminiSessionResumeIndex,
} from "./GeminiHeadlessAdapter.ts";

const GEMINI = ProviderDriverKind.make("gemini");
const encoder = new TextEncoder();

function mockHandle(result: { stdout: string; stderr: string; code: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout)),
    stderr: Stream.make(encoder.encode(result.stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

describe("isRetriableGeminiHeadlessRequestFailure", () => {
  it("returns true for Connection stalled in detail (Gemini CLI transport)", () => {
    const err = new ProviderAdapterRequestError({
      provider: GEMINI,
      method: "gemini/headless",
      detail: "Error: T: Connection stalled",
    });
    expect(isRetriableGeminiHeadlessRequestFailure(err)).toBe(true);
  });

  it("returns true for rate limit / quota style messages", () => {
    const err = new ProviderAdapterRequestError({
      provider: GEMINI,
      method: "gemini/headless",
      detail: "You have exhausted your capacity on this model",
    });
    expect(isRetriableGeminiHeadlessRequestFailure(err)).toBe(true);
  });

  it("returns false for non-request errors", () => {
    const err = new ProviderAdapterProcessError({
      provider: GEMINI,
      threadId: ThreadId.make("t1"),
      detail: "Gemini headless exited with status 1: syntax error in prompt",
    });
    expect(isRetriableGeminiHeadlessRequestFailure(err)).toBe(false);
  });

  it("returns false for request errors that are not transport-like", () => {
    const err = new ProviderAdapterRequestError({
      provider: GEMINI,
      method: "gemini/headless",
      detail: "ENOENT: no such file or directory",
    });
    expect(isRetriableGeminiHeadlessRequestFailure(err)).toBe(false);
  });
});

describe("makeGeminiHeadlessAdapter (session pinning)", () => {
  it("parses numeric resume index for a stored Gemini session UUID", () => {
    const sid = "aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee";
    expect(
      parseGeminiSessionResumeIndex(
        `Available sessions for this project (2):
  1. First prompt [11111111-2222-4333-8444-555555555555]
  18. what model are you? [${sid}]
`,
        sid,
      ),
    ).toBe("18");
  });

  effectIt.effect(
    "first turn uses --session-id, second resolves the stored UUID and resumes its index",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const argHistory: ReadonlyArray<string>[] = [];
          let sessionId: string | undefined;
          const spawnerLayer = Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make((command) => {
              const cmd = command as unknown as { args: ReadonlyArray<string> };
              argHistory.push(cmd.args);
              if (cmd.args[0] === "--list-sessions") {
                const stdout = sessionId
                  ? `Available sessions for this project (1):\n  7. hello [${sessionId}]\n`
                  : "Available sessions for this project (0):\n";
                return Effect.succeed(mockHandle({ stdout, stderr: "", code: 0 }));
              }
              if (cmd.args[0] === "--session-id" && typeof cmd.args[1] === "string") {
                sessionId = cmd.args[1];
              }
              return Effect.succeed(mockHandle({ stdout: "ok\n", stderr: "", code: 0 }));
            }),
          );
          const directoryLayer = Layer.succeed(ProviderSessionDirectory, {
            upsert: () => Effect.void,
            getProvider: () =>
              Effect.die(new Error("ProviderSessionDirectory.getProvider not used in test")),
            getBinding: () => Effect.succeed(Option.none()),
            listThreadIds: () => Effect.succeed([]),
            listBindings: () => Effect.succeed([]),
          });

          const adapter = yield* makeGeminiHeadlessAdapter({
            geminiCli: "gemini",
            environment: {},
            instanceId: ProviderInstanceId.make("gemini"),
          }).pipe(Effect.provide(Layer.mergeAll(spawnerLayer, directoryLayer)));

          const threadId = ThreadId.make("thread-pin-1");
          yield* adapter.startSession({
            threadId,
            runtimeMode: "full-access",
          });

          yield* adapter.sendTurn({
            threadId,
            input: "hello",
            modelSelection: { instanceId: ProviderInstanceId.make("gemini"), model: "m1" },
          });
          yield* adapter.sendTurn({
            threadId,
            input: "again",
            modelSelection: { instanceId: ProviderInstanceId.make("gemini"), model: "m1" },
          });

          const promptArgs = argHistory.filter((args) => args[0] !== "--list-sessions");
          expect(promptArgs).toHaveLength(2);
          expect(promptArgs[0]?.slice(0, 2)).toEqual(["--session-id", expect.any(String)]);
          expect(promptArgs[0]?.[2]).toBe("-m");
          expect(promptArgs[1]?.slice(0, 2)).toEqual(["--resume", "7"]);
        }),
      ),
  );

  effectIt.effect(
    "startSession with persisted ready resumeCursor resolves the stored UUID and resumes its index",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          // Variant nibble in group 4 must be 8/9/a/b per RFC 4122 / `looksLikeUuid` in adapter.
          const sid = "aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee";
          const argHistory: ReadonlyArray<string>[] = [];
          const spawnerLayer = Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make((command) => {
              const cmd = command as unknown as { args: ReadonlyArray<string> };
              argHistory.push(cmd.args);
              if (cmd.args[0] === "--list-sessions") {
                return Effect.succeed(
                  mockHandle({
                    stdout: `Available sessions for this project (1):\n  11. one [${sid}]\n`,
                    stderr: "",
                    code: 0,
                  }),
                );
              }
              return Effect.succeed(mockHandle({ stdout: "hi\n", stderr: "", code: 0 }));
            }),
          );
          const directoryLayer = Layer.succeed(ProviderSessionDirectory, {
            upsert: () => Effect.void,
            getProvider: () =>
              Effect.die(new Error("ProviderSessionDirectory.getProvider not used in test")),
            getBinding: () => Effect.succeed(Option.none()),
            listThreadIds: () => Effect.succeed([]),
            listBindings: () => Effect.succeed([]),
          });

          const adapter = yield* makeGeminiHeadlessAdapter({
            geminiCli: "gemini",
            environment: {},
            instanceId: ProviderInstanceId.make("gemini"),
          }).pipe(Effect.provide(Layer.mergeAll(spawnerLayer, directoryLayer)));

          const threadId = ThreadId.make("thread-resume-1");
          yield* adapter.startSession({
            threadId,
            runtimeMode: "full-access",
            resumeCursor: {
              v: 1,
              geminiHeadlessSessionId: sid,
              geminiHeadlessReady: true,
            },
          });

          yield* adapter.sendTurn({
            threadId,
            input: "one",
            modelSelection: { instanceId: ProviderInstanceId.make("gemini"), model: "m1" },
          });

          const promptArgs = argHistory.filter((args) => args[0] !== "--list-sessions");
          expect(promptArgs).toHaveLength(1);
          expect(promptArgs[0]?.slice(0, 2)).toEqual(["--resume", "11"]);
        }),
      ),
  );

  effectIt.effect("persists resume cursor after first successful turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const upserts: unknown[] = [];
        const spawnerLayer = Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make((command) => {
            const cmd = command as unknown as { args: ReadonlyArray<string> };
            if (cmd.args[0] === "--list-sessions") {
              return Effect.succeed(
                mockHandle({ stdout: "Available sessions for this project (0):\n", stderr: "", code: 0 }),
              );
            }
            return Effect.succeed(mockHandle({ stdout: "done\n", stderr: "", code: 0 }));
          }),
        );
        const directoryLayer = Layer.succeed(ProviderSessionDirectory, {
          upsert: (b) =>
            Effect.sync(() => {
              upserts.push(b.resumeCursor);
            }),
          getProvider: () =>
            Effect.die(new Error("ProviderSessionDirectory.getProvider not used in test")),
          getBinding: () => Effect.succeed(Option.none()),
          listThreadIds: () => Effect.succeed([]),
          listBindings: () => Effect.succeed([]),
        });

        const adapter = yield* makeGeminiHeadlessAdapter({
          geminiCli: "gemini",
          environment: {},
          instanceId: ProviderInstanceId.make("gemini"),
        }).pipe(Effect.provide(Layer.mergeAll(spawnerLayer, directoryLayer)));

        const threadId = ThreadId.make("thread-upsert-1");
        yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
        yield* adapter.sendTurn({
          threadId,
          input: "x",
          modelSelection: { instanceId: ProviderInstanceId.make("gemini"), model: "m1" },
        });

        expect(upserts.length).toBe(1);
        const cursor = upserts[0] as {
          geminiHeadlessSessionId: string;
          geminiHeadlessReady: boolean;
        };
        expect(cursor.geminiHeadlessReady).toBe(true);
        expect(cursor.geminiHeadlessSessionId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      }),
    ),
  );
});
