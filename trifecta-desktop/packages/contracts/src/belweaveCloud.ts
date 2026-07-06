import * as Schema from "effect/Schema";

import { EnvironmentId } from "./baseSchemas.ts";

/**
 * Contracts for the Belweave Cloud public API (first-party sandbox control
 * plane) and for the desktop-side persisted configuration Trifecta keeps to
 * talk to it.
 *
 * The public API deliberately hides the underlying sandbox provider. Trifecta
 * only ever sees provider-neutral "Belweave Cloud sandbox" concepts, so nothing
 * in here references or exposes backend provider names, IDs, URLs, or tokens.
 */

/** Provider-neutral capability tiers exposed by Belweave Cloud. */
export const BelweaveCloudTierSchema = Schema.Literals(["free", "standard", "plus"]);
export type BelweaveCloudTier = typeof BelweaveCloudTierSchema.Type;

/**
 * Sandbox lifecycle state. Kept as an open string because Belweave mirrors
 * provider states (e.g. `ready`, `idle`, `running`, `provisioning`,
 * `archiving`, `archived`, `error`) and may add more over time.
 */
export const BelweaveCloudSandboxStateSchema = Schema.String;
export type BelweaveCloudSandboxState = typeof BelweaveCloudSandboxStateSchema.Type;

/** Stable public API error codes (see belweave-dashboard docs/public-api.md). */
export const BelweaveCloudErrorCodeSchema = Schema.Literals([
  "unauthorized",
  "invalid_request",
  "insufficient_credits",
  "sandbox_not_found",
  "sandbox_not_ready",
  "quota_exceeded",
  "provisioning_failed",
  "remote_start_failed",
]);
export type BelweaveCloudErrorCode = typeof BelweaveCloudErrorCodeSchema.Type;

export const BelweaveCloudErrorBodySchema = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
  }),
});
export type BelweaveCloudErrorBody = typeof BelweaveCloudErrorBodySchema.Type;

export const BelweaveCloudSandboxSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  tier: BelweaveCloudTierSchema,
  rateCentsPerHr: Schema.Number,
  state: BelweaveCloudSandboxStateSchema,
  createdAt: Schema.String,
  stoppedAt: Schema.NullOr(Schema.String),
  stoppedReason: Schema.NullOr(Schema.String),
  sshUser: Schema.String,
  desktopAvailable: Schema.Boolean,
  snapshotAvailable: Schema.Boolean,
  archiveAfter: Schema.NullOr(Schema.String),
});
export type BelweaveCloudSandbox = typeof BelweaveCloudSandboxSchema.Type;

export const BelweaveCloudSandboxListSchema = Schema.Struct({
  sandboxes: Schema.Array(BelweaveCloudSandboxSchema),
});
export type BelweaveCloudSandboxList = typeof BelweaveCloudSandboxListSchema.Type;

/** Envelope returned by single-sandbox operations (create/get/resume/stop). */
export const BelweaveCloudSandboxEnvelopeSchema = Schema.Struct({
  sandbox: BelweaveCloudSandboxSchema,
});
export type BelweaveCloudSandboxEnvelope = typeof BelweaveCloudSandboxEnvelopeSchema.Type;

/**
 * Descriptor Belweave Cloud returns after bootstrapping remote Trifecta. It is
 * consumed directly by Trifecta Desktop's existing remote saved-environment
 * pairing flow. `pairingCredential` / `pairingUrl` are one-time, short-lived,
 * owner startup-pairing credentials and must never be logged or persisted.
 */
export const BelweaveCloudTrifectaEnvironmentSchema = Schema.Struct({
  label: Schema.String,
  environmentId: Schema.String,
  httpBaseUrl: Schema.String,
  wsBaseUrl: Schema.String,
  pairingCredential: Schema.optionalKey(Schema.String),
  pairingUrl: Schema.optionalKey(Schema.String),
  bearerToken: Schema.optionalKey(Schema.String),
  expiresAt: Schema.optionalKey(Schema.String),
});
export type BelweaveCloudTrifectaEnvironment = typeof BelweaveCloudTrifectaEnvironmentSchema.Type;

export const BelweaveCloudBootstrapResultSchema = Schema.Struct({
  sandbox: BelweaveCloudSandboxSchema,
  environment: BelweaveCloudTrifectaEnvironmentSchema,
});
export type BelweaveCloudBootstrapResult = typeof BelweaveCloudBootstrapResultSchema.Type;

export const BelweaveCloudTrifectaEnvironmentDescriptorSchema = Schema.Struct({
  sandbox: BelweaveCloudSandboxSchema,
  environment: Schema.NullOr(BelweaveCloudTrifectaEnvironmentSchema),
});
export type BelweaveCloudTrifectaEnvironmentDescriptor =
  typeof BelweaveCloudTrifectaEnvironmentDescriptorSchema.Type;

export const BelweaveCloudDeleteResultSchema = Schema.Struct({
  deleted: Schema.Literal(true),
});
export type BelweaveCloudDeleteResult = typeof BelweaveCloudDeleteResultSchema.Type;

export const BelweaveCloudCreateSandboxInputSchema = Schema.Struct({
  name: Schema.String,
  tier: BelweaveCloudTierSchema,
  ttlSeconds: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type BelweaveCloudCreateSandboxInput = typeof BelweaveCloudCreateSandboxInputSchema.Type;

/**
 * Correlates a locally saved Trifecta environment with the Belweave Cloud
 * sandbox that backs it, so the Cloud panel can offer resume/stop/delete for a
 * connected sandbox without re-deriving provider details.
 */
export const BelweaveCloudConnectedSandboxSchema = Schema.Struct({
  sandboxId: Schema.Number,
  environmentId: EnvironmentId,
  name: Schema.String,
  connectedAt: Schema.String,
});
export type BelweaveCloudConnectedSandbox = typeof BelweaveCloudConnectedSandboxSchema.Type;

/**
 * Non-secret desktop configuration for Belweave Cloud. The API key itself is a
 * secret and is stored separately through the secure secret persistence path
 * (electron safeStorage / browser storage), never in this document.
 */
export const BelweaveCloudConfigSchema = Schema.Struct({
  apiBaseUrl: Schema.NullOr(Schema.String),
  connectedSandboxes: Schema.Array(BelweaveCloudConnectedSandboxSchema),
});
export type BelweaveCloudConfig = typeof BelweaveCloudConfigSchema.Type;

export const DEFAULT_BELWEAVE_CLOUD_CONFIG: BelweaveCloudConfig = {
  apiBaseUrl: null,
  connectedSandboxes: [],
};
