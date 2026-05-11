/**
 * Trifecta VS Code Extension
 *
 * Architecture:
 *   1. ServerManager — spawns the Trifecta server, completes pairing auth
 *   2. ChatViewProvider — sidebar webview embedding the server's web UI
 *   3. Webview iframe — the full Trifecta React app with model picker, chat, etc.
 *
 * The server handles ALL provider logic (Codex, Claude, OpenCode, Cursor).
 * For the MVP, the webview embeds the server's React web app via iframe.
 * This gives us the real model picker, real RPC protocol, real everything.
 */

import * as vscode from "vscode";
import { ServerManager } from "./serverManager";

let serverManager: ServerManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("trifecta");
  const autoStart = config.get<boolean>("autoStart", true);

  serverManager = new ServerManager(context);

  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    serverManager,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("trifecta.chat", chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("trifecta.openPanel", () => {
      vscode.commands.executeCommand("workbench.view.extension.trifecta");
    }),
    vscode.commands.registerCommand("trifecta.focusChat", () => {
      chatProvider.focusInput();
    }),
  );

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = "trifecta.openPanel";
  statusBar.text = "$(hubot) Trifecta";
  statusBar.tooltip = "Open Trifecta chat";
  statusBar.show();
  context.subscriptions.push(statusBar);

  if (autoStart) {
    serverManager.start().catch((err: any) => {
      vscode.window.showErrorMessage(
        `Trifecta failed to start: ${err.message}`,
      );
    });
  }

  context.subscriptions.push({
    dispose: () => serverManager?.stop(),
  });
}

export function deactivate() {
  serverManager?.stop();
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly serverManager: ServerManager,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };

    // Loading screen
    webviewView.webview.html = this.getLoadingHtml();

    // When server is ready, swap to embedded web UI
    this.serverManager.onReady((conn) => {
      webviewView.webview.html = this.getChatHtml(conn.wsUrl);
    });

    const conn = this.serverManager.getConnection();
    if (conn) {
      webviewView.webview.html = this.getChatHtml(conn.wsUrl);
    }
  }

  focusInput() {
    this._view?.show(true);
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; display: flex; align-items: center; justify-content: center; font-family: var(--vscode-font-family, -apple-system, sans-serif); color: var(--vscode-descriptionForeground, #6c7086); background: var(--vscode-sideBar-background, #1e1e2e); }
    .pulse { width: 12px; height: 12px; background: var(--vscode-focusBorder, #89b4fa); border-radius: 50%; animation: pulse 1.5s infinite; margin-right: 10px; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    .row { display: flex; align-items: center; font-size: 13px; }
  </style>
</head>
<body>
  <div class="row"><div class="pulse"></div> Starting Trifecta…</div>
</body>
</html>`;
  }

  private getChatHtml(wsUrl: string): string {
    // Embed the server's React web app in an iframe.
    // It has the real model picker, real RPC, real everything.
    const serverUrl = wsUrl.replace(/^ws/, "http").replace(/\/ws.*/, "");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src ${serverUrl} 'unsafe-inline';
                 style-src ${serverUrl} 'unsafe-inline';
                 connect-src ${serverUrl} ws://127.0.0.1:* http://127.0.0.1:*;
                 img-src ${serverUrl} data:;
                 font-src ${serverUrl};">
  <title>Trifecta</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="${serverUrl}"></iframe>
</body>
</html>`;
  }
}
