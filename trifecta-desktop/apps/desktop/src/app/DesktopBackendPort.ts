import * as Effect from "effect/Effect";
import * as NetService from "@belweave/shared/Net";
import * as Option from "effect/Option";
import * as Data from "effect/Data";

export const DEFAULT_DESKTOP_BACKEND_PORT = 3773;
const MAX_TCP_PORT = 65_535;
const DESKTOP_BACKEND_PORT_PROBE_HOSTS = ["127.0.0.1", "0.0.0.0", "::"] as const;

export class DesktopBackendPortUnavailableError extends Data.TaggedError(
  "DesktopBackendPortUnavailableError",
)<{
  readonly startPort: number;
  readonly maxPort: number;
  readonly hosts: readonly string[];
}> {
  override get message() {
    return `No desktop backend port is available on hosts ${this.hosts.join(", ")} between ${this.startPort} and ${this.maxPort}.`;
  }
}

export interface DesktopBackendPortSelection {
  readonly port: number;
  readonly selectedByScan: boolean;
}

export const resolveDesktopBackendPort = Effect.fn("resolveDesktopBackendPort")(function* (
  configuredPort: Option.Option<number>,
  persistedPort: Option.Option<number>,
  persistPort: (port: number) => Effect.Effect<void>,
) {
  if (Option.isSome(configuredPort)) {
    return {
      port: configuredPort.value,
      selectedByScan: false,
    } satisfies DesktopBackendPortSelection;
  }

  const net = yield* NetService.NetService;
  const canListenOnEveryHost = (port: number) =>
    Effect.gen(function* () {
      for (const host of DESKTOP_BACKEND_PORT_PROBE_HOSTS) {
        if (!(yield* net.canListenOnHost(port, host))) {
          return false;
        }
      }
      return true;
    });

  if (Option.isSome(persistedPort) && (yield* canListenOnEveryHost(persistedPort.value))) {
    return {
      port: persistedPort.value,
      selectedByScan: false,
    } satisfies DesktopBackendPortSelection;
  }

  for (let port = DEFAULT_DESKTOP_BACKEND_PORT; port <= MAX_TCP_PORT; port += 1) {
    if (Option.isSome(persistedPort) && port === persistedPort.value) continue;
    if (yield* canListenOnEveryHost(port)) {
      yield* persistPort(port);
      return {
        port,
        selectedByScan: true,
      } satisfies DesktopBackendPortSelection;
    }
  }

  return yield* new DesktopBackendPortUnavailableError({
    startPort: DEFAULT_DESKTOP_BACKEND_PORT,
    maxPort: MAX_TCP_PORT,
    hosts: DESKTOP_BACKEND_PORT_PROBE_HOSTS,
  });
});
