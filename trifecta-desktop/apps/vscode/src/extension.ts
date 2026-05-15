/**
 * Trifecta VS Code Extension
 *
 * Spawns the Trifecta server and embeds the web UI in a sidebar iframe.
 * The web app handles everything — model picker, chat, git, terminal.
 */

import * as vscode from "vscode";
import { ServerManager } from "./serverManager";

let serverManager: ServerManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("trifecta");
  const autoStart = config.get<boolean>("autoStart", true);

  serverManager = new ServerManager(context);

  const chatProvider = new ChatViewProvider(serverManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("trifecta.chat", chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("trifecta.openPanel", () => {
      vscode.commands.executeCommand("workbench.view.extension.trifecta");
    }),
  );

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = "trifecta.openPanel";
  statusBar.text = "$(hubot) Trifecta";
  statusBar.show();
  context.subscriptions.push(statusBar);

  if (autoStart) {
    serverManager.start().catch((err: any) => {
      vscode.window.showErrorMessage(`Trifecta: ${err.message}`);
    });
  }

  context.subscriptions.push({ dispose: () => serverManager?.stop() });
}

export function deactivate() {
  serverManager?.stop();
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly serverManager: ServerManager) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    const conn = this.serverManager.getConnection();
    if (conn) {
      webviewView.webview.options = {
        enableScripts: true,
        portMapping: [{ extensionHostPort: conn.port, webviewPort: conn.port }],
      };
      webviewView.webview.html = this.getChatHtml(conn);
    } else {
      this.serverManager.onReady((conn) => {
        webviewView.webview.options = {
          enableScripts: true,
          portMapping: [{ extensionHostPort: conn.port, webviewPort: conn.port }],
        };
        webviewView.webview.html = this.getChatHtml(conn);
      });
    }
  }

  private getChatHtml(conn: { port: number; pairingToken: string | null; wsToken: string | null; sessionToken: string | null }): string {
    const baseUrl = `http://127.0.0.1:${conn.port}`;
    let iframeSrc: string;
    if (conn.wsToken) {
      iframeSrc = `${baseUrl}/?bearer=${conn.sessionToken}&wsToken=${conn.wsToken}`;
    } else {
      iframeSrc = `${baseUrl}/#token=${conn.pairingToken}`;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe id="belweave-iframe" src="${iframeSrc}"></iframe>
</body>
</html>`;
  }
}
