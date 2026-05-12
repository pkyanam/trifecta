let injectedBearerToken: string | null = null;

if (typeof window !== "undefined") {
  // Check for an injected bearer token passed as a URL query parameter (?bearer=...)
  // by the VS Code/Cursor extension. This avoids race conditions with postMessage.
  const urlParams = new URLSearchParams(window.location.search);
  const bearerFromUrl = urlParams.get("bearer");
  if (bearerFromUrl) {
    injectedBearerToken = bearerFromUrl;
    // Clean up the URL so the token isn't visible in the address bar
    urlParams.delete("bearer");
    const newSearch = urlParams.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  }

  // Check for inline script injection from the extension
  const win = window as unknown as Record<string, unknown>;
  if (typeof win.__TRIFECTA_SESSION_TOKEN__ === "string") {
    injectedBearerToken = win.__TRIFECTA_SESSION_TOKEN__ as string;
  }
  // Listen for postMessage from extension
  window.addEventListener("message", (event: MessageEvent) => {
    if (
      event.data &&
      typeof event.data === "object" &&
      "type" in event.data &&
      event.data.type === "trifecta-session-token" &&
      typeof event.data.token === "string"
    ) {
      injectedBearerToken = event.data.token;
    }
  });
}

export function getInjectedBearerToken(): string | null {
  return injectedBearerToken;
}

import type {
  AuthBootstrapInput,
  AuthBootstrapResult,
  AuthClientMetadata,
  AuthCreatePairingCredentialInput,
  AuthPairingCredentialResult,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
  AuthSessionId,
  AuthSessionState,
} from "@t3tools/contracts";

import {
  getPairingTokenFromUrl,
  stripPairingTokenFromUrl as stripPairingTokenUrl,
} from "../../pairingUrl";

import { resolvePrimaryEnvironmentHttpUrl } from "./target";
import * as Data from "effect/Data";
import * as Predicate from "effect/Predicate";

export class BootstrapHttpError extends Data.TaggedError("BootstrapHttpError")<{
  readonly message: string;
  readonly status: number;
}> {}
const isBootstrapHttpError = (u: unknown): u is BootstrapHttpError =>
  Predicate.isTagged(u, "BootstrapHttpError");

export interface ServerPairingLinkRecord {
  readonly id: string;
  readonly credential: string;
  readonly role: "owner" | "client";
  readonly subject: string;
  readonly label?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ServerClientSessionRecord {
  readonly sessionId: AuthSessionId;
  readonly subject: string;
  readonly role: "owner" | "client";
  readonly method: "browser-session-cookie" | "bearer-session-token";
  readonly client: AuthClientMetadata;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly lastConnectedAt: string | null;
  readonly connected: boolean;
  readonly current: boolean;
}

type ServerAuthGateState =
  | { status: "authenticated" }
  | {
      status: "requires-auth";
      auth: AuthSessionState["auth"];
      errorMessage?: string;
    };

let bootstrapPromise: Promise<ServerAuthGateState> | null = null;
let resolvedAuthenticatedGateState: ServerAuthGateState | null = null;
const AUTH_SESSION_ESTABLISH_TIMEOUT_MS = 2_000;
const AUTH_SESSION_ESTABLISH_STEP_MS = 100;

export function peekPairingTokenFromUrl(): string | null {
  return getPairingTokenFromUrl(new URL(window.location.href));
}

export function stripPairingTokenFromUrl() {
  const url = new URL(window.location.href);
  const next = stripPairingTokenUrl(url);
  if (next.toString() === url.toString()) {
    return;
  }
  window.history.replaceState({}, document.title, next.toString());
}

export function takePairingTokenFromUrl(): string | null {
  const token = peekPairingTokenFromUrl();
  if (!token) {
    return null;
  }
  stripPairingTokenFromUrl();
  return token;
}

function getDesktopBootstrapCredential(): string | null {
  const bootstrap = window.desktopBridge?.getLocalEnvironmentBootstrap();
  return typeof bootstrap?.bootstrapToken === "string" && bootstrap.bootstrapToken.length > 0
    ? bootstrap.bootstrapToken
    : null;
}

export async function fetchSessionState(): Promise<AuthSessionState> {
  return retryTransientBootstrap(async () => {
    const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/session"), {
      credentials: "include",
    });
    if (!response.ok) {
      throw new BootstrapHttpError({
        message: `Failed to load server auth session state (${response.status}).`,
        status: response.status,
      });
    }
    return (await response.json()) as AuthSessionState;
  });
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const text = await response.text();
  return text || fallbackMessage;
}

const INVALID_BOOTSTRAP_CREDENTIAL_MESSAGES = new Set([
  "Invalid bootstrap credential.",
  "Unknown bootstrap credential.",
]);

function parseBootstrapErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: unknown;
    };
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error.trim();
    }
  } catch {
    // Not JSON; fall back to plain text.
  }

  return trimmed;
}

function toFriendlyBootstrapErrorMessage(status: number, message: string): string {
  const parsedMessage = parseBootstrapErrorMessage(message);
  if (status === 401 && INVALID_BOOTSTRAP_CREDENTIAL_MESSAGES.has(parsedMessage)) {
    return "Invalid pairing token. Check the token and try again.";
  }

  return parsedMessage;
}

async function exchangeBootstrapCredential(credential: string): Promise<AuthBootstrapResult> {
  return retryTransientBootstrap(async () => {
    const payload: AuthBootstrapInput = { credential };
    const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/bootstrap"), {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const message = toFriendlyBootstrapErrorMessage(response.status, await response.text());
      throw new BootstrapHttpError({
        message: message || `Failed to bootstrap auth session (${response.status}).`,
        status: response.status,
      });
    }

    return (await response.json()) as AuthBootstrapResult;
  });
}

async function waitForAuthenticatedSessionAfterBootstrap(): Promise<AuthSessionState> {
  const startedAt = Date.now();

  while (true) {
    const session = await fetchSessionState();
    if (session.authenticated) {
      return session;
    }

    if (Date.now() - startedAt >= AUTH_SESSION_ESTABLISH_TIMEOUT_MS) {
      throw new Error("Timed out waiting for authenticated session after bootstrap.");
    }

    await waitForBootstrapRetry(AUTH_SESSION_ESTABLISH_STEP_MS);
  }
}

const TRANSIENT_BOOTSTRAP_STATUS_CODES = new Set([502, 503, 504]);
const BOOTSTRAP_RETRY_TIMEOUT_MS = 15_000;
const BOOTSTRAP_RETRY_STEP_MS = 500;

export async function retryTransientBootstrap<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientBootstrapError(error)) {
        throw error;
      }

      if (Date.now() - startedAt >= BOOTSTRAP_RETRY_TIMEOUT_MS) {
        throw error;
      }

      await waitForBootstrapRetry(BOOTSTRAP_RETRY_STEP_MS);
    }
  }
}

function waitForBootstrapRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isTransientBootstrapError(error: unknown): boolean {
  if (isBootstrapHttpError(error)) {
    return TRANSIENT_BOOTSTRAP_STATUS_CODES.has(error.status);
  }

  if (error instanceof TypeError) {
    return true;
  }

  return error instanceof DOMException && error.name === "AbortError";
}

let capturedWsToken: string | null = null;
let capturedSessionToken: string | null = null;

export function getCapturedWsToken(): string | null {
  return capturedWsToken;
}

export function getCapturedSessionToken(): string | null {
  return capturedSessionToken;
}

function getWsTokenFromQueryParams(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("wsToken");
}

/** Capture the wsToken and sessionToken from URL before bootstrapServerAuth strips them. */
function captureWsToken(): void {
  if (capturedWsToken) return;
  capturedWsToken = getWsTokenFromQueryParams();
  // Also capture sessionToken passed by the extension for HTTP auth
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const sessionTokenFromUrl = params.get("sessionToken");
    if (sessionTokenFromUrl) {
      capturedSessionToken = sessionTokenFromUrl;
      // Expose to window for img tags and other non-JS requests
      (window as unknown as Record<string, unknown>).__TRIFECTA_SESSION_TOKEN__ = sessionTokenFromUrl;
    }
  }
}

// Capture tokens from URL at module load time, before TanStack Router or auth logic
// strips query params via replaceState.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  const wsTokenFromUrl = params.get("wsToken");
  if (wsTokenFromUrl) {
    capturedWsToken = wsTokenFromUrl;
  }
  const sessionTokenFromUrl = params.get("sessionToken");
  if (sessionTokenFromUrl) {
    capturedSessionToken = sessionTokenFromUrl;
    // Expose to window for img tags and other non-JS requests
    (window as unknown as Record<string, unknown>).__TRIFECTA_SESSION_TOKEN__ = sessionTokenFromUrl;
  }
}

async function bootstrapServerAuth(): Promise<ServerAuthGateState> {
  // The extension pre-consumed the pairing token and passed the wsToken
  // as a URL query param (?wsToken=XXX). This proves the session is authenticated.
  const wsTokenFromExt = getWsTokenFromQueryParams();
  if (wsTokenFromExt) {
    capturedWsToken = wsTokenFromExt;
    // Also capture sessionToken if passed alongside wsToken
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sessionTokenFromUrl = params.get("sessionToken");
      if (sessionTokenFromUrl) {
        capturedSessionToken = sessionTokenFromUrl;
        (window as unknown as Record<string, unknown>).__TRIFECTA_SESSION_TOKEN__ = sessionTokenFromUrl;
      }
    }
    // Clean up the URL so the token isn't visible
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.delete("wsToken");
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);

    return { status: "authenticated" };
  }

  // Check for a pre-injected bearer token from the extension (postMessage/inline script).
  const bearerToken = getInjectedBearerToken();
  if (bearerToken) {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${bearerToken}` };
      const response = await fetch(
        resolvePrimaryEnvironmentHttpUrl("/api/auth/session"),
        { headers },
      );
      if (response.ok) {
        const session = (await response.json()) as AuthSessionState;
        if (session.authenticated) {
          injectedBearerToken = bearerToken;
          return { status: "authenticated" };
        }
      }
    } catch {
      // Fall through to normal flow
    }
  }

  let bootstrapCredential = getDesktopBootstrapCredential();

  // Fallback: read pairing token from URL hash (#token=…) for desktop/extension embeds
  if (!bootstrapCredential) {
    bootstrapCredential = peekPairingTokenFromUrl();
  }

  const currentSession = await fetchSessionState();
  if (currentSession.authenticated) {
    return { status: "authenticated" };
  }

  if (!bootstrapCredential) {
    return {
      status: "requires-auth",
      auth: currentSession.auth,
    };
  }

  try {
    await exchangeBootstrapCredential(bootstrapCredential);
    await waitForAuthenticatedSessionAfterBootstrap();
    // Clean up hash so token isn't reused on refresh
    stripPairingTokenFromUrl();
    return { status: "authenticated" };
  } catch (error) {
    return {
      status: "requires-auth",
      auth: currentSession.auth,
      errorMessage: error instanceof Error ? error.message : "Authentication failed.",
    };
  }
}

export async function submitServerAuthCredential(credential: string): Promise<void> {
  const trimmedCredential = credential.trim();
  if (!trimmedCredential) {
    throw new Error("Enter a pairing token to continue.");
  }

  resolvedAuthenticatedGateState = null;
  await exchangeBootstrapCredential(trimmedCredential);
  bootstrapPromise = null;
  stripPairingTokenFromUrl();
}

export async function createServerPairingCredential(
  label?: string,
): Promise<AuthPairingCredentialResult> {
  const trimmedLabel = label?.trim();
  const payload: AuthCreatePairingCredentialInput = trimmedLabel ? { label: trimmedLabel } : {};
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/pairing-token"), {
    body: JSON.stringify(payload),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to create pairing credential (${response.status}).`),
    );
  }

  return (await response.json()) as AuthPairingCredentialResult;
}

export async function listServerPairingLinks(): Promise<ReadonlyArray<ServerPairingLinkRecord>> {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/pairing-links"), {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to load pairing links (${response.status}).`),
    );
  }

  return (await response.json()) as ReadonlyArray<ServerPairingLinkRecord>;
}

export async function revokeServerPairingLink(id: string): Promise<void> {
  const payload: AuthRevokePairingLinkInput = { id };
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/pairing-links/revoke"), {
    body: JSON.stringify(payload),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to revoke pairing link (${response.status}).`),
    );
  }
}

export async function listServerClientSessions(): Promise<
  ReadonlyArray<ServerClientSessionRecord>
> {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/clients"), {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to load paired clients (${response.status}).`),
    );
  }

  return (await response.json()) as ReadonlyArray<ServerClientSessionRecord>;
}

export async function revokeServerClientSession(sessionId: AuthSessionId): Promise<void> {
  const payload: AuthRevokeClientSessionInput = { sessionId };
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/clients/revoke"), {
    body: JSON.stringify(payload),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to revoke client session (${response.status}).`),
    );
  }
}

export async function revokeOtherServerClientSessions(): Promise<number> {
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/auth/clients/revoke-others"),
    {
      credentials: "include",
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to revoke other client sessions (${response.status}).`,
      ),
    );
  }

  const result = (await response.json()) as { revokedCount?: number };
  return result.revokedCount ?? 0;
}

export async function resolveInitialServerAuthGateState(): Promise<ServerAuthGateState> {
  if (resolvedAuthenticatedGateState?.status === "authenticated") {
    return resolvedAuthenticatedGateState;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  const nextPromise = bootstrapServerAuth();
  bootstrapPromise = nextPromise;
  return nextPromise
    .then((result) => {
      if (result.status === "authenticated") {
        resolvedAuthenticatedGateState = result;
      }
      return result;
    })
    .finally(() => {
      if (bootstrapPromise === nextPromise) {
        bootstrapPromise = null;
      }
    });
}

export function __resetServerAuthBootstrapForTests() {
  bootstrapPromise = null;
  resolvedAuthenticatedGateState = null;
}
