/**
 * Hermes ACP wire compatibility — normalize agent JSON before strict ACP schemas decode it.
 *
 * Some `hermes acp` builds emit responses that violate the bundled ACP v0.11.3 JSON shape expected
 * by `effect-acp` RPC codecs (numeric fields serialized as strings, incomplete `models` /
 * `modes` objects). Decoding fails with Effect `SchemaError`, which surfaces in the packaged app
 * as "Internal error" at Schema decode.
 *
 * Hermes-specific call sites send `initialize` / `session/new` through `AcpClient.raw.request` and
 * decode via this helper.
 *
 * @module provider/hermes/HermesAcpWire
 */
import * as Exit from "effect/Exit";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  InitializeResponse as InitializeResponseCodec,
  NewSessionResponse as NewSessionResponseCodec,
  SessionConfigOption as SessionConfigOptionCodec,
  SetSessionConfigOptionResponse as SetSessionConfigOptionResponseCodec,
  type InitializeResponse,
  type NewSessionResponse,
  type SessionConfigOption,
  type SetSessionConfigOptionResponse,
} from "effect-acp/schema";

const decodeInitializeResponse = Schema.decodeUnknownEffect(InitializeResponseCodec);
const decodeNewSessionResponse = Schema.decodeUnknownEffect(NewSessionResponseCodec);
const decodeSessionConfigOption = Schema.decodeUnknownOption(SessionConfigOptionCodec);
const decodeSetSessionConfigOptionResponse = Schema.decodeUnknownEffect(
  SetSessionConfigOptionResponseCodec,
);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function coerceProtocolVersion(raw: unknown): unknown {
  const o = asRecord(raw);
  if (!o) return raw;
  const next = { ...o };
  const pv = next.protocolVersion;
  if (typeof pv === "string" && /^-?\d+$/.test(pv.trim())) {
    next.protocolVersion = Number(pv.trim());
    return next;
  }
  if (typeof pv === "bigint") {
    next.protocolVersion = Number(pv);
    return next;
  }
  return raw;
}

export function normalizeHermesInitializeResult(raw: unknown): unknown {
  return coerceProtocolVersion(raw);
}

function normalizeModelEntry(model: unknown): unknown {
  const o = asRecord(model);
  if (!o) return model;
  const rawId =
    typeof o.modelId === "string"
      ? o.modelId
      : typeof o.model_id === "string"
        ? o.model_id
        : o.modelId !== undefined && o.modelId !== null
          ? String(o.modelId)
          : o.model_id !== undefined && o.model_id !== null
            ? String(o.model_id)
            : "";
  const modelId = String(rawId);
  const rawName =
    typeof o.name === "string"
      ? o.name
      : typeof (o as { displayName?: unknown }).displayName === "string"
        ? (o as { displayName: string }).displayName
        : typeof (o as { display_name?: unknown }).display_name === "string"
          ? (o as { display_name: string }).display_name
          : "";
  const name = rawName.trim().length > 0 ? rawName : modelId.length > 0 ? modelId : "model";
  return { ...o, modelId, name };
}

function normalizeSessionModels(models: Record<string, unknown>): Record<string, unknown> {
  const rawAvail = models.availableModels;
  const rawSnake = (models as { available_models?: unknown }).available_models;
  const list = Array.isArray(rawAvail) ? rawAvail : Array.isArray(rawSnake) ? rawSnake : [];
  const availableModels = list.map(normalizeModelEntry);
  let currentRaw =
    models.currentModelId ??
    (models as { current_model_id?: unknown }).current_model_id ??
    undefined;
  const firstRec =
    typeof availableModels[0] !== "undefined" ? asRecord(availableModels[0]) : undefined;
  if (
    typeof currentRaw !== "string" ||
    (typeof currentRaw === "string" && currentRaw.trim().length === 0)
  ) {
    currentRaw =
      typeof firstRec?.modelId === "string"
        ? firstRec.modelId
        : typeof firstRec?.model_id === "string"
          ? (firstRec.model_id as string)
          : currentRaw;
  }
  const currentModelId = typeof currentRaw === "string" ? currentRaw : String(currentRaw ?? "");
  return {
    ...models,
    availableModels,
    currentModelId,
  };
}

function normalizeSessionModeEntry(mode: unknown): unknown {
  const o = asRecord(mode);
  if (!o) return mode;
  const id =
    typeof o.id === "string"
      ? o.id
      : typeof (o as { mode_id?: unknown }).mode_id === "string"
        ? (o as { mode_id: string }).mode_id
        : "";
  const rawName =
    typeof o.name === "string"
      ? o.name
      : typeof (o as { label?: unknown }).label === "string"
        ? (o as { label: string }).label
        : "";
  const name = rawName.trim().length > 0 ? rawName : id.length > 0 ? id : "mode";
  return { ...o, id, name };
}

function normalizeSessionModes(modes: Record<string, unknown>): Record<string, unknown> {
  const rawAvail = modes.availableModes;
  const rawSnake = (modes as { available_modes?: unknown }).available_modes;
  const list = Array.isArray(rawAvail) ? rawAvail : Array.isArray(rawSnake) ? rawSnake : [];
  const availableModes = list.map(normalizeSessionModeEntry);
  let currentRaw =
    modes.currentModeId ?? (modes as { current_mode_id?: unknown }).current_mode_id ?? undefined;
  const firstRec =
    typeof availableModes[0] !== "undefined" ? asRecord(availableModes[0]) : undefined;
  if (
    typeof currentRaw !== "string" ||
    (typeof currentRaw === "string" && currentRaw.trim().length === 0)
  ) {
    currentRaw = typeof firstRec?.id === "string" ? firstRec.id : currentRaw;
  }
  const currentModeId = typeof currentRaw === "string" ? currentRaw : String(currentRaw ?? "");
  return {
    ...modes,
    availableModes,
    currentModeId,
  };
}

export function normalizeHermesNewSessionResult(raw: unknown): unknown {
  const o = asRecord(raw);
  if (!o) return raw;
  const next = { ...o };
  if (next.models !== undefined && next.models !== null && typeof next.models === "object") {
    next.models = normalizeSessionModels(next.models as Record<string, unknown>);
  }
  if (next.modes !== undefined && next.modes !== null && typeof next.modes === "object") {
    next.modes = normalizeSessionModes(next.modes as Record<string, unknown>);
  }
  return next;
}

function normalizeSelectOption(option: unknown): unknown {
  const o = asRecord(option);
  if (!o) return option;
  const value =
    typeof o.value === "string"
      ? o.value
      : o.value !== undefined && o.value !== null
        ? String(o.value)
        : "";
  const rawName =
    typeof o.name === "string"
      ? o.name
      : typeof o.label === "string"
        ? o.label
        : typeof o.title === "string"
          ? o.title
          : "";
  const name = rawName.trim().length > 0 ? rawName : value.length > 0 ? value : "option";
  return { ...o, value, name };
}

function normalizeSelectGroup(group: unknown): unknown {
  const o = asRecord(group);
  if (!o) return group;
  if (!Array.isArray(o.options)) {
    return normalizeSelectOption(group);
  }
  const groupId =
    typeof o.group === "string"
      ? o.group
      : typeof o.id === "string"
        ? o.id
        : typeof o.name === "string"
          ? o.name
          : "group";
  const name = typeof o.name === "string" && o.name.trim().length > 0 ? o.name : groupId;
  return { ...o, group: groupId, name, options: o.options.map(normalizeSelectOption) };
}

function normalizeSelectOptions(options: ReadonlyArray<unknown>): ReadonlyArray<unknown> {
  const normalized = options.map(normalizeSelectGroup);
  const hasFlatOptions = normalized.some((entry) => {
    const o = asRecord(entry);
    return o !== undefined && "value" in o;
  });
  const hasGroups = normalized.some((entry) => {
    const o = asRecord(entry);
    return o !== undefined && Array.isArray(o.options);
  });
  if (!hasFlatOptions || !hasGroups) {
    return normalized;
  }
  return normalized.flatMap((entry) => {
    const o = asRecord(entry);
    if (!o) return [];
    if ("value" in o) return [entry];
    return Array.isArray(o.options) ? o.options : [];
  });
}

function normalizeSessionConfigOptionEntry(option: unknown): unknown {
  const o = asRecord(option);
  if (!o) return option;
  const id =
    typeof o.id === "string"
      ? o.id
      : typeof (o as { configId?: unknown }).configId === "string"
        ? (o as { configId: string }).configId
        : "";
  const rawName =
    typeof o.name === "string"
      ? o.name
      : typeof o.label === "string"
        ? o.label
        : typeof o.title === "string"
          ? o.title
          : "";
  const name = rawName.trim().length > 0 ? rawName : id.length > 0 ? id : "option";
  const rawType = typeof o.type === "string" ? o.type : Array.isArray(o.options) ? "select" : "";
  if (rawType === "boolean") {
    return {
      ...o,
      id,
      name,
      type: "boolean",
      currentValue:
        typeof o.currentValue === "boolean"
          ? o.currentValue
          : o.currentValue === "true" || o.current_value === "true",
    };
  }
  const options = Array.isArray(o.options) ? normalizeSelectOptions(o.options) : [];
  const currentRaw = o.currentValue ?? o.current_value ?? undefined;
  const currentValue =
    typeof currentRaw === "string"
      ? currentRaw
      : currentRaw !== undefined && currentRaw !== null
        ? String(currentRaw)
        : "";
  return {
    ...o,
    id,
    name,
    type: "select",
    currentValue,
    options,
  };
}

export function normalizeHermesSessionConfigOptions(
  raw: unknown,
): ReadonlyArray<SessionConfigOption> {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeSessionConfigOptionEntry).flatMap((entry) => {
    const decoded = decodeSessionConfigOption(entry);
    return decoded._tag === "Some" ? [decoded.value] : [];
  });
}

export function normalizeHermesSetSessionConfigOptionResult(raw: unknown): unknown {
  const o = asRecord(raw);
  if (!o) return raw;
  const next = { ...o };
  const rawOptions = next.configOptions ?? (next as { config_options?: unknown }).config_options;
  if (Array.isArray(rawOptions)) {
    next.configOptions = normalizeHermesSessionConfigOptions(rawOptions);
  }
  return next;
}

function minimalNewSessionForDecode(normalized: unknown): unknown {
  const o = asRecord(normalized);
  if (!o) return normalized;
  return {
    _meta: o._meta ?? undefined,
    sessionId:
      typeof o.sessionId === "string"
        ? o.sessionId
        : o.sessionId !== undefined && o.sessionId !== null
          ? String(o.sessionId)
          : "",
  };
}

/** Decode Hermes `initialize` result tolerating loose wire JSON after {@link normalizeHermesInitializeResult}. */
export function decodeHermesInitializeResponse(
  raw: unknown,
): Effect.Effect<InitializeResponse, Schema.SchemaError> {
  return decodeInitializeResponse(normalizeHermesInitializeResult(raw));
}

/** Decode Hermes `session/new` result; falls back to `sessionId` only if richer fields still fail decode. */
export function decodeHermesNewSessionResponse(
  raw: unknown,
): Effect.Effect<NewSessionResponse, Schema.SchemaError> {
  const normalized = normalizeHermesNewSessionResult(raw);
  return Effect.gen(function* () {
    const attempt = yield* Effect.exit(decodeNewSessionResponse(normalized));
    if (Exit.isSuccess(attempt)) {
      return attempt.value;
    }
    return yield* decodeNewSessionResponse(minimalNewSessionForDecode(normalized));
  });
}

export function decodeHermesSetSessionConfigOptionResponse(
  raw: unknown,
): Effect.Effect<SetSessionConfigOptionResponse, Schema.SchemaError> {
  return decodeSetSessionConfigOptionResponse(normalizeHermesSetSessionConfigOptionResult(raw));
}
