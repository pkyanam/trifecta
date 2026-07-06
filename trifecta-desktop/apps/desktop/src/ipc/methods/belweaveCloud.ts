import { BelweaveCloudConfigSchema } from "@belweave/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as DesktopBelweaveCloud from "../../settings/DesktopBelweaveCloud.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

const NonBlankString = Schema.String.check(
  Schema.makeFilter((value) =>
    value.trim().length > 0 ? undefined : "Expected a non-empty string",
  ),
);

export const getBelweaveCloudConfig = makeIpcMethod({
  channel: IpcChannels.GET_BELWEAVE_CLOUD_CONFIG_CHANNEL,
  payload: Schema.Void,
  result: BelweaveCloudConfigSchema,
  handler: Effect.fn("desktop.ipc.belweaveCloud.getConfig")(function* () {
    const belweaveCloud = yield* DesktopBelweaveCloud.DesktopBelweaveCloud;
    return yield* belweaveCloud.getConfig;
  }),
});

export const setBelweaveCloudConfig = makeIpcMethod({
  channel: IpcChannels.SET_BELWEAVE_CLOUD_CONFIG_CHANNEL,
  payload: BelweaveCloudConfigSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.belweaveCloud.setConfig")(function* (config) {
    const belweaveCloud = yield* DesktopBelweaveCloud.DesktopBelweaveCloud;
    yield* belweaveCloud.setConfig(config);
  }),
});

export const getBelweaveCloudApiKey = makeIpcMethod({
  channel: IpcChannels.GET_BELWEAVE_CLOUD_API_KEY_CHANNEL,
  payload: Schema.Void,
  result: Schema.NullOr(Schema.String),
  handler: Effect.fn("desktop.ipc.belweaveCloud.getApiKey")(function* () {
    const belweaveCloud = yield* DesktopBelweaveCloud.DesktopBelweaveCloud;
    return Option.getOrNull(yield* belweaveCloud.getApiKey);
  }),
});

export const setBelweaveCloudApiKey = makeIpcMethod({
  channel: IpcChannels.SET_BELWEAVE_CLOUD_API_KEY_CHANNEL,
  payload: NonBlankString,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.belweaveCloud.setApiKey")(function* (apiKey) {
    const belweaveCloud = yield* DesktopBelweaveCloud.DesktopBelweaveCloud;
    return yield* belweaveCloud.setApiKey(apiKey);
  }),
});

export const removeBelweaveCloudApiKey = makeIpcMethod({
  channel: IpcChannels.REMOVE_BELWEAVE_CLOUD_API_KEY_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.belweaveCloud.removeApiKey")(function* () {
    const belweaveCloud = yield* DesktopBelweaveCloud.DesktopBelweaveCloud;
    yield* belweaveCloud.removeApiKey;
  }),
});
