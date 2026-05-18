/**
 * Devin ACP wire compatibility — normalize agent JSON before strict ACP schemas decode it.
 *
 * Devin emits standard ACP-compliant JSON for initialize, but its `session/new`
 * response places the model list inside `configOptions` (as a "select" config
 * option with `id === "model"`) rather than the standard `models.availableModels`
 * field. We normalize here so downstream code can read `models.availableModels`
 * uniformly, just like Hermes / Cursor.
 *
 * @module provider/devin/DevinAcpWire
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  InitializeResponse as InitializeResponseCodec,
  NewSessionResponse as NewSessionResponseCodec,
  type InitializeResponse,
  type NewSessionResponse,
} from "effect-acp/schema";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  return undefined;
}

/** Pass-through: Devin already emits standard ACP JSON for initialize. */
export function normalizeDevinInitializeResult(raw: unknown): unknown {
  return raw;
}

/**
 * Normalize Devin `session/new` result.
 *
 * Devin places model choices inside `configOptions` as a select option with
 * `id === "model"`. We synthesize a `models` block from that so the rest of
 * the provider stack can consume it uniformly.
 */
export function normalizeDevinNewSessionResult(raw: unknown): unknown {
  const o = asRecord(raw);
  if (!o) return raw;
  const next = { ...o };

  // If models already has availableModels, nothing to do.
  const existingModels = asRecord(o.models);
  if (existingModels && asArray(existingModels.availableModels)?.length) {
    return raw;
  }

  // Look for model config option inside configOptions.
  const configOptions = asArray(o.configOptions);
  if (!configOptions || configOptions.length === 0) {
    return raw;
  }

  for (const opt of configOptions) {
    const optRec = asRecord(opt);
    if (!optRec) continue;
    const id = typeof optRec.id === "string" ? optRec.id : "";
    const category = typeof optRec.category === "string" ? optRec.category : "";
    if (id !== "model" && category !== "model") continue;

    const options = asArray(optRec.options);
    if (!options || options.length === 0) continue;

    const availableModels = options
      .map((item): { modelId: string; name: string } | undefined => {
        const itemRec = asRecord(item);
        if (!itemRec) return undefined;
        const value = typeof itemRec.value === "string" ? itemRec.value : "";
        const name =
          typeof itemRec.name === "string" && itemRec.name.trim().length > 0 ? itemRec.name : value;
        if (!value) return undefined;
        return { modelId: value, name };
      })
      .filter((m): m is { modelId: string; name: string } => m !== undefined);

    if (availableModels.length > 0) {
      const first = availableModels[0];
      if (first === undefined) {
        continue;
      }
      const firstId = first.modelId;
      const currentModelId =
        typeof optRec.currentValue === "string" && optRec.currentValue
          ? optRec.currentValue
          : firstId;
      next.models = {
        availableModels,
        currentModelId,
      };
      break;
    }
  }

  return next;
}

/** Decode Devin `initialize` result (pass-through normalize, then strict decode). */
export function decodeDevinInitializeResponse(
  raw: unknown,
): Effect.Effect<InitializeResponse, Schema.SchemaError> {
  return Schema.decodeUnknownEffect(InitializeResponseCodec)(normalizeDevinInitializeResult(raw));
}

/** Decode Devin `session/new` result; normalizes configOptions-based models first. */
export function decodeDevinNewSessionResponse(
  raw: unknown,
): Effect.Effect<NewSessionResponse, Schema.SchemaError> {
  const normalized = normalizeDevinNewSessionResult(raw);
  return Schema.decodeUnknownEffect(NewSessionResponseCodec)(normalized);
}
