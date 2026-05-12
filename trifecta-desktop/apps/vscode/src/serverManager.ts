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
  wsUrl: string;
  port: number;
  pairingToken: string | null;
  wsToken: string | null;
  sessionToken: string | null;
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
      // Suppress the pairing URL log line — Cursor auto-detects URLs from
      // the output channel and opens them, stealing the single-use token
      // before the embedded iframe gets a chance to consume it.
      const safe = text
        .split("\n")
        .filter((line) => !line.startsWith("Pairing URL:"))
        .join("\n");
      if (safe) this.outputChannel.append(safe);
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

    const pairingToken = await this.parsePairingToken();
    this.outputChannel.appendLine(`[trifecta] Token: ${pairingToken ?? "none"}`);

    // Pre-consume the pairing token via bearer bootstrap BEFORE the iframe loads.
    // This prevents Cursor from stealing the single-use token and also
    // gives us a session token to pass into the webview (since httpOnly
    // cookies don't work in VS Code webviews).
    const auth = pairingToken
      ? await this.bootstrapAuth(port, pairingToken)
      : null;
    const wsToken = auth?.wsToken ?? null;
    const sessionToken = auth?.sessionToken ?? null;
    if (pairingToken && !wsToken) {
      this.outputChannel.appendLine(
        "[trifecta] Warning: failed to pre-consume pairing token",
      );
    }

    return { port, pairingToken, wsToken, sessionToken, wsUrl: null as never };
  }

  /**
   * Parse the pairing token from the server's headless stdout.
   * The server prints: "Token: XXXX-XXXX-XXXX"
   */
  private async parsePairingToken(): Promise<string | null> {
    // The server may not have printed the token yet when waitForReady passes.
    // Retry with sleep to allow the token line to arrive via stdout stream.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const matches = this.stdoutBuffer.match(/Token:\s*(\S+)/g);
      if (matches && matches.length > 0) {
        for (let i = matches.length - 1; i >= 0; i--) {
          const m = matches[i].match(/Token:\s*(\S+)/);
          const token = m ? m[1] : null;
          if (token && token !== "none" && token.length >= 8) {
            return token;
          }
        }
      }
      await new Promise<void>((r) => setTimeout(r, 500));
    }
    return null;
  }

  /**
   * Complete the pairing flow:
   *   1. POST /api/auth/bootstrap/bearer with pairing token
   *   2. Extract sessionToken from response
   *   3. POST /api/auth/ws-token with session token
   *   4. Return both tokens
   */
  private async bootstrapAuth(
    port: number,
    pairingToken: string,
  ): Promise<{ wsToken: string; sessionToken: string } | null> {
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
      const wsToken = wsTokenData.token;
      if (!wsToken) {
        this.outputChannel.appendLine(
          "[trifecta] No wsToken in response",
        );
        return null;
      }

      return { wsToken, sessionToken };
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
