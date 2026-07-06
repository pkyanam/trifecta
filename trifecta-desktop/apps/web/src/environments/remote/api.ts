import type {
  AuthBearerBootstrapResult,
  AuthSessionState,
  AuthWebSocketTokenResult,
  ExecutionEnvironmentDescriptor,
} from "@belweave/contracts";

import { extractBoxPortAuth, hasBoxPortAuth, stripBoxToken } from "./boxPortAuth";

class RemoteEnvironmentAuthHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RemoteEnvironmentAuthHttpError";
    this.status = status;
  }
}

export function isRemoteEnvironmentAuthHttpError(
  error: unknown,
): error is RemoteEnvironmentAuthHttpError {
  return error instanceof RemoteEnvironmentAuthHttpError;
}

function describeJsonResponseMismatch(response: Response, text: string): string {
  const contentType = response.headers.get("content-type") ?? "unknown content type";
  const preview = text.trim().replace(/\s+/g, " ").slice(0, 80);
  return `Remote auth endpoint returned ${contentType} instead of JSON (${response.status})${
    preview ? `: ${preview}` : "."
  }`;
}

function joinUrlPath(basePath: string, endpointPath: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const endpoint = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  if (!base || base === "/") {
    return endpoint;
  }
  return `${base}${endpoint}`;
}

function remoteEndpointUrl(httpBaseUrl: string, pathname: string): string {
  const url = new URL(httpBaseUrl);
  url.pathname = joinUrlPath(url.pathname, pathname);
  url.hash = "";
  return url.toString();
}

function browserFetchUrl(httpBaseUrl: string, pathname: string): string {
  const url = new URL(remoteEndpointUrl(httpBaseUrl, pathname));
  return extractBoxPortAuth(url) ? stripBoxToken(url).toString() : url.toString();
}

async function readRemoteAuthErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const text = await response.text();
  if (!text) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(text) as { readonly error?: string };
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    // Fall back to raw text below.
  }

  return text;
}

async function fetchRemoteJson<T>(input: {
  readonly httpBaseUrl: string;
  readonly pathname: string;
  readonly method?: "GET" | "POST";
  readonly bearerToken?: string;
  readonly body?: unknown;
}): Promise<T> {
  const requestUrl = remoteEndpointUrl(input.httpBaseUrl, input.pathname);
  const requestUrlForFetch = browserFetchUrl(input.httpBaseUrl, input.pathname);
  if (hasBoxPortAuth(requestUrl) && window.desktopBridge?.fetchRemoteJson) {
    return (await window.desktopBridge.fetchRemoteJson({
      httpBaseUrl: input.httpBaseUrl,
      pathname: input.pathname,
      method: input.method ?? "GET",
      ...(input.bearerToken ? { bearerToken: input.bearerToken } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
    })) as T;
  }

  let response: Response;
  try {
    response = await fetch(requestUrlForFetch, {
      method: input.method ?? "GET",
      headers: {
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(input.bearerToken ? { authorization: `Bearer ${input.bearerToken}` } : {}),
      },
      ...(hasBoxPortAuth(requestUrl) ? { credentials: "include" as const } : {}),
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch remote auth endpoint ${requestUrlForFetch} (${(error as Error).message}).`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new RemoteEnvironmentAuthHttpError(
      await readRemoteAuthErrorMessage(
        response,
        `Remote auth request failed (${response.status}).`,
      ),
      response.status,
    );
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(describeJsonResponseMismatch(response, text), { cause: error });
  }
}

export async function bootstrapRemoteBearerSession(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
}): Promise<AuthBearerBootstrapResult> {
  return fetchRemoteJson<AuthBearerBootstrapResult>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/bootstrap/bearer",
    method: "POST",
    body: {
      credential: input.credential,
    },
  });
}

export async function fetchRemoteSessionState(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}): Promise<AuthSessionState> {
  return fetchRemoteJson<AuthSessionState>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/session",
    bearerToken: input.bearerToken,
  });
}

export async function fetchRemoteEnvironmentDescriptor(input: {
  readonly httpBaseUrl: string;
}): Promise<ExecutionEnvironmentDescriptor> {
  return fetchRemoteJson<ExecutionEnvironmentDescriptor>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/.well-known/belweave/environment",
  });
}

export async function issueRemoteWebSocketToken(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}): Promise<AuthWebSocketTokenResult> {
  return fetchRemoteJson<AuthWebSocketTokenResult>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/ws-token",
    method: "POST",
    bearerToken: input.bearerToken,
  });
}

export async function resolveRemoteWebSocketConnectionUrl(input: {
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}): Promise<string> {
  const issued = await issueRemoteWebSocketToken({
    httpBaseUrl: input.httpBaseUrl,
    bearerToken: input.bearerToken,
  });
  const url = new URL(input.wsBaseUrl, window.location.origin);
  const boxAuth = extractBoxPortAuth(url);
  url.searchParams.delete("wsToken");
  url.searchParams.set("wsToken", issued.token);

  // If running inside the desktop app with a box origin, route the WebSocket
  // through a local TCP proxy. Chromium negotiates HTTP/2 via ALPN for TLS
  // connections, but the box proxy (Caddy) does not support WebSocket over
  // HTTP/2. The desktop main process starts a local HTTP/1.1 proxy that
  // forwards the WS upgrade to the box server with the _port_auth cookie.
  // The proxy uses the _token query param to look up the box origin, so we
  // must call resolveBoxWebSocketUrl before stripping _token.
  if (boxAuth && window.desktopBridge?.resolveBoxWebSocketUrl) {
    return await window.desktopBridge.resolveBoxWebSocketUrl(url.toString());
  }

  if (boxAuth) {
    url.searchParams.delete("_token");
  }
  return url.toString();
}
