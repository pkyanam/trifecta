/**
 * Best-effort CLI warm-up before first ACP stdio session: runs `<command> --version`
 * so the OS / loader touches the binary (and for Node-based CLIs, often warms the
 * runtime) without starting an ACP server.
 *
 * @module provider/acp/warmCliBinary
 */
import * as Effect from "effect/Effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { collectUint8StreamText } from "../../stream/collectUint8StreamText.ts";

const WARM_TIMEOUT_MS = 25_000;
const MAX_WARM_OUTPUT_BYTES = 32 * 1024;

export const warmSpawnCommandForAcpAgent = (command: string, environment?: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, ["--version"], {
        cwd: process.cwd(),
        env: environment ?? process.env,
        shell: process.platform === "win32",
        stdin: "ignore",
      }),
    );
    yield* Effect.all(
      [
        collectUint8StreamText({
          stream: child.stdout,
          maxBytes: MAX_WARM_OUTPUT_BYTES,
          truncatedMarker: "",
        }),
        collectUint8StreamText({
          stream: child.stderr,
          maxBytes: MAX_WARM_OUTPUT_BYTES,
          truncatedMarker: "",
        }),
        child.exitCode,
      ],
      { concurrency: "unbounded" },
    );
  }).pipe(Effect.scoped, Effect.timeout(WARM_TIMEOUT_MS), Effect.ignore);

/**
 * Forks a detached fiber that runs `command --version` (ignored result).
 * Does not block provider startup beyond scheduling the fiber.
 */
export const forkWarmSpawnCommandForAcpAgent = (
  command: string,
  environment?: NodeJS.ProcessEnv,
): Effect.Effect<void, never, ChildProcessSpawner.ChildProcessSpawner> =>
  warmSpawnCommandForAcpAgent(command, environment).pipe(Effect.forkDetach, Effect.asVoid);
