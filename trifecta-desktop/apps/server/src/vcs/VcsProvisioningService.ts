import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  type VcsDriverKind,
  type VcsError,
  type VcsInitInput,
  VcsUnsupportedOperationError,
} from "@belweave/contracts";
import * as VcsDriverRegistry from "./VcsDriverRegistry.ts";
import { AnalyticsService } from "../telemetry/Services/AnalyticsService.ts";

export interface VcsProvisioningServiceShape {
  readonly initRepository: (input: VcsInitInput) => Effect.Effect<void, VcsError>;
}

export class VcsProvisioningService extends Context.Service<
  VcsProvisioningService,
  VcsProvisioningServiceShape
>()("belweave/vcs/VcsProvisioningService") {}

function resolveRequestedKind(
  kind: VcsDriverKind | undefined,
): Effect.Effect<VcsDriverKind, VcsUnsupportedOperationError> {
  if (kind === undefined) {
    return Effect.succeed("git");
  }
  if (kind === "unknown") {
    return Effect.fail(
      new VcsUnsupportedOperationError({
        operation: "VcsProvisioningService.resolveRequestedKind",
        kind,
        detail: "A concrete VCS driver kind is required for repository provisioning.",
      }),
    );
  }
  return Effect.succeed(kind);
}

export const make = Effect.fn("makeVcsProvisioningService")(function* () {
  const registry = yield* VcsDriverRegistry.VcsDriverRegistry;
  const analytics = yield* AnalyticsService;

  const initRepository: VcsProvisioningServiceShape["initRepository"] = Effect.fn(
    "VcsProvisioningService.initRepository",
  )(function* (input) {
    const kind = yield* resolveRequestedKind(input.kind);
    const driver = yield* registry.get(kind);
    yield* driver.initRepository(input);
    yield* analytics.record("vcs.repository.initialized", {
      kind,
      cwd: input.cwd,
    });
  });

  return VcsProvisioningService.of({
    initRepository,
  });
});

export const layer = Layer.effect(VcsProvisioningService, make());
