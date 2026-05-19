import {
  AdvertisedEndpoint,
  DesktopServerExposureModeSchema,
  DesktopServerExposureStateSchema,
} from "@belweave/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import * as DesktopLifecycle from "../../app/DesktopLifecycle.ts";
import * as DesktopServerExposure from "../../backend/DesktopServerExposure.ts";
import * as WindowsFirewall from "../../backend/WindowsFirewall.ts";
import * as ElectronDialog from "../../electron/ElectronDialog.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

/**
 * On Windows, the desktop server only becomes reachable from other LAN devices
 * after Windows Defender Firewall has an inbound allow rule for our exe.
 * Without the rule, the bind to 0.0.0.0 succeeds but inbound TCP is dropped,
 * which looks identical to "the iPhone can't see the server" from the user's
 * side. Run on first toggle-on of network-accessible mode.
 */
const maybeOfferWindowsFirewallRule = Effect.fn(
  "desktop.ipc.serverExposure.maybeOfferWindowsFirewallRule",
)(function* () {
  const firewall = yield* WindowsFirewall.WindowsFirewall;
  if (!firewall.isSupportedPlatform) {
    return;
  }
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  // In dev the host process is node/electron from the repo, so adding a
  // permanent firewall rule for it is the wrong scope. Skip.
  if (environment.isDevelopment || !environment.isPackaged) {
    return;
  }

  const programPath = process.execPath;
  const exists = yield* firewall.ruleExists({ programPath }).pipe(
    // ruleExists shouldn't ever surface as a user-facing failure — fall through
    // to the prompt and let the add attempt produce the actionable error.
    Effect.catch(() => Effect.succeed(false)),
  );
  if (exists) {
    return;
  }

  const dialog = yield* ElectronDialog.ElectronDialog;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const owner = yield* electronWindow.focusedMainOrFirst;
  const confirmed = yield* dialog.confirm({
    owner,
    message:
      "Allow Trifecta through Windows Firewall?\n\n" +
      "Network Access lets other devices on your LAN pair with this Trifecta server. " +
      "Windows blocks incoming connections by default, so without a firewall exception " +
      "your phone won't be able to reach this machine even though the server is running.\n\n" +
      "Click Yes to add the rule (Windows will ask for admin permission once).",
  });
  if (!confirmed) {
    return;
  }

  yield* firewall
    .addRule({ programPath })
    .pipe(
      Effect.catchTag("WindowsFirewallError", (error) =>
        dialog
          .showErrorBox(
            "Couldn't add Windows Firewall rule",
            `${error.message}\n\n` +
              `You can still add the rule manually: open Windows Defender Firewall → Advanced settings → ` +
              `Inbound Rules → New Rule, choose "Program", and point it at:\n${programPath}`,
          )
          .pipe(Effect.asVoid),
      ),
    );
});

const SetTailscaleServeEnabledInput = Schema.Struct({
  enabled: Schema.Boolean,
  port: Schema.optionalKey(Schema.Number),
});

export const getServerExposureState = makeIpcMethod({
  channel: IpcChannels.GET_SERVER_EXPOSURE_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.getState")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.getState;
  }),
});

export const setServerExposureMode = makeIpcMethod({
  channel: IpcChannels.SET_SERVER_EXPOSURE_MODE_CHANNEL,
  payload: DesktopServerExposureModeSchema,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.setMode")(function* (mode) {
    const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.setMode(mode);
    if (change.requiresRelaunch) {
      // Offer the firewall rule before relaunching so the backend comes back
      // up into a network where it's actually reachable. Safe to no-op on
      // non-Windows / dev / already-installed.
      if (mode === "network-accessible") {
        yield* maybeOfferWindowsFirewallRule();
      }
      yield* lifecycle.relaunch(`serverExposureMode=${mode}`);
    }
    return change.state;
  }),
});

export const setTailscaleServeEnabled = makeIpcMethod({
  channel: IpcChannels.SET_TAILSCALE_SERVE_ENABLED_CHANNEL,
  payload: SetTailscaleServeEnabledInput,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.setTailscaleServeEnabled")(function* (input) {
    const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.setTailscaleServeEnabled(input);
    if (change.requiresRelaunch) {
      yield* lifecycle.relaunch(
        change.state.tailscaleServeEnabled ? "tailscale-serve-enabled" : "tailscale-serve-disabled",
      );
    }
    return change.state;
  }),
});

export const getAdvertisedEndpoints = makeIpcMethod({
  channel: IpcChannels.GET_ADVERTISED_ENDPOINTS_CHANNEL,
  payload: Schema.Void,
  result: Schema.Array(AdvertisedEndpoint),
  handler: Effect.fn("desktop.ipc.serverExposure.getAdvertisedEndpoints")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.getAdvertisedEndpoints;
  }),
});
