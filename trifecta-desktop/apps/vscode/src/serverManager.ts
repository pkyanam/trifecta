/**
 * ServerManager — spawns and manages the Trifecta server process.
 *
 * Lifecycle:
 *   1. Find server entry point (bun-monorepo or configured path)
 *   2. Spawn as child process (bun preferred, node fallback)
 *   3. Poll health endpoint until ready
 *   4. Capture the headless pairing token from stdout
 *   5. Bootstrap auth (pairing token → session → WebSocket token)
 *   6. Return WebSocket URL + token to the webview
 *   7. Clean shutdown on deactivate
 */

import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as net from "net";

export interface ServerConnection {
  /** Where the webview connects via WebSocket. */
  wsUrl: string;
  /** Port for HTTP API calls. */
  port: number;
}

type ReadyListener = (conn: ServerConnection) => void;

export class ServerManager {
  private process: ChildProcess | null = null;
  private connection: ServerConnection | null = null;
  private listeners: ReadyListener[] = [];
  private outputChannel: vscode.OutputChannel;
  private starting: Promise<ServerConnection> | null = null;
  private stdoutBuffer = "";

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel("Trifecta Server");
    context.subscriptions.push(this.outputChannel);
  }

  /** Start the server. Idempotent. */
  async start(): Promise<ServerConnection> {
    if (this.connection !== null) return this.connection;
    if (this.starting) return this.starting;

    this.starting = this.doStart();
    try {
      this.connection = await this.starting;
      this.starting = null;
      this.notifyListeners(this.connection);
      return this.connection;
    } catch (err) {
      this.starting = null;
      throw err;
    }
  }

  stop(): void {
    if (this.process) {
      this.outputChannel.appendLine("[trifecta] Stopping server…");
      this.process.kill("SIGTERM");
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
      this.process = null;
    }
    this.connection = null;
  }

  onReady(listener: ReadyListener): void {
    this.listeners.push(listener);
    if (this.connection !== null) {
      listener(this.connection);
    }
  }

  getConnection(): ServerConnection | null {
    return this.connection;
  }

  // ── Internal ─────────────────────────────────

  private notifyListeners(conn: ServerConnection): void {
    for (const l of this.listeners) {
      try { l(conn); } catch (_) {}
    }
  }

  private async doStart(): Promise<ServerConnection> {
    const serverPath = await this.resolveServerPath();
    const port = await findFreePort();

    this.outputChannel.appendLine(
      `[trifecta] Starting server on port ${port}…`,
    );

    const runtime = await this.resolveRuntime();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TRIFECTA_HOST: "127.0.0.1",
      TRIFECTA_PORT: String(port),
      TRIFECTA_MODE: "web",
      TRIFECTA_NO_BROWSER: "true",
      TRIFECTA_TAILSCALE_SERVE: "false",
      NODE_ENV: process.env.NODE_ENV || "development",
      HOME: os.homedir(),
      CODEX_HOME: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
      CLAUDE_CONFIG_DIR:
        process.env.CLAUDE_CONFIG_DIR ||
        path.join(os.homedir(), ".claude"),
      OPENCODE_CONFIG_DIR:
        process.env.OPENCODE_CONFIG_DIR ||
        path.join(os.homedir(), ".config", "opencode"),
    };

    const args =
      runtime === "bun"
        ? [serverPath, "serve", "--host", "127.0.0.1", "--port", String(port)]
        : [serverPath, "serve", "--host", "127.0.0.1", "--port", String(port)];

    const execPath = runtime === "bun" ? "bun" : process.execPath;

    this.stdoutBuffer = "";
    this.process = spawn(execPath, args, {
      cwd: path.dirname(serverPath),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      this.stdoutBuffer += text;
      this.outputChannel.append(text);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.on("exit", (code, signal) => {
      this.outputChannel.appendLine(
        `[trifecta] Server exited (code=${code}, signal=${signal})`,
      );
      this.process = null;
      this.connection = null;
    });

    this.process.on("error", (err) => {
      this.outputChannel.appendLine(
        `[trifecta] Server error: ${err.message}`,
      );
    });

    // Wait for health check
    await this.waitForReady(port);

    this.outputChannel.appendLine(
      `[trifecta] Server ready on http://127.0.0.1:${port}`,
    );

    // Complete pairing flow: read token from stdout → bootstrap → get WS token
    const pairingToken = this.parsePairingToken();
    const wsToken = pairingToken
      ? await this.bootstrapAuth(port, pairingToken)
      : null;

    const wsUrl = wsToken
      ? `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(wsToken)}`
      : `ws://127.0.0.1:${port}`;

    this.outputChannel.appendLine(
      `[trifecta] WebSocket ready at ${wsUrl}`,
    );

    return { wsUrl, port };
  }

  /**
   * Parse the pairing token from the server's headless stdout.
   * The server prints: "Token: XXXX-XXXX-XXXX"
   */
  private parsePairingToken(): string | null {
    const match = this.stdoutBuffer.match(/Token:\s*(\S+)/);
    return match ? match[1] : null;
  }

  /**
   * Complete the pairing flow:
   *   1. POST /api/auth/bootstrap/bearer with pairing token
   *   2. Extract sessionToken from response
   *   3. POST /api/auth/ws-token with session token
   *   4. Return wsToken
   */
  private async bootstrapAuth(
    port: number,
    pairingToken: string,
  ): Promise<string | null> {
    const base = `http://127.0.0.1:${port}`;
    try {
      // Step 1: Exchange pairing credential for session token
      const bootstrapResp = await fetch(
        `${base}/api/auth/bootstrap/bearer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: pairingToken }),
        },
      );
      if (!bootstrapResp.ok) {
        this.outputChannel.appendLine(
          `[trifecta] Bootstrap failed: ${bootstrapResp.status}`,
        );
        return null;
      }

      const bootstrap = await bootstrapResp.json();
      const sessionToken = bootstrap.sessionToken;
      if (!sessionToken) {
        this.outputChannel.appendLine(
          "[trifecta] No session token in bootstrap response",
        );
        return null;
      }

      // Step 2: Exchange session token for WebSocket token
      const wsTokenResp = await fetch(`${base}/api/auth/ws-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({}),
      });
      if (!wsTokenResp.ok) {
        this.outputChannel.appendLine(
          `[trifecta] WS token request failed: ${wsTokenResp.status}`,
        );
        return null;
      }

      const wsTokenData = await wsTokenResp.json();
      return wsTokenData.token || null;
    } catch (err) {
      this.outputChannel.appendLine(
        `[trifecta] Auth error: ${err}`,
      );
      return null;
    }
  }

  private async resolveServerPath(): Promise<string> {
    const config = vscode.workspace.getConfiguration("trifecta");
    const configured = config.get<string>("serverPath");
    if (configured && fs.existsSync(configured)) return configured;

    const candidates = [
      path.resolve(this.context.extensionPath, "..", "server", "dist", "bin.mjs"),
      path.join(
        os.homedir(),
        "projects",
        "trifecta",
        "trifecta-desktop",
        "apps",
        "server",
        "dist",
        "bin.mjs",
      ),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }

    const message =
      "Trifecta server not found. Build it first:\n\n" +
      "  cd ~/projects/trifecta/trifecta-desktop\n" +
      "  bun install && bun run build --filter=t3\n\n" +
      'Or set "trifecta.serverPath" in VS Code settings.';

    vscode.window
      .showErrorMessage("Trifecta server not found", "Show Details")
      .then((sel) => {
        if (sel === "Show Details") {
          this.outputChannel.show();
          this.outputChannel.appendLine(message);
        }
      });

    throw new Error(message);
  }

  private async resolveRuntime(): Promise<"bun" | "node"> {
    const bunCandidates = [
      "bun",
      path.join(os.homedir(), ".bun", "bin", "bun"),
      "/usr/local/bin/bun",
      "/opt/homebrew/bin/bun",
    ];

    for (const bunPath of bunCandidates) {
      if (fs.existsSync(bunPath)) {
        try {
          await new Promise<void>((resolve, reject) => {
            const proc = spawn(bunPath, ["--version"], {
              stdio: "ignore",
              env: { ...process.env, PATH: process.env.PATH },
            });
            proc.on("close", (code) => (code === 0 ? resolve() : reject()));
            proc.on("error", reject);
            setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 3000);
          });
          return "bun";
        } catch {
          continue;
        }
      }
    }
    return "node";
  }

  private async waitForReady(port: number): Promise<void> {
    const url = `http://127.0.0.1:${port}/.well-known/t3/environment`;
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (resp.ok) return;
      } catch {}
      await sleep(250);
    }

    throw new Error(
      `Trifecta server did not become ready within 30s at ${url}`,
    );
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        srv.close(() => resolve(addr.port));
      } else {
        srv.close(() => reject(new Error("Could not get port")));
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
