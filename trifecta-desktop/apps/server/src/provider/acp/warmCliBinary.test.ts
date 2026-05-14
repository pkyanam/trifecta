import * as NodeServices from "@effect/platform-node/NodeServices";
import * as assert from "node:assert/strict";
import { it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { forkWarmSpawnCommandForAcpAgent, warmSpawnCommandForAcpAgent } from "./warmCliBinary.ts";

it.layer(NodeServices.layer)("warmCliBinary", (it) => {
  it.effect("warmSpawnCommandForAcpAgent completes for node --version", () =>
    Effect.gen(function* () {
      yield* warmSpawnCommandForAcpAgent(process.execPath, process.env);
      yield* Effect.void;
    }),
  );

  it.effect("forkWarmSpawnCommandForAcpAgent returns promptly", () =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      yield* forkWarmSpawnCommandForAcpAgent(process.execPath, process.env);
      const ended = yield* Clock.currentTimeMillis;
      assert.ok(ended - started < 2_000, "forkDetach should return without waiting for warm");
    }),
  );
});
