import { session } from "electron";

import type { DesktopRemoteJsonRequest } from "@belweave/contracts";

import { extractBoxPortAuth, stripBoxToken } from "./BoxPortAuth.ts";
import { ensureBoxWsProxy } from "./BoxWsProxy.ts";

function joinUrlPath(basePath: string, endpointPath: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const endpoint = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  if (!base || base === "/") {
    return endpoint;
  }
  return `${base}${endpoint}`;
}

function requestUrlFor(input: DesktopRemoteJsonRequest): URL {
  const url = new URL(input.httpBaseUrl);
  url.pathname = joinUrlPath(url.pathname, input.pathname);
  url.hash = "";
  return url;
}

async function seedBoxPortAuthCookie(url: URL, token: string) {
  const origin = stripBoxToken(url).origin;
  await session.defaultSession.cookies.set({
    url: origin,
    name: "_port_auth",
    value: token,
    secure: url.protocol === "https:",
    httpOnly: true,
    sameSite: "no_restriction",
  });

  // Start a local TCP proxy that bridges WebSocket upgrades to the box server
  // over HTTP/1.1. Chromium negotiates HTTP/2 via ALPN for TLS connections,
  // but the box proxy (Caddy) does not support WebSocket over HTTP/2. The
  // proxy accepts HTTP/1.1 WS upgrades on loopback and forwards them to the
  // box server with the _port_auth cookie injected.
  await ensureBoxWsProxy(origin, token);
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `Remote auth request failed (${response.status}).`;
  try {
    const parsed = JSON.parse(text) as { readonly error?: string };
    return parsed.error || text;
  } catch {
    return text;
  }
}

export async function fetchRemoteJson(input: DesktopRemoteJsonRequest): Promise<unknown> {
  const rawUrl = requestUrlFor(input);
  const boxAuth = extractBoxPortAuth(rawUrl);
  const requestUrl = boxAuth ? stripBoxToken(rawUrl) : rawUrl;

  if (boxAuth) {
    await seedBoxPortAuthCookie(rawUrl, boxAuth.token);
  }

  const response = await fetch(requestUrl, {
    method: input.method ?? "GET",
    headers: {
      ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(input.bearerToken ? { authorization: `Bearer ${input.bearerToken}` } : {}),
      ...(boxAuth ? { cookie: boxAuth.cookieHeader } : {}),
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const contentType = response.headers.get("content-type") ?? "unknown content type";
    throw new Error(
      `Remote auth endpoint returned ${contentType} instead of JSON (${response.status}).`,
      { cause: error },
    );
  }
}
