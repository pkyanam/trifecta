import Mime from "@effect/platform-node/Mime";
import { decodeOtlpTraceRecords } from "@belweave/shared/observability";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { cast } from "effect/Function";
import {
  HttpBody,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
} from "effect/unstable/http";
import { OtlpTracer } from "effect/unstable/observability";

import {
  ATTACHMENTS_ROUTE_PREFIX,
  normalizeAttachmentRelativePath,
  resolveAttachmentRelativePath,
} from "./attachmentPaths.ts";
import { resolveAttachmentPathById } from "./attachmentStore.ts";
import { resolveStaticDir, ServerConfig } from "./config.ts";
import { BrowserTraceCollector } from "./observability/Services/BrowserTraceCollector.ts";
import { ProjectFaviconResolver } from "./project/Services/ProjectFaviconResolver.ts";
import { ServerAuth } from "./auth/Services/ServerAuth.ts";
import { respondToAuthError } from "./auth/http.ts";
import { ServerEnvironment } from "./environment/Services/ServerEnvironment.ts";
import { HttpServer } from "effect/unstable/http";
import * as DateTime from "effect/DateTime";
import {
  browserApiCorsAllowedHeaders,
  browserApiCorsAllowedMethods,
  corsHeadersForRequest,
  isOriginAllowed,
} from "./httpCors.ts";

const PROJECT_FAVICON_CACHE_CONTROL = "public, max-age=3600";
const FALLBACK_PROJECT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#6b728080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-fallback="project-favicon"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>`;
const OTLP_TRACES_PROXY_PATH = "/api/observability/v1/traces";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Security headers applied to all static file and index.html responses.
 * The CSP meta tag in index.html provides the primary policy; these headers
 * provide defense-in-depth at the HTTP layer and add other standard headers.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

/**
 * CORS middleware layer with dynamic origin validation based on server config.
 *
 * Replaces the previous `access-control-allow-origin: *` wildcard with a
 * dynamic allowlist that validates each request's Origin header against:
 * - Loopback origins (127.0.0.1, localhost, ::1) on any port
 * - The server's own origin
 * - The configured devUrl and publicUrl
 */
export const browserApiCorsLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    // The runtime supports `allowedOrigins` as a function for dynamic origin
    // validation, but the TypeScript types only declare `ReadonlyArray<string>`.
    // Cast to work around the type limitation.
    return HttpRouter.cors({
      allowedOrigins: ((origin: string) => isOriginAllowed(origin, config)) as unknown as string[],
      allowedMethods: [...browserApiCorsAllowedMethods],
      allowedHeaders: [...browserApiCorsAllowedHeaders],
      credentials: true,
      maxAge: 600,
    });
  }),
);

export function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  return LOOPBACK_HOSTNAMES.has(normalizedHostname);
}

export function resolveDevRedirectUrl(devUrl: URL, requestUrl: URL): string {
  const redirectUrl = new URL(devUrl.toString());
  redirectUrl.pathname = requestUrl.pathname;
  redirectUrl.search = requestUrl.search;
  redirectUrl.hash = requestUrl.hash;
  return redirectUrl.toString();
}

const requireAuthenticatedRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  yield* serverAuth.authenticateHttpRequest(request);
});

export const serverEnvironmentRouteLayer = HttpRouter.add(
  "GET",
  "/.well-known/belweave/environment",
  Effect.gen(function* () {
    const descriptor = yield* Effect.service(ServerEnvironment).pipe(
      Effect.flatMap((serverEnvironment) => serverEnvironment.getDescriptor),
    );
    const corsHeaders = yield* corsHeadersForRequest;
    return HttpServerResponse.jsonUnsafe(descriptor, {
      status: 200,
      headers: corsHeaders,
    });
  }),
);

class DecodeOtlpTraceRecordsError extends Data.TaggedError("DecodeOtlpTraceRecordsError")<{
  readonly cause: unknown;
  readonly bodyJson: OtlpTracer.TraceData;
}> {}

export const otlpTracesProxyRouteLayer = HttpRouter.add(
  "POST",
  OTLP_TRACES_PROXY_PATH,
  Effect.gen(function* () {
    yield* requireAuthenticatedRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig;
    const otlpTracesUrl = config.otlpTracesUrl;
    const browserTraceCollector = yield* BrowserTraceCollector;
    const httpClient = yield* HttpClient.HttpClient;
    const bodyJson = cast<unknown, OtlpTracer.TraceData>(yield* request.json);

    yield* Effect.try({
      try: () => decodeOtlpTraceRecords(bodyJson),
      catch: (cause) => new DecodeOtlpTraceRecordsError({ cause, bodyJson }),
    }).pipe(
      Effect.flatMap((records) => browserTraceCollector.record(records)),
      Effect.catch((cause) =>
        Effect.logWarning("Failed to decode browser OTLP traces", {
          cause,
          bodyJson,
        }),
      ),
    );

    if (otlpTracesUrl === undefined) {
      return HttpServerResponse.empty({ status: 204 });
    }

    return yield* httpClient
      .post(otlpTracesUrl, {
        body: HttpBody.jsonUnsafe(bodyJson),
      })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.as(HttpServerResponse.empty({ status: 204 })),
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to export browser OTLP traces", {
            cause,
            otlpTracesUrl,
          }),
        ),
        Effect.catch(() =>
          Effect.succeed(HttpServerResponse.text("Trace export failed.", { status: 502 })),
        ),
      );
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);

export const attachmentsRouteLayer = HttpRouter.add(
  "GET",
  `${ATTACHMENTS_ROUTE_PREFIX}/*`,
  Effect.gen(function* () {
    yield* requireAuthenticatedRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const config = yield* ServerConfig;
    const rawRelativePath = url.value.pathname.slice(ATTACHMENTS_ROUTE_PREFIX.length);
    const normalizedRelativePath = normalizeAttachmentRelativePath(rawRelativePath);
    if (!normalizedRelativePath) {
      return HttpServerResponse.text("Invalid attachment path", { status: 400 });
    }

    const isIdLookup =
      !normalizedRelativePath.includes("/") && !normalizedRelativePath.includes(".");
    const filePath = isIdLookup
      ? resolveAttachmentPathById({
          attachmentsDir: config.attachmentsDir,
          attachmentId: normalizedRelativePath,
        })
      : resolveAttachmentRelativePath({
          attachmentsDir: config.attachmentsDir,
          relativePath: normalizedRelativePath,
        });
    if (!filePath) {
      return HttpServerResponse.text(isIdLookup ? "Not Found" : "Invalid attachment path", {
        status: isIdLookup ? 404 : 400,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const fileInfo = yield* fileSystem
      .stat(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!fileInfo || fileInfo.type !== "File") {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    return yield* HttpServerResponse.file(filePath, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.text("Internal Server Error", { status: 500 })),
      ),
    );
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);

export const projectFaviconRouteLayer = HttpRouter.add(
  "GET",
  "/api/project-favicon",
  Effect.gen(function* () {
    yield* requireAuthenticatedRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const projectCwd = url.value.searchParams.get("cwd");
    if (!projectCwd) {
      return HttpServerResponse.text("Missing cwd parameter", { status: 400 });
    }

    const faviconResolver = yield* ProjectFaviconResolver;
    const faviconFilePath = yield* faviconResolver.resolvePath(projectCwd);
    if (!faviconFilePath) {
      return HttpServerResponse.text(FALLBACK_PROJECT_FAVICON_SVG, {
        status: 200,
        contentType: "image/svg+xml",
        headers: {
          "Cache-Control": PROJECT_FAVICON_CACHE_CONTROL,
        },
      });
    }

    return yield* HttpServerResponse.file(faviconFilePath, {
      status: 200,
      headers: {
        "Cache-Control": PROJECT_FAVICON_CACHE_CONTROL,
      },
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.text("Internal Server Error", { status: 500 })),
      ),
    );
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);

export const staticAndDevRouteLayer = HttpRouter.add(
  "GET",
  "*",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);

    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const config = yield* ServerConfig;
    if (config.devUrl && isLoopbackHostname(url.value.hostname)) {
      return HttpServerResponse.redirect(resolveDevRedirectUrl(config.devUrl, url.value), {
        status: 302,
      });
    }

    const staticDir = config.staticDir ?? (config.devUrl ? yield* resolveStaticDir() : undefined);
    if (!staticDir) {
      return HttpServerResponse.text("No static directory configured and no dev URL set.", {
        status: 503,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staticRoot = path.resolve(staticDir);
    const staticRequestPath = url.value.pathname === "/" ? "/index.html" : url.value.pathname;
    const rawStaticRelativePath = staticRequestPath.replace(/^[/\\]+/, "");
    const hasRawLeadingParentSegment = rawStaticRelativePath.startsWith("..");
    const staticRelativePath = path.normalize(rawStaticRelativePath).replace(/^[/\\]+/, "");
    const hasPathTraversalSegment = staticRelativePath.startsWith("..");
    if (
      staticRelativePath.length === 0 ||
      hasRawLeadingParentSegment ||
      hasPathTraversalSegment ||
      staticRelativePath.includes("\0")
    ) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const isWithinStaticRoot = (candidate: string) =>
      candidate === staticRoot ||
      candidate.startsWith(staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`);

    let filePath = path.resolve(staticRoot, staticRelativePath);
    if (!isWithinStaticRoot(filePath)) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const ext = path.extname(filePath);
    if (!ext) {
      filePath = path.resolve(filePath, "index.html");
      if (!isWithinStaticRoot(filePath)) {
        return HttpServerResponse.text("Invalid static file path", { status: 400 });
      }
    }

    const fileInfo = yield* fileSystem
      .stat(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!fileInfo || fileInfo.type !== "File") {
      const indexPath = path.resolve(staticRoot, "index.html");
      const indexData = yield* fileSystem
        .readFile(indexPath)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      if (!indexData) {
        return HttpServerResponse.text("Not Found", { status: 404 });
      }
      return HttpServerResponse.uint8Array(indexData, {
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: SECURITY_HEADERS,
      });
    }

    const contentType = Mime.getType(filePath) ?? "application/octet-stream";
    const data = yield* fileSystem
      .readFile(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!data) {
      return HttpServerResponse.text("Internal Server Error", { status: 500 });
    }

    return HttpServerResponse.uint8Array(data, {
      status: 200,
      contentType,
      headers: SECURITY_HEADERS,
    });
  }),
);

/**
 * Health check endpoint for container orchestration.
 * Returns 200 OK when the server is healthy and accepting connections.
 */
export const healthCheckRouteLayer = HttpRouter.add(
  "GET",
  "/api/health",
  Effect.gen(function* () {
    const httpServer = yield* HttpServer.HttpServer;
    const address = httpServer.address;
    const isListening = typeof address === "object" && address !== null && "port" in address;
    const now = yield* DateTime.now;
    const corsHeaders = yield* corsHeadersForRequest;

    return HttpServerResponse.jsonUnsafe(
      {
        status: isListening ? "healthy" : "unhealthy",
        timestamp: DateTime.formatIso(now),
        address: isListening ? address : null,
      },
      {
        status: isListening ? 200 : 503,
        headers: corsHeaders,
      },
    );
  }),
);

/**
 * Server status endpoint for headless deployments.
 * Provides connection information including public URL, pairing URL, and auth status.
 * Requires authentication to prevent information leakage.
 */
export const serverStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/server/status",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* ServerAuth;
    const config = yield* ServerConfig;
    const httpServer = yield* HttpServer.HttpServer;

    // Authenticate the request
    yield* serverAuth.authenticateHttpRequest(request);

    const address = httpServer.address;
    const localPort =
      typeof address === "object" && address !== null && "port" in address
        ? address.port
        : config.port;

    // Use public URL if configured, otherwise construct from host/port
    const baseUrl = config.publicUrl
      ? config.publicUrl.toString().replace(/\/$/, "")
      : `http://${config.host ?? "localhost"}:${localPort}`;

    // Generate pairing URL if we have a review token or can issue one
    const pairingUrl = config.reviewPairingToken
      ? `${baseUrl}/pair#token=${encodeURIComponent(config.reviewPairingToken)}`
      : undefined;

    const corsHeaders = yield* corsHeadersForRequest;

    return HttpServerResponse.jsonUnsafe(
      {
        version: 1,
        mode: config.mode,
        baseUrl,
        localPort,
        host: config.host,
        pairingUrl,
        hasReviewToken: !!config.reviewPairingToken,
        tailscaleServeEnabled: config.tailscaleServeEnabled,
        tailscaleServePort: config.tailscaleServeEnabled ? config.tailscaleServePort : undefined,
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);
