import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as NetService from "@belweave/shared/Net";
import * as DesktopBackendPort from "./DesktopBackendPort.ts";

function netServiceLayer(
  canListen: (port: number, host: string) => boolean,
): Layer.Layer<NetService.NetService> {
  return Layer.succeed(
    NetService.NetService,
    NetService.NetService.of({
      canListenOnHost: (port, host) => Effect.succeed(canListen(port, host)),
      isPortAvailableOnLoopback: () => Effect.succeed(false),
      reserveLoopbackPort: () => Effect.succeed(0),
      findAvailablePort: (preferred) => Effect.succeed(preferred),
    }),
  );
}

describe("DesktopBackendPort", () => {
  it.effect("uses configured port when env var is set", () =>
    Effect.gen(function* () {
      const persistedPorts: number[] = [];
      const result = yield* DesktopBackendPort.resolveDesktopBackendPort(
        Option.some(4888),
        Option.none(),
        (port) => Effect.sync(() => persistedPorts.push(port)),
      );
      assert.equal(result.port, 4888);
      assert.isFalse(result.selectedByScan);
      assert.deepEqual(persistedPorts, []);
    }).pipe(Effect.provide(netServiceLayer(() => false))),
  );

  it.effect("uses persisted port when available on every host", () =>
    Effect.gen(function* () {
      const persistedPorts: number[] = [];
      const result = yield* DesktopBackendPort.resolveDesktopBackendPort(
        Option.none(),
        Option.some(4888),
        (port) => Effect.sync(() => persistedPorts.push(port)),
      );
      assert.equal(result.port, 4888);
      assert.isFalse(result.selectedByScan);
      assert.deepEqual(persistedPorts, []);
    }).pipe(Effect.provide(netServiceLayer(() => true))),
  );

  it.effect("falls back to scan when persisted port is unavailable on some host", () =>
    Effect.gen(function* () {
      const persistedPorts: number[] = [];
      const result = yield* DesktopBackendPort.resolveDesktopBackendPort(
        Option.none(),
        Option.some(4888),
        (port) => Effect.sync(() => persistedPorts.push(port)),
      );
      assert.equal(result.port, 3773);
      assert.isTrue(result.selectedByScan);
      assert.deepEqual(persistedPorts, [3773]);
    }).pipe(
      Effect.provide(
        netServiceLayer((port, host) => port === 3773 || (port === 4888 && host === "127.0.0.1")),
      ),
    ),
  );

  it.effect("scans and persists a new port when no persisted port exists", () =>
    Effect.gen(function* () {
      const persistedPorts: number[] = [];
      const result = yield* DesktopBackendPort.resolveDesktopBackendPort(
        Option.none(),
        Option.none(),
        (port) => Effect.sync(() => persistedPorts.push(port)),
      );
      assert.equal(result.port, 3773);
      assert.isTrue(result.selectedByScan);
      assert.deepEqual(persistedPorts, [3773]);
    }).pipe(Effect.provide(netServiceLayer((port) => port === 3773))),
  );

  it.effect("skips unavailable ports when scanning", () =>
    Effect.gen(function* () {
      const persistedPorts: number[] = [];
      const result = yield* DesktopBackendPort.resolveDesktopBackendPort(
        Option.none(),
        Option.none(),
        (port) => Effect.sync(() => persistedPorts.push(port)),
      );
      assert.equal(result.port, 3775);
      assert.isTrue(result.selectedByScan);
      assert.deepEqual(persistedPorts, [3775]);
    }).pipe(Effect.provide(netServiceLayer((port) => port === 3775))),
  );

  it.effect("fails when no port is available", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        DesktopBackendPort.resolveDesktopBackendPort(
          Option.none(),
          Option.none(),
          () => Effect.void,
        ),
      );
      assert.isTrue(Exit.isFailure(exit));
    }).pipe(Effect.provide(netServiceLayer(() => false))),
  );
});
