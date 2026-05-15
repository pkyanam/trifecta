/**
 * AcpRegistryDriver — `ProviderDriver` for generic ACP Registry agents.
 *
 * Allows users to connect to any ACP-compatible agent from the ACP Registry
 * (https://agentclientprotocol.com/get-started/registry) or any custom
 * ACP-over-stdio agent. The configured `command` + `commandArgs` are spawned
 * as a subprocess; communication follows JSON-RPC 2.0 (ACP) over stdio.
 *
 * No wire normalization is applied — registry agents are expected to emit
 * spec-compliant JSON. For agents with non-standard wire shapes, consider
 * the dedicated Hermes or Devin drivers which include normalization layers.
 *
 * @module provider/Drivers/AcpRegistryDriver
 */
import { AcpRegistrySettings, ProviderDriverKind, type ServerProvider } from "@belweave/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import { makeAcpRegistryTextGeneration } from "../../textGeneration/AcpRegistryTextGeneration.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeAcpRegistryAdapter } from "../Layers/AcpRegistryAdapter.ts";
import {
  checkAcpRegistryProviderStatus,
  makePendingAcpRegistryProvider,
} from "../Layers/AcpRegistryProvider.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import type { ServerProviderDraft } from "../providerSnapshot.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";

const decodeAcpRegistrySettings = Schema.decodeSync(AcpRegistrySettings);

const DRIVER_KIND = ProviderDriverKind.make("acpRegistry");
const SNAPSHOT_REFRESH_INTERVAL = Duration.minutes(5);

const withInstanceIdentity =
  (input: {
    readonly instanceId: ProviderInstance["instanceId"];
    readonly displayName: string | undefined;
    readonly accentColor: string | undefined;
    readonly continuationGroupKey: string;
  }) =>
  (snapshot: ServerProviderDraft): ServerProvider => ({
    ...snapshot,
    instanceId: input.instanceId,
    driver: DRIVER_KIND,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationGroupKey },
  });

export type AcpRegistryDriverEnv = ChildProcessSpawner.ChildProcessSpawner;

export const AcpRegistryDriver: ProviderDriver<AcpRegistrySettings, AcpRegistryDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "ACP Registry",
    supportsMultipleInstances: true,
  },
  configSchema: AcpRegistrySettings,
  defaultConfig: (): AcpRegistrySettings => decodeAcpRegistrySettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const processEnv = mergeProviderInstanceEnvironment(environment);
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const stampIdentity = withInstanceIdentity({
        instanceId,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      const effectiveConfig = { ...config, enabled } satisfies AcpRegistrySettings;

      const adapter = yield* makeAcpRegistryAdapter(effectiveConfig, {
        instanceId,
        environment: processEnv,
      });

      const textGeneration = yield* makeAcpRegistryTextGeneration(effectiveConfig, processEnv);

      const checkProvider = checkAcpRegistryProviderStatus(effectiveConfig, processEnv).pipe(
        Effect.map(stampIdentity),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );

      const snapshot = yield* makeManagedServerProvider<AcpRegistrySettings>({
        maintenanceCapabilities: makeManualOnlyProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: null,
        }),
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.never,
        haveSettingsChanged: () => false,
        initialSnapshot: (settings) =>
          makePendingAcpRegistryProvider(settings).pipe(Effect.map(stampIdentity)),
        checkProvider,
        enrichSnapshot: ({ snapshot: snap, publishSnapshot }) => publishSnapshot(snap),
        refreshInterval: SNAPSHOT_REFRESH_INTERVAL,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build ACP Registry snapshot: ${cause.message ?? String(cause)}`,
              cause,
            }),
        ),
      );

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        adapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
