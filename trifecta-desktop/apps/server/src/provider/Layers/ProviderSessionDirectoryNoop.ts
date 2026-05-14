/**
 * No-op `ProviderSessionDirectory` for CLI entrypoints and tests that run
 * provider registry / driver wiring without SQLite-backed session persistence.
 *
 * @module provider/Layers/ProviderSessionDirectoryNoop
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";

export const ProviderSessionDirectoryNoopLive = Layer.succeed(ProviderSessionDirectory, {
  upsert: () => Effect.void,
  getProvider: () =>
    Effect.die(new Error("ProviderSessionDirectory.getProvider is not used in this noop layer")),
  getBinding: () => Effect.succeed(Option.none()),
  listThreadIds: () => Effect.succeed([]),
  listBindings: () => Effect.succeed([]),
});
