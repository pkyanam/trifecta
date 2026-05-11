/**
 * ServerManager — spawns and manages the Trifecta server process.
 *
 * Pattern mirrors the Electron DesktopBackendManager but simplified for
 * the VS Code extension environment:
 *   1. Find the server entry point
 *   2. Spawn as child process (bun or node)
 *   3. Poll health endpoint until ready
 *   4. Notify webview when connected
 *   5. Clean shutdown on deactivate
 */

import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as net from "net";

interface ReadyListener {
  (port: number): void;
}

export class ServerManager {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private listeners: ReadyListener[] = [];
  private outputChannel: vscode.OutputChannel;
  private starting: Promise<number> | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel("Trifecta Server");
    context.subscriptions.push(this.outputChannel);
  }

  /**
   * Start the Trifecta server. Idempotent — if already running, returns
   * the existing port immediately.
   */
  async start(): Promise<number> {
    if (this.port !== null) return this.port;
    if (this.starting) return this.starting;

    this.starting = this.doStart();
    try {
      this.port = await this.starting;
      this.starting = null;
      this.notifyListeners(this.port);
      return this.port;
    } catch (err) {
      this.starting = null;
      throw err;
    }
  }

  /** Stop the server. Safe to call multiple times. */
  stop(): void {
    if (this.process) {
      this.outputChannel.appendLine("[trifecta] Stopping server…");
      this.process.kill("SIGTERM");
      // Force kill after 5s if still alive
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
      this.process = null;
    }
    this.port = null;
  }

  /** Register a callback for when the server becomes ready. */
  onReady(listener: ReadyListener): void {
    this.listeners.push(listener);
    if (this.port !== null) {
      listener(this.port);
    }
  }

  /** Get the current server port, or null if not ready. */
  getReadyPort(): number | null {
    return this.port;
  }

  // ── Internal ─────────────────────────────────

  private notifyListeners(port: number): void {
    for (const l of this.listeners) {
      try {
        l(port);
      } catch (_) {
        // Don't let one broken listener break others
      }
    }
  }

  private async doStart(): Promise<number> {
    // 1. Resolve the server entry point
    const serverPath = await this.resolveServerPath();

    // 2. Find a free port
    const port = await findFreePort();
    this.outputChannel.appendLine(
      `[trifecta] Starting server on port ${port}…`,
    );

    // 3. Spawn the server process
    const runtime = await this.resolveRuntime();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TRIFECTA_HOST: "127.0.0.1",
      TRIFECTA_PORT: String(port),
      TRIFECTA_MODE: "web",
      TRIFECTA_NO_BROWSER: "true",
      TRIFECTA_TAILSCALE_SERVE: "false",
      NODE_ENV: process.env.NODE_ENV || "development",
      // Pass through provider auth from host
      HOME: os.homedir(),
      CODEX_HOME: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
      CLAUDE_CONFIG_DIR:
        process.env.CLAUDE_CONFIG_DIR ||
        path.join(os.homedir(), ".claude"),
      OPENCODE_CONFIG_DIR:
        process.env.OPENCODE_CONFIG_DIR ||
        path.join(os.homedir(), ".config", "opencode"),
    };

    // For bun: `bun run <serverPath> serve --host ... --port ...`
    // For node: `node <serverPath> serve --host ... --port ...`
    // `serve` is already headless — no --headless flag needed.
    const args = runtime === "bun"
      ? ["run", serverPath, "serve", "--host", "127.0.0.1", "--port", String(port)]
      : [serverPath, "serve", "--host", "127.0.0.1", "--port", String(port)];

    const execPath = runtime === "bun" ? "bun" : process.execPath;

    this.process = spawn(execPath, args, {
      cwd: path.dirname(serverPath),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      this.outputChannel.append(text);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      this.outputChannel.append(text);
    });

    this.process.on("exit", (code, signal) => {
      this.outputChannel.appendLine(
        `[trifecta] Server exited (code=${code}, signal=${signal})`,
      );
      this.process = null;
      this.port = null;
    });

    this.process.on("error", (err) => {
      this.outputChannel.appendLine(
        `[trifecta] Server error: ${err.message}`,
      );
    });

    // 4. Wait for server to be ready (poll health endpoint)
    await this.waitForReady(port);

    this.outputChannel.appendLine(
      `[trifecta] Server ready on http://127.0.0.1:${port}`,
    );

    return port;
  }

  /**
   * Resolve the server entry point.
   *
   * Priority:
   *   1. Configured path (trifecta.serverPath)
   *   2. Monorepo: ../server/dist/bin.mjs relative to this extension
   *   3. Monorepo: ~/projects/trifecta/trifecta-desktop/apps/server/dist/bin.mjs
   */
  private async resolveServerPath(): Promise<string> {
    const config = vscode.workspace.getConfiguration("trifecta");
    const configured = config.get<string>("serverPath");

    if (configured && fs.existsSync(configured)) {
      return configured;
    }

    // Look in the monorepo (extension is at apps/vscode/)
    const candidates = [
      // Extension is in monorepo at apps/vscode/
      path.resolve(
        this.context.extensionPath,
        "..",
        "server",
        "dist",
        "bin.mjs",
      ),
      // Default project location
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

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Not found — show error with instructions
    const message =
      `Trifecta server not found. Build it first:\n\n` +
      `  cd ~/projects/trifecta/trifecta-desktop\n` +
      `  bun install && bun run build --filter=t3\n\n` +
      `Or set the path in VS Code settings: "trifecta.serverPath"`;

    vscode.window.showErrorMessage("Trifecta server not found", "Show Details")
      .then((selection) => {
        if (selection === "Show Details") {
          this.outputChannel.show();
          this.outputChannel.appendLine(message);
        }
      });

    throw new Error(message);
  }

  /**
   * Resolve the JavaScript runtime. Prefers bun but falls back to Node.js.
   * Tries common bun install locations since the Extension Host may not
   * have ~/.bun/bin in its PATH.
   */
  private async resolveRuntime(): Promise<"bun" | "node"> {
    // Common bun binary locations
    const bunCandidates = [
      "bun",                                          // $PATH
      path.join(os.homedir(), ".bun", "bin", "bun"),  // default install
      "/usr/local/bin/bun",                            // Homebrew
      "/opt/homebrew/bin/bun",                         // Apple Silicon Homebrew
    ];

    for (const bunPath of bunCandidates) {
      if (fs.existsSync(bunPath)) {
        try {
          await new Promise<void>((resolve, reject) => {
            const proc = spawn(bunPath, ["--version"], {
              stdio: "ignore",
              env: { ...process.env, PATH: process.env.PATH },
            });
            proc.on("close", (code) =>
              code === 0 ? resolve() : reject(),
            );
            proc.on("error", reject);
            setTimeout(() => {
              proc.kill();
              reject(new Error("timeout"));
            }, 3000);
          });
          return "bun";
        } catch {
          continue;
        }
      }
    }

    // Fall back to Node.js (the one VS Code uses)
    return "node";
  }

  /**
   * Poll the server's health endpoint until it responds.
   * Timeout after 30 seconds.
   */
  private async waitForReady(port: number): Promise<void> {
    const url = `http://127.0.0.1:${port}/.well-known/t3/environment`;
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          return;
        }
      } catch {
        // Server not ready yet
      }
      await sleep(250);
    }

    throw new Error(`Trifecta server did not become ready within 30s at ${url}`);
  }
}

// ── Utilities ────────────────────────────────────

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not get port")));
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
