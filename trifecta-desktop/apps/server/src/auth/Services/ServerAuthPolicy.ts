import type { ServerAuthDescriptor } from "@belweave/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface ServerAuthPolicyShape {
  readonly getDescriptor: () => Effect.Effect<ServerAuthDescriptor>;
}

export class ServerAuthPolicy extends Context.Service<ServerAuthPolicy, ServerAuthPolicyShape>()(
  "belweave/auth/Services/ServerAuthPolicy",
) {}
