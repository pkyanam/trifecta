import {
  BelweaveCloudBootstrapResultSchema,
  BelweaveCloudDeleteResultSchema,
  BelweaveCloudErrorBodySchema,
  BelweaveCloudSandboxEnvelopeSchema,
  BelweaveCloudSandboxListSchema,
  type BelweaveCloudBootstrapResult,
  type BelweaveCloudCreateSandboxInput,
  type BelweaveCloudSandbox,
} from "@belweave/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { redactForLog } from "./redact";

const API_PREFIX = "/api/v1";

export type BelweaveCloudApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "insufficient_credits"
  | "sandbox_not_found"
  | "sandbox_not_ready"
  | "quota_exceeded"
  | "provisioning_failed"
  | "remote_start_failed"
  | "network_error"
  | "invalid_response"
  | "invalid_config"
  | "unknown";

export class BelweaveCloudApiError extends Error {
  readonly code: BelweaveCloudApiErrorCode;
  readonly status: number | null;

  constructor(code: BelweaveCloudApiErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "BelweaveCloudApiError";
    this.code = code;
    this.status = status;
  }
}

export function isBelweaveCloudApiError(error: unknown): error is BelweaveCloudApiError {
  return error instanceof BelweaveCloudApiError;
}

export interface BelweaveCloudApiCredentials {
  readonly apiBaseUrl: string;
  readonly apiKey: string;
}

function normalizeBaseUrl(rawBaseUrl: string): URL {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    throw new BelweaveCloudApiError("invalid_config", "Enter a Belweave Cloud API URL.");
  }
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BelweaveCloudApiError("invalid_config", "The Belweave Cloud API URL is not valid.");
  }
  url.hash = "";
  url.search = "";
  // Drop a trailing slash so path joins are predictable.
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url;
}

/**
 * Build the absolute endpoint URL, accepting either the dashboard root
 * (`https://app.belweave.ai`) or a base already scoped to the public API
 * (`https://app.belweave.ai/api/v1`).
 */
export function buildEndpointUrl(apiBaseUrl: string, path: string): string {
  const base = normalizeBaseUrl(apiBaseUrl);
  // A URL with no path reports pathname `/`; treat that as empty so joins don't
  // double the leading slash.
  const basePath = base.pathname === "/" ? "" : base.pathname;
  const prefix = basePath.endsWith(API_PREFIX) ? "" : API_PREFIX;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  base.pathname = `${basePath}${prefix}${suffix}`;
  return base.toString();
}

const decodeErrorBody = Schema.decodeUnknownOption(BelweaveCloudErrorBodySchema);
const decodeSandboxList = Schema.decodeUnknownOption(BelweaveCloudSandboxListSchema);
const decodeSandboxEnvelope = Schema.decodeUnknownOption(BelweaveCloudSandboxEnvelopeSchema);
const decodeBootstrapResult = Schema.decodeUnknownOption(BelweaveCloudBootstrapResultSchema);
const decodeDeleteResult = Schema.decodeUnknownOption(BelweaveCloudDeleteResultSchema);

interface RawHttpResponse {
  readonly status: number;
  readonly bodyText: string;
}

/**
 * Perform the HTTP request. In the desktop app the renderer's Content-Security-
 * Policy (and CORS) blocks cross-origin fetches, so route through the Electron
 * main process when the bridge is available; otherwise fetch directly.
 */
async function performRequest(input: {
  readonly credentials: BelweaveCloudApiCredentials;
  readonly path: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
}): Promise<RawHttpResponse> {
  const url = buildEndpointUrl(input.credentials.apiBaseUrl, input.path);
  const bridgeFetch =
    typeof window !== "undefined" ? window.desktopBridge?.belweaveCloudFetch : undefined;

  if (bridgeFetch) {
    try {
      return await bridgeFetch({
        url,
        method: input.method,
        apiKey: input.credentials.apiKey,
        ...(input.body !== undefined ? { body: input.body } : {}),
      });
    } catch (error) {
      throw new BelweaveCloudApiError(
        "network_error",
        `Unable to reach Belweave Cloud. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }
  }

  try {
    const response = await fetch(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.credentials.apiKey}`,
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
    return { status: response.status, bodyText: await response.text() };
  } catch (error) {
    throw new BelweaveCloudApiError(
      "network_error",
      `Unable to reach Belweave Cloud. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }
}

function readErrorResponse(response: RawHttpResponse): BelweaveCloudApiError {
  const fallback = `Belweave Cloud request failed (${response.status}).`;

  if (response.bodyText) {
    try {
      const parsed: unknown = JSON.parse(response.bodyText);
      const decoded = decodeErrorBody(parsed);
      if (Option.isSome(decoded)) {
        return new BelweaveCloudApiError(
          decoded.value.error.code as BelweaveCloudApiErrorCode,
          decoded.value.error.message,
          response.status,
        );
      }
    } catch {
      // Non-JSON error body; fall through to generic handling.
    }
  }

  if (response.status === 401) {
    return new BelweaveCloudApiError("unauthorized", "The Belweave Cloud API key is invalid.", 401);
  }
  return new BelweaveCloudApiError("unknown", fallback, response.status);
}

async function requestJson<T>(input: {
  readonly credentials: BelweaveCloudApiCredentials;
  readonly path: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly decode: (value: unknown) => Option.Option<T>;
}): Promise<T> {
  const response = await performRequest(input);

  if (response.status < 200 || response.status >= 300) {
    throw readErrorResponse(response);
  }

  let parsed: unknown;
  try {
    parsed = response.bodyText ? JSON.parse(response.bodyText) : {};
  } catch {
    throw new BelweaveCloudApiError(
      "invalid_response",
      "Belweave Cloud returned a malformed response.",
      response.status,
    );
  }

  const decoded = input.decode(parsed);
  if (Option.isNone(decoded)) {
    console.error("[belweave-cloud] response validation failed", {
      path: input.path,
      body: redactForLog(parsed),
    });
    throw new BelweaveCloudApiError(
      "invalid_response",
      "Belweave Cloud returned an unexpected response shape.",
      response.status,
    );
  }
  return decoded.value;
}

export async function listSandboxes(
  credentials: BelweaveCloudApiCredentials,
): Promise<readonly BelweaveCloudSandbox[]> {
  const result = await requestJson({
    credentials,
    path: "/sandboxes",
    method: "GET",
    decode: decodeSandboxList,
  });
  return result.sandboxes;
}

export async function createSandbox(
  credentials: BelweaveCloudApiCredentials,
  input: BelweaveCloudCreateSandboxInput,
): Promise<BelweaveCloudSandbox> {
  const result = await requestJson({
    credentials,
    path: "/sandboxes",
    method: "POST",
    body: input,
    decode: decodeSandboxEnvelope,
  });
  return result.sandbox;
}

export async function resumeSandbox(
  credentials: BelweaveCloudApiCredentials,
  sandboxId: number,
): Promise<BelweaveCloudSandbox> {
  const result = await requestJson({
    credentials,
    path: `/sandboxes/${sandboxId}/resume`,
    method: "POST",
    decode: decodeSandboxEnvelope,
  });
  return result.sandbox;
}

export async function stopSandbox(
  credentials: BelweaveCloudApiCredentials,
  sandboxId: number,
): Promise<BelweaveCloudSandbox> {
  const result = await requestJson({
    credentials,
    path: `/sandboxes/${sandboxId}/stop`,
    method: "POST",
    decode: decodeSandboxEnvelope,
  });
  return result.sandbox;
}

export async function deleteSandbox(
  credentials: BelweaveCloudApiCredentials,
  sandboxId: number,
): Promise<void> {
  await requestJson({
    credentials,
    path: `/sandboxes/${sandboxId}`,
    method: "DELETE",
    decode: decodeDeleteResult,
  });
}

export async function bootstrapTrifecta(
  credentials: BelweaveCloudApiCredentials,
  sandboxId: number,
): Promise<BelweaveCloudBootstrapResult> {
  return requestJson({
    credentials,
    path: `/sandboxes/${sandboxId}/bootstrap-trifecta`,
    method: "POST",
    decode: decodeBootstrapResult,
  });
}
