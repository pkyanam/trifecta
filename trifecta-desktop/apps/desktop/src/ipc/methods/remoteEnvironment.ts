import { DesktopRemoteJsonRequestSchema } from "@belweave/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";
import * as DesktopRemoteApi from "../../remote/DesktopRemoteApi.ts";
import { resolveBoxWebSocketUrl } from "../../remote/BoxWsProxy.ts";

export const fetchRemoteJson = makeIpcMethod({
  channel: IpcChannels.FETCH_REMOTE_JSON_CHANNEL,
  payload: DesktopRemoteJsonRequestSchema,
  result: Schema.Unknown,
  handler: (input) => Effect.promise(() => DesktopRemoteApi.fetchRemoteJson(input)),
});

const ResolveBoxWebSocketUrlRequestSchema = Schema.Struct({
  wsBaseUrl: Schema.String,
});

export const resolveBoxWebSocketUrlMethod = makeIpcMethod({
  channel: IpcChannels.RESOLVE_BOX_WEB_SOCKET_URL_CHANNEL,
  payload: ResolveBoxWebSocketUrlRequestSchema,
  result: Schema.String,
  handler: (input) => Effect.promise(() => resolveBoxWebSocketUrl(input.wsBaseUrl)),
});
