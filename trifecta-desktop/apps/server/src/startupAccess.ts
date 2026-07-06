import { networkInterfaces } from "node:os";

import { QrCode } from "@belweave/shared/qrCode";
import { fromJsonStringPretty } from "@belweave/shared/schemaJson";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpServer } from "effect/unstable/http";

import { ServerConfig } from "./config.ts";
import { ServerAuth } from "./auth/Services/ServerAuth.ts";

export interface HeadlessServeAccessInfo {
  readonly connectionString: string;
  readonly token: string;
  readonly pairingUrl: string;
  readonly credentialSource: "startup-pairing" | "review-pairing-token";
  readonly expiresAt: string | undefined;
}

const HeadlessServeAccessFilePayload = Schema.Struct({
  version: Schema.Literal(1),
  connectionString: Schema.String,
  token: Schema.String,
  pairingUrl: Schema.String,
  credentialSource: Schema.Literals(["startup-pairing", "review-pairing-token"]),
  expiresAt: Schema.optional(Schema.String),
});

const encodeHeadlessServeAccessFilePayload = Schema.encodeSync(
  fromJsonStringPretty(HeadlessServeAccessFilePayload),
);

type NetworkInterfacesMap = ReturnType<typeof networkInterfaces>;

export const isLoopbackHost = (host: string | undefined): boolean => {
  if (!host || host.length === 0) {
    return true;
  }

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("127.")
  );
};

export const isWildcardHost = (host: string | undefined): boolean =>
  host === "0.0.0.0" || host === "::" || host === "[::]";

export const formatHostForUrl = (host: string): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

const normalizeHost = (host: string): string =>
  host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

const isIpv4Family = (family: string | number): boolean => family === "IPv4" || family === 4;

const isIpv6Family = (family: string | number): boolean => family === "IPv6" || family === 6;

export const resolveHeadlessConnectionHost = (
  host: string | undefined,
  interfaces: NetworkInterfacesMap = networkInterfaces(),
): string => {
  if (!host) {
    return "localhost";
  }

  if (!isWildcardHost(host)) {
    return normalizeHost(host);
  }

  const interfaceEntries = Object.values(interfaces).flatMap((entries) => entries ?? []);
  const externalIpv4 = interfaceEntries.find(
    (entry) => !entry.internal && isIpv4Family(entry.family),
  );
  if (externalIpv4) {
    return externalIpv4.address;
  }

  const externalIpv6 = interfaceEntries.find(
    (entry) => !entry.internal && isIpv6Family(entry.family),
  );
  return externalIpv6 ? normalizeHost(externalIpv6.address) : "localhost";
};

export const resolveHeadlessConnectionString = (
  host: string | undefined,
  port: number,
  interfaces: NetworkInterfacesMap = networkInterfaces(),
): string => {
  const connectionHost = resolveHeadlessConnectionHost(host, interfaces);
  return `http://${formatHostForUrl(connectionHost)}:${port}`;
};

export const resolveListeningPort = (address: unknown, fallbackPort: number): number => {
  if (
    typeof address === "object" &&
    address !== null &&
    "port" in address &&
    typeof address.port === "number"
  ) {
    return address.port;
  }
  return fallbackPort;
};

export const buildPairingUrl = (connectionString: string, token: string): string => {
  const url = new URL(connectionString);
  url.pathname = "/pair";
  url.searchParams.delete("token");
  url.hash = new URLSearchParams([["token", token]]).toString();
  return url.toString();
};

export const renderTerminalQrCode = (value: string, margin = 2): string => {
  const qrCode = QrCode.encodeText(value, QrCode.Ecc.MEDIUM);
  const rows: Array<string> = [];
  const isDark = (x: number, y: number): boolean =>
    x >= 0 && x < qrCode.size && y >= 0 && y < qrCode.size && qrCode.getModule(x, y);

  for (let y = -margin; y < qrCode.size + margin; y += 2) {
    let row = "";

    for (let x = -margin; x < qrCode.size + margin; x += 1) {
      const topDark = isDark(x, y);
      const bottomDark = isDark(x, y + 1);

      row += topDark ? (bottomDark ? "█" : "▀") : bottomDark ? "▄" : " ";
    }

    rows.push(row);
  }

  return rows.join("\n");
};

export const formatHeadlessServeOutput = (accessInfo: HeadlessServeAccessInfo): string =>
  [
    "Trifecta server is ready.",
    `Connection string: ${accessInfo.connectionString}`,
    `Token: ${accessInfo.token}`,
    `Pairing URL: ${accessInfo.pairingUrl}`,
    "",
    renderTerminalQrCode(accessInfo.pairingUrl),
    "",
  ].join("\n");

export const issueHeadlessServeAccessInfo = Effect.fn("issueHeadlessServeAccessInfo")(function* () {
  const serverConfig = yield* ServerConfig;
  const httpServer = yield* HttpServer.HttpServer;
  const serverAuth = yield* ServerAuth;

  // Use public URL if configured, otherwise auto-detect from network interfaces
  const localPort = resolveListeningPort(httpServer.address, serverConfig.port);
  const connectionString = serverConfig.publicUrl
    ? serverConfig.publicUrl.toString().replace(/\/$/, "")
    : resolveHeadlessConnectionString(serverConfig.host, localPort);

  if (serverConfig.reviewPairingToken) {
    return {
      connectionString,
      token: serverConfig.reviewPairingToken,
      pairingUrl: buildPairingUrl(connectionString, serverConfig.reviewPairingToken),
      credentialSource: "review-pairing-token",
      expiresAt: undefined,
    } satisfies HeadlessServeAccessInfo;
  }

  const pairingCredential = yield* serverAuth.issuePairingCredential({ role: "owner" });

  return {
    connectionString,
    token: pairingCredential.credential,
    pairingUrl: buildPairingUrl(connectionString, pairingCredential.credential),
    credentialSource: "startup-pairing",
    expiresAt: DateTime.formatIso(pairingCredential.expiresAt),
  } satisfies HeadlessServeAccessInfo;
});

export const writeHeadlessServeAccessFile = Effect.fn("writeHeadlessServeAccessFile")(function* (
  accessInfo: HeadlessServeAccessInfo,
) {
  const serverConfig = yield* ServerConfig;
  if (!serverConfig.headlessAccessFile) return;

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const filePath = serverConfig.headlessAccessFile;
  const payload = {
    version: 1,
    connectionString: accessInfo.connectionString,
    token: accessInfo.token,
    pairingUrl: accessInfo.pairingUrl,
    credentialSource: accessInfo.credentialSource,
    ...(accessInfo.expiresAt ? { expiresAt: accessInfo.expiresAt } : {}),
  } satisfies typeof HeadlessServeAccessFilePayload.Type;

  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  yield* fs.writeFileString(filePath, `${encodeHeadlessServeAccessFilePayload(payload)}\n`);
  yield* fs.chmod(filePath, 0o600).pipe(Effect.orElseSucceed(() => undefined));
});
