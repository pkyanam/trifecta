import type { ServerProvider } from "@belweave/contracts";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as Semaphore from "effect/Semaphore";

import type { ServerProviderShape } from "./Services/ServerProvider.ts";
import { ServerSettingsError } from "@belweave/contracts";

interface ProviderSnapshotState {
  readonly snapshot: ServerProvider;
  readonly enrichmentGeneration: number;
}

interface RefreshClaim {
  readonly activeRefresh: Deferred.Deferred<ServerProvider, ServerSettingsError>;
  readonly ownsRefresh: boolean;
}

const MIN_BACKGROUND_REFRESH_INTERVAL = Duration.minutes(30);

const settleRefresh = (
  deferred: Deferred.Deferred<ServerProvider, ServerSettingsError>,
  exit: Exit.Exit<ServerProvider, ServerSettingsError>,
) =>
  Exit.isSuccess(exit)
    ? Deferred.succeed(deferred, exit.value)
    : Deferred.failCause(deferred, exit.cause);

export const makeManagedServerProvider = Effect.fn("makeManagedServerProvider")(function* <
  Settings,
>(input: {
  readonly maintenanceCapabilities: ServerProviderShape["maintenanceCapabilities"];
  readonly getSettings: Effect.Effect<Settings>;
  readonly streamSettings: Stream.Stream<Settings>;
  readonly haveSettingsChanged: (previous: Settings, next: Settings) => boolean;
  readonly initialSnapshot: (settings: Settings) => Effect.Effect<ServerProvider>;
  readonly checkProvider: Effect.Effect<ServerProvider, ServerSettingsError>;
  readonly enrichSnapshot?: (input: {
    readonly settings: Settings;
    readonly snapshot: ServerProvider;
    readonly getSnapshot: Effect.Effect<ServerProvider>;
    readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  }) => Effect.Effect<void>;
  readonly refreshInterval?: Duration.Input;
}): Effect.fn.Return<ServerProviderShape, ServerSettingsError, Scope.Scope> {
  const refreshSemaphore = yield* Semaphore.make(1);
  const changesPubSub = yield* Effect.acquireRelease(
    PubSub.unbounded<ServerProvider>(),
    PubSub.shutdown,
  );
  const initialSettings = yield* input.getSettings;
  const initialSnapshot = yield* input.initialSnapshot(initialSettings);
  const snapshotStateRef = yield* Ref.make<ProviderSnapshotState>({
    snapshot: initialSnapshot,
    enrichmentGeneration: 0,
  });
  const settingsRef = yield* Ref.make(initialSettings);
  const enrichmentFiberRef = yield* Ref.make<Fiber.Fiber<void, unknown> | null>(null);
  const refreshInFlightRef =
    yield* Ref.make<Deferred.Deferred<ServerProvider, ServerSettingsError> | null>(null);
  const scope = yield* Effect.scope;

  const publishEnrichedSnapshot = Effect.fn("publishEnrichedSnapshot")(function* (
    generation: number,
    nextSnapshot: ServerProvider,
  ) {
    const snapshotToPublish = yield* Ref.modify(snapshotStateRef, (state) => {
      if (state.enrichmentGeneration !== generation || Equal.equals(state.snapshot, nextSnapshot)) {
        return [null, state] as const;
      }
      return [
        nextSnapshot,
        {
          ...state,
          snapshot: nextSnapshot,
        },
      ] as const;
    });
    if (snapshotToPublish === null) {
      return;
    }
    yield* PubSub.publish(changesPubSub, snapshotToPublish);
  });

  const restartSnapshotEnrichment = Effect.fn("restartSnapshotEnrichment")(function* (
    settings: Settings,
    snapshot: ServerProvider,
    generation: number,
  ) {
    const previousFiber = yield* Ref.getAndSet(enrichmentFiberRef, null);
    if (previousFiber) {
      yield* Fiber.interrupt(previousFiber).pipe(Effect.ignore);
    }

    if (!input.enrichSnapshot) {
      return;
    }

    const fiber = yield* input
      .enrichSnapshot({
        settings,
        snapshot,
        getSnapshot: Ref.get(snapshotStateRef).pipe(Effect.map((state) => state.snapshot)),
        publishSnapshot: (nextSnapshot) => publishEnrichedSnapshot(generation, nextSnapshot),
      })
      .pipe(Effect.ignoreCause({ log: true }), Effect.forkIn(scope));

    yield* Ref.set(enrichmentFiberRef, fiber);
  });

  const applySnapshotBase = Effect.fn("applySnapshot")(function* (
    nextSettings: Settings,
    options?: { readonly forceRefresh?: boolean },
  ) {
    const forceRefresh = options?.forceRefresh === true;
    const previousSettings = yield* Ref.get(settingsRef);
    if (!forceRefresh && !input.haveSettingsChanged(previousSettings, nextSettings)) {
      yield* Ref.set(settingsRef, nextSettings);
      return yield* Ref.get(snapshotStateRef).pipe(Effect.map((state) => state.snapshot));
    }

    const nextSnapshot = yield* input.checkProvider;
    const nextGeneration = yield* Ref.modify(snapshotStateRef, (state) => {
      const generation = input.enrichSnapshot
        ? state.enrichmentGeneration + 1
        : state.enrichmentGeneration;
      return [
        generation,
        {
          snapshot: nextSnapshot,
          enrichmentGeneration: generation,
        },
      ] as const;
    });
    yield* Ref.set(settingsRef, nextSettings);
    yield* PubSub.publish(changesPubSub, nextSnapshot);
    yield* restartSnapshotEnrichment(nextSettings, nextSnapshot, nextGeneration);
    return nextSnapshot;
  });
  const applySnapshot = (nextSettings: Settings, options?: { readonly forceRefresh?: boolean }) =>
    refreshSemaphore.withPermits(1)(applySnapshotBase(nextSettings, options));

  const refreshSnapshotBase: Effect.Effect<ServerProvider, ServerSettingsError> = Effect.gen(
    function* () {
      const nextSettings = yield* input.getSettings;
      return yield* applySnapshot(nextSettings, { forceRefresh: true });
    },
  );

  const refreshSnapshot = Effect.fn("refreshSnapshot")(function* () {
    const deferred = yield* Deferred.make<ServerProvider, ServerSettingsError>();
    const claim = yield* Ref.modify(refreshInFlightRef, (current): readonly [
      RefreshClaim,
      Deferred.Deferred<ServerProvider, ServerSettingsError> | null,
    ] => {
      if (current !== null) {
        return [{ activeRefresh: current, ownsRefresh: false }, current] as const;
      }
      return [{ activeRefresh: deferred, ownsRefresh: true }, deferred] as const;
    });

    if (!claim.ownsRefresh) {
      return yield* Deferred.await(claim.activeRefresh);
    }

    const exit = yield* Effect.exit(refreshSnapshotBase);
    yield* settleRefresh(deferred, exit).pipe(Effect.ignore);
    yield* Ref.set(refreshInFlightRef, null);
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    return yield* Effect.failCause(exit.cause);
  });

  yield* Stream.runForEach(input.streamSettings, (nextSettings) =>
    Effect.asVoid(applySnapshot(nextSettings)),
  ).pipe(Effect.forkScoped);

  const backgroundRefreshInterval = Duration.millis(
    Math.max(
      Duration.toMillis(Duration.fromInputUnsafe(input.refreshInterval ?? "60 seconds")),
      Duration.toMillis(MIN_BACKGROUND_REFRESH_INTERVAL),
    ),
  );

  yield* Effect.forever(
    Effect.sleep(backgroundRefreshInterval).pipe(
      Effect.flatMap(() => refreshSnapshot()),
      Effect.ignoreCause({ log: true }),
    ),
  ).pipe(Effect.forkScoped);

  return {
    maintenanceCapabilities: input.maintenanceCapabilities,
    getSnapshot: Ref.get(snapshotStateRef).pipe(Effect.map((state) => state.snapshot)),
    refresh: refreshSnapshot().pipe(Effect.tapError(Effect.logError), Effect.orDie),
    get streamChanges() {
      return Stream.fromPubSub(changesPubSub);
    },
  } satisfies ServerProviderShape;
});
