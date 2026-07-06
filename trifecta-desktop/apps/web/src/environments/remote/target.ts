import { getPairingTokenFromUrl } from "../../pairingUrl";
import { readHostedPairingRequest } from "../../hostedPairing";

const PAIRING_TOKEN_PARAM = "token";

export interface ResolvedRemotePairingTarget {
  readonly credential: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

function normalizeUrlInput(rawValue: string): string {
  return rawValue.trim().replace(/[\u2010-\u2015\u2212]/g, "-");
}

function normalizeRemoteBaseUrl(rawValue: string): URL {
  const trimmed = normalizeUrlInput(rawValue);
  if (!trimmed) {
    throw new Error("Enter a backend URL.");
  }

  const normalizedInput =
    /^[a-zA-Z][a-zA-Z\d+-]*:\/\//.test(trimmed) || trimmed.startsWith("//")
      ? trimmed
      : `https://${trimmed}`;
  const url = new URL(normalizedInput, window.location.origin);
  url.searchParams.delete(PAIRING_TOKEN_PARAM);
  url.hash = "";
  if (url.pathname.endsWith("/pair")) {
    url.pathname = url.pathname.slice(0, -"/pair".length) || "/";
  }
  if (url.pathname !== "/" && !url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url;
}

function toHttpBaseUrl(url: URL): string {
  const next = new URL(url.toString());
  if (next.protocol === "ws:") {
    next.protocol = "http:";
  } else if (next.protocol === "wss:") {
    next.protocol = "https:";
  }
  next.searchParams.delete(PAIRING_TOKEN_PARAM);
  next.hash = "";
  return next.toString();
}

function toWsBaseUrl(url: URL): string {
  const next = new URL(url.toString());
  if (next.protocol === "http:") {
    next.protocol = "ws:";
  } else if (next.protocol === "https:") {
    next.protocol = "wss:";
  }
  next.searchParams.delete(PAIRING_TOKEN_PARAM);
  next.hash = "";
  return next.toString();
}

export function resolveRemotePairingTarget(input: {
  readonly pairingUrl?: string;
  readonly host?: string;
  readonly pairingCode?: string;
}): ResolvedRemotePairingTarget {
  const pairingUrl = input.pairingUrl ? normalizeUrlInput(input.pairingUrl) : "";
  if (pairingUrl.length > 0) {
    const url = new URL(pairingUrl, window.location.origin);
    const hostedPairingRequest = readHostedPairingRequest(url);
    if (hostedPairingRequest) {
      const hostedBackendUrl = normalizeRemoteBaseUrl(hostedPairingRequest.host);
      return {
        credential: hostedPairingRequest.token,
        httpBaseUrl: toHttpBaseUrl(hostedBackendUrl),
        wsBaseUrl: toWsBaseUrl(hostedBackendUrl),
      };
    }

    const credential = getPairingTokenFromUrl(url) ?? "";
    if (!credential) {
      throw new Error("Pairing URL is missing its token.");
    }
    const backendBase = normalizeRemoteBaseUrl(url.toString());
    return {
      credential,
      httpBaseUrl: toHttpBaseUrl(backendBase),
      wsBaseUrl: toWsBaseUrl(backendBase),
    };
  }

  const host = input.host?.trim() ?? "";
  const pairingCode = input.pairingCode?.trim() ?? "";
  if (!host) {
    throw new Error("Enter a backend URL.");
  }
  if (!pairingCode) {
    throw new Error("Enter a pairing code.");
  }

  const normalizedHost = normalizeRemoteBaseUrl(host);
  return {
    credential: pairingCode,
    httpBaseUrl: toHttpBaseUrl(normalizedHost),
    wsBaseUrl: toWsBaseUrl(normalizedHost),
  };
}
