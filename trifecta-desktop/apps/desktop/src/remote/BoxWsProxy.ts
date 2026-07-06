import * as Net from "node:net";
import * as Tls from "node:tls";

interface BoxProxyEntry {
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
  readonly portAuthToken: string;
  readonly secure: boolean;
}

const proxyByOrigin = new Map<string, BoxProxyEntry>();

function log(msg: string): void {
  process.stderr.write(`[BoxWsProxy] ${msg}\n`);
}

/**
 * Returns the origin key used for proxy lookups. Normalizes wss: → https:
 * and ws: → http: so that WebSocket URLs match their HTTP-origin counterparts.
 */
function normalizeOrigin(origin: string): string {
  if (origin.startsWith("wss://")) return `https://${origin.slice(6)}`;
  if (origin.startsWith("ws://")) return `http://${origin.slice(5)}`;
  return origin;
}

/**
 * Starts a local TCP proxy that bridges WebSocket upgrades from the renderer
 * to the box server over HTTP/1.1.
 *
 * The box proxy (Caddy) does not support WebSocket upgrades over HTTP/2
 * (RFC 8441 Extended CONNECT). Chromium negotiates HTTP/2 via ALPN for TLS
 * connections, causing WS upgrades to fail with HTTP/2 400 before reaching
 * the backend. This proxy accepts HTTP/1.1 WebSocket upgrades on loopback
 * and forwards them to the box server using Node's `tls`/`net` modules,
 * which always use HTTP/1.1.
 */
function startBoxProxy(
  remoteHost: string,
  remotePort: number,
  portAuthToken: string,
  secure: boolean,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = Net.createServer((clientSocket) => {
      log("client connected");

      let upgradeBuffer = Buffer.alloc(0);
      let headersParsed = false;
      let remoteSocket: Tls.TLSSocket | Net.Socket | null = null;
      let remoteConnected = false;
      let pendingRemoteData: Buffer[] = [];

      const connectToRemote = (rawRequest: Buffer) => {
        const requestStr = rawRequest.toString("utf-8");
        const headerEnd = requestStr.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          log("no header end found, destroying");
          clientSocket.destroy();
          return;
        }

        const headerSection = requestStr.slice(0, headerEnd);
        const body = requestStr.slice(headerEnd + 4);
        const lines = headerSection.split("\r\n");
        const requestLine = lines[0];
        const headerLines = lines.slice(1);

        // Remove existing Cookie and Host headers, inject correct ones.
        const filteredHeaders = headerLines.filter(
          (line) =>
            !line.toLowerCase().startsWith("cookie:") && !line.toLowerCase().startsWith("host:"),
        );
        filteredHeaders.push(`Host: ${remoteHost}`);
        filteredHeaders.push(`Cookie: _port_auth=${encodeURIComponent(portAuthToken)}`);

        const modifiedRequest =
          requestLine + "\r\n" + filteredHeaders.join("\r\n") + "\r\n\r\n" + body;

        log(`connecting to remote ${remoteHost}:${remotePort}`);

        const onRemoteConnect = () => {
          log("remote connected, sending upgrade request");
          remoteConnected = true;
          remoteSocket!.write(modifiedRequest);
          for (const chunk of pendingRemoteData) {
            remoteSocket!.write(chunk);
          }
          pendingRemoteData = [];
        };

        const onRemoteData = (data: Buffer) => {
          if (!clientSocket.destroyed) {
            clientSocket.write(data);
          }
        };

        const onRemoteClose = () => {
          log("remote closed");
          if (!clientSocket.destroyed) {
            clientSocket.destroy();
          }
        };

        if (secure) {
          remoteSocket = Tls.connect(
            {
              host: remoteHost,
              port: remotePort,
              servername: remoteHost,
              ALPNProtocols: ["http/1.1"],
            },
            onRemoteConnect,
          );
        } else {
          remoteSocket = Net.connect({ host: remoteHost, port: remotePort }, onRemoteConnect);
        }

        remoteSocket.on("data", onRemoteData);
        remoteSocket.on("close", onRemoteClose);
        remoteSocket.on("error", (err) => {
          log(`remote error: ${err.message}`);
          if (!clientSocket.destroyed) {
            clientSocket.destroy();
          }
        });
      };

      clientSocket.on("data", (data: Buffer) => {
        if (!headersParsed) {
          upgradeBuffer = Buffer.concat([upgradeBuffer, data]);
          const headerEnd = upgradeBuffer.indexOf("\r\n\r\n");
          if (headerEnd !== -1) {
            headersParsed = true;
            if (!remoteConnected && remoteSocket) {
              pendingRemoteData.push(upgradeBuffer);
            } else if (!remoteSocket) {
              connectToRemote(upgradeBuffer);
            } else {
              remoteSocket.write(upgradeBuffer);
            }
          }
        } else if (remoteSocket && remoteConnected) {
          remoteSocket.write(data);
        } else if (remoteSocket) {
          pendingRemoteData.push(data);
        }
      });

      clientSocket.on("close", () => {
        if (remoteSocket && !remoteSocket.destroyed) {
          remoteSocket.destroy();
        }
      });

      clientSocket.on("error", (err) => {
        log(`client error: ${err.message}`);
        if (remoteSocket && !remoteSocket.destroyed) {
          remoteSocket.destroy();
        }
      });
    });

    server.on("error", (err) => {
      log(`server error: ${err.message}`);
      reject(err);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        log(`listening on 127.0.0.1:${address.port}`);
        resolve(address.port);
      } else {
        reject(new Error("Failed to bind local proxy port."));
      }
    });
  });
}

/**
 * Ensures a local proxy exists for the given box origin and returns the
 * local port the proxy is listening on.
 */
export async function ensureBoxWsProxy(httpOrigin: string, portAuthToken: string): Promise<number> {
  const originKey = normalizeOrigin(httpOrigin);
  const existing = proxyByOrigin.get(originKey);
  if (existing) {
    return existing.localPort;
  }

  const url = new URL(httpOrigin);
  const secure = url.protocol === "https:";
  const host = url.hostname;
  const port = url.port ? Number.parseInt(url.port, 10) : secure ? 443 : 80;

  log(`starting proxy for ${originKey}`);
  const localPort = await startBoxProxy(host, port, portAuthToken, secure);
  const entry: BoxProxyEntry = {
    localPort,
    remoteHost: host,
    remotePort: port,
    portAuthToken,
    secure,
  };
  proxyByOrigin.set(originKey, entry);
  return localPort;
}

/**
 * Resolves a box WebSocket URL to a local proxy URL that the renderer can
 * connect to. Called by the web app via the desktop bridge before creating
 * a `new WebSocket()` connection.
 */
export async function resolveBoxWebSocketUrl(wsBaseUrl: string): Promise<string> {
  log(`resolveBoxWebSocketUrl input: ${wsBaseUrl}`);
  const url = new URL(wsBaseUrl);
  const token = url.searchParams.get("_token");
  if (!token) {
    return wsBaseUrl;
  }

  const httpOrigin = normalizeOrigin(url.origin);
  const localPort = await ensureBoxWsProxy(httpOrigin, token);
  log(`proxy port: ${localPort}`);

  const proxyUrl = new URL(url.pathname, `ws://127.0.0.1:${localPort}`);
  for (const [key, value] of url.searchParams) {
    if (key !== "_token") {
      proxyUrl.searchParams.set(key, value);
    }
  }
  const result = proxyUrl.toString();
  log(`resolveBoxWebSocketUrl output: ${result}`);
  return result;
}
