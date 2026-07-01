// @effect-diagnostics nodeBuiltinImport:off
import * as path from "node:path";
import * as os from "node:os";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  DevinSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  ThreadId,
} from "@belweave/contracts";

import { ServerConfig } from "../../config.ts";
import { makeDevinAdapter } from "./DevinAdapter.ts";

const decodeDevinSettings = Schema.decodeSync(DevinSettings);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockAgentPath = path.join(__dirname, "../../../scripts/acp-mock-agent.ts");
const bunExe = "bun";

const DEVIN_INSTANCE = ProviderInstanceId.make("devinAgent");
const DEVIN_PROVIDER = ProviderDriverKind.make("devinAgent");

/** Build a shell wrapper that execs the mock ACP agent with the given env. */
async function makeMockAgentWrapper(extraEnv?: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "devin-acp-mock-"));
  const wrapperPath = path.join(dir, "fake-devin.sh");
  const envExports = Object.entries(extraEnv ?? {})
    .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
    .join("\n");
  const script = `#!/bin/sh
${envExports}
exec ${JSON.stringify(bunExe)} ${JSON.stringify(mockAgentPath)} "$@"
`;
  await writeFile(wrapperPath, script, "utf8");
  await chmod(wrapperPath, 0o755);
  return wrapperPath;
}

// Provided per test (rather than via `it.layer`) so tests can run on the live
// clock — the turn watchdog relies on real time advancing, which the default
// `it.effect` TestClock does not do.
const TestServices = ServerConfig.layerTest(process.cwd(), {
  prefix: "belweave-devin-adapter-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));

/** Collect runtime events for a thread into a growing array. */
const collectEvents = (
  adapter: { readonly streamEvents: Stream.Stream<ProviderRuntimeEvent, never> },
  sink: Array<ProviderRuntimeEvent>,
) =>
  Stream.runForEach(adapter.streamEvents, (event) =>
    Effect.sync(() => {
      sink.push(event);
    }),
  ).pipe(Effect.forkChild);

/** Poll until `predicate` matches a collected event, or fail after a budget. */
const waitForEvent = (
  events: ReadonlyArray<ProviderRuntimeEvent>,
  predicate: (event: ProviderRuntimeEvent) => boolean,
  label: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (events.some(predicate)) return;
      yield* Effect.sleep("10 millis");
    }
    return yield* Effect.die(new Error(`Timed out waiting for event: ${label}`));
  });

describe("DevinAdapter turn lifecycle", () => {
  it.live("completes a normal turn and emits turn.completed", () =>
    Effect.gen(function* () {
      const wrapperPath = yield* Effect.promise(() => makeMockAgentWrapper());
      const adapter = yield* makeDevinAdapter(
        decodeDevinSettings({ enabled: true, binaryPath: wrapperPath }),
      );
      const threadId = ThreadId.make("devin-normal-turn");
      const events: Array<ProviderRuntimeEvent> = [];
      yield* collectEvents(adapter, events);

      yield* adapter.startSession({
        threadId,
        provider: DEVIN_PROVIDER,
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: { instanceId: DEVIN_INSTANCE, model: "default" },
      });

      yield* adapter.sendTurn({ threadId, input: "hello devin", attachments: [] });

      const completed = events.find((e) => e.type === "turn.completed");
      assert.isDefined(completed);
      if (completed?.type === "turn.completed") {
        assert.equal(completed.payload.state, "completed");
      }
      // A healthy turn must NOT tear the session down.
      assert.isUndefined(events.find((e) => e.type === "session.exited"));

      yield* adapter.stopSession(threadId);
    }).pipe(Effect.scoped, Effect.provide(TestServices)),
  );

  it.live("force-ends and tears down a turn that goes idle past the watchdog timeout", () =>
    Effect.gen(function* () {
      const wrapperPath = yield* Effect.promise(() =>
        makeMockAgentWrapper({
          BELWEAVE_ACP_HANG_PROMPT: "1",
          BELWEAVE_ACP_STDERR_PREAMBLE: "devin-harness-panic",
        }),
      );
      const adapter = yield* makeDevinAdapter(
        decodeDevinSettings({ enabled: true, binaryPath: wrapperPath }),
        { turnTimeouts: { idleTimeoutMs: 150, watchdogTickMs: 20, interruptGraceMs: 60_000 } },
      );
      const threadId = ThreadId.make("devin-idle-timeout");
      const events: Array<ProviderRuntimeEvent> = [];
      yield* collectEvents(adapter, events);

      yield* adapter.startSession({
        threadId,
        provider: DEVIN_PROVIDER,
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: { instanceId: DEVIN_INSTANCE, model: "default" },
      });

      // sendTurn blocks until the idle watchdog force-ends the turn.
      yield* adapter.sendTurn({ threadId, input: "work forever", attachments: [] });

      const runtimeError = events.find((e) => e.type === "runtime.error");
      assert.isDefined(runtimeError);
      if (runtimeError?.type === "runtime.error") {
        assert.match(runtimeError.payload.message, /no activity/i);
        // The stderr tail (Triangle port) explains why Devin stalled.
        assert.include(runtimeError.payload.message, "devin-harness-panic");
      }

      const completed = events.find((e) => e.type === "turn.completed");
      assert.isDefined(completed);
      if (completed?.type === "turn.completed") {
        assert.equal(completed.payload.state, "failed");
      }
      assert.isDefined(events.find((e) => e.type === "session.exited"));
      assert.isFalse(yield* adapter.hasSession(threadId));
    }).pipe(Effect.scoped, Effect.provide(TestServices)),
  );

  it.live("force-ends and tears down when Devin ignores the interrupt past the grace window", () =>
    Effect.gen(function* () {
      const wrapperPath = yield* Effect.promise(() =>
        makeMockAgentWrapper({ BELWEAVE_ACP_HANG_PROMPT: "1" }),
      );
      const adapter = yield* makeDevinAdapter(
        decodeDevinSettings({ enabled: true, binaryPath: wrapperPath }),
        { turnTimeouts: { idleTimeoutMs: 60_000, watchdogTickMs: 20, interruptGraceMs: 100 } },
      );
      const threadId = ThreadId.make("devin-force-interrupt");
      const events: Array<ProviderRuntimeEvent> = [];
      yield* collectEvents(adapter, events);

      yield* adapter.startSession({
        threadId,
        provider: DEVIN_PROVIDER,
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: { instanceId: DEVIN_INSTANCE, model: "default" },
      });

      const turnFiber = yield* adapter
        .sendTurn({ threadId, input: "ignore my cancel", attachments: [] })
        .pipe(Effect.forkChild);

      yield* waitForEvent(events, (e) => e.type === "turn.started", "turn.started");
      yield* adapter.interruptTurn(threadId);

      yield* Fiber.join(turnFiber);

      const completed = events.find((e) => e.type === "turn.completed");
      assert.isDefined(completed);
      if (completed?.type === "turn.completed") {
        assert.equal(completed.payload.state, "interrupted");
      }
      assert.isDefined(events.find((e) => e.type === "session.exited"));
    }).pipe(Effect.scoped, Effect.provide(TestServices)),
  );

  it.live("completes gracefully when Devin honours the soft cancel within the grace window", () =>
    Effect.gen(function* () {
      const wrapperPath = yield* Effect.promise(() =>
        makeMockAgentWrapper({ BELWEAVE_ACP_HANG_UNTIL_CANCEL: "1" }),
      );
      const adapter = yield* makeDevinAdapter(
        decodeDevinSettings({ enabled: true, binaryPath: wrapperPath }),
        { turnTimeouts: { idleTimeoutMs: 60_000, watchdogTickMs: 20, interruptGraceMs: 5_000 } },
      );
      const threadId = ThreadId.make("devin-soft-cancel");
      const events: Array<ProviderRuntimeEvent> = [];
      yield* collectEvents(adapter, events);

      yield* adapter.startSession({
        threadId,
        provider: DEVIN_PROVIDER,
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: { instanceId: DEVIN_INSTANCE, model: "default" },
      });

      const turnFiber = yield* adapter
        .sendTurn({ threadId, input: "cancel me politely", attachments: [] })
        .pipe(Effect.forkChild);

      yield* waitForEvent(events, (e) => e.type === "turn.started", "turn.started");
      yield* adapter.interruptTurn(threadId);

      yield* Fiber.join(turnFiber);

      const completed = events.find((e) => e.type === "turn.completed");
      assert.isDefined(completed);
      if (completed?.type === "turn.completed") {
        assert.equal(completed.payload.state, "cancelled");
      }
      // A graceful soft-cancel keeps the session alive (resumable) — no teardown.
      assert.isUndefined(events.find((e) => e.type === "session.exited"));
      assert.isTrue(yield* adapter.hasSession(threadId));

      yield* adapter.stopSession(threadId);
    }).pipe(Effect.scoped, Effect.provide(TestServices)),
  );
});
