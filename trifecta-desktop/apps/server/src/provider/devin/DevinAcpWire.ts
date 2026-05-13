/**
 * Devin ACP wire compatibility — pass-through normalization.
 *
 * Devin emits standard ACP-compliant JSON, so no normalization is needed.
 * These functions exist as pass-throughs to match the same call-site pattern
 * used by the Hermes provider, keeping the adapter/provider code uniform.
 *
 * @module provider/devin/DevinAcpWire
 */
import * as Exit from "effect/Exit";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  InitializeResponse as InitializeResponseCodec,
  NewSessionResponse as NewSessionResponseCodec,
  type InitializeResponse,
  type NewSessionResponse,
} from "effect-acp/schema";

/** Pass-through: Devin already emits standard ACP JSON. */
export function normalizeDevinInitializeResult(raw: unknown): unknown {
  return raw;
}

/** Pass-through: Devin already emits standard ACP JSON. */
export function normalizeDevinNewSessionResult(raw: unknown): unknown {
  return raw;
}

/** Decode Devin `initialize` result (pass-through normalize, then strict decode). */
export function decodeDevinInitializeResponse(
  raw: unknown,
): Effect.Effect<InitializeResponse, Schema.SchemaError> {
  return Schema.decodeUnknownEffect(InitializeResponseCodec)(normalizeDevinInitializeResult(raw));
}

/** Decode Devin `session/new` result (pass-through normalize, then strict decode). */
export function decodeDevinNewSessionResponse(
  raw: unknown,
): Effect.Effect<NewSessionResponse, Schema.SchemaError> {
  const normalized = normalizeDevinNewSessionResult(raw);
  return Effect.gen(function* () {
    return yield* Schema.decodeUnknownEffect(NewSessionResponseCodec)(normalized);
  });
}
