/**
 * Trifecta VS Code Extension
 *
 * Architecture — three layers:
 *   1. ServerManager — spawns the Trifecta server, completes pairing auth
 *   2. ChatViewProvider — sidebar webview with custom chat UI
 *   3. Webview HTML — connects to server WebSocket with auth token
 *
 * The server handles ALL provider logic (Codex, Claude, OpenCode, Cursor).
 * The extension is a thin UI shell that speaks the existing WebSocket RPC
 * protocol — same one used by the iOS/Android/web apps.
 */

import * as vscode from "vscode";
import { ServerManager, ServerConnection } from "./serverManager";

let serverManager: ServerManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("trifecta");
  const autoStart = config.get<boolean>("autoStart", true);

  serverManager = new ServerManager(context);

  // Register sidebar webview
  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    serverManager,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("trifecta.chat", chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("trifecta.openPanel", () => {
      vscode.commands.executeCommand("workbench.view.extension.trifecta");
    }),
    vscode.commands.registerCommand("trifecta.focusChat", () => {
      chatProvider.focusInput();
    }),
  );

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = "trifecta.openPanel";
  statusBar.text = "$(hubot) Trifecta";
  statusBar.tooltip = "Open Trifecta chat";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Start server (fire-and-forget — webview will show loading until ready)
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

    webviewView.webview.options = {
      enableScripts: true,
    };

    // Show loading state immediately
    webviewView.webview.html = this.getLoadingHtml();

    // When server is ready, swap to real chat UI with embedded wsUrl.
    // No postMessage timing issues — the HTML is replaced atomically.
    this.serverManager.onReady((conn) => {
      webviewView.webview.html = this.getChatHtml(
        webviewView.webview,
        conn.wsUrl,
      );
    });

    // If server is already ready, show chat now
    const conn = this.serverManager.getConnection();
    if (conn) {
      webviewView.webview.html = this.getChatHtml(
        webviewView.webview,
        conn.wsUrl,
      );
    }

    // Handle focus requests from the chat
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === "focusInput") {
        // Forward to the chat iframe
      }
    });
  }

  focusInput() {
    this._view?.show(true);
    this._view?.webview.postMessage({ type: "focusInput" });
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

  private getChatHtml(webview: vscode.Webview, wsUrl: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src 'unsafe-inline';
                 style-src 'unsafe-inline';
                 connect-src ws://127.0.0.1:* http://127.0.0.1:*;
                 font-src ${webview.cspSource};">
  <title>Trifecta Chat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e2e);
      --fg: var(--vscode-sideBar-foreground, #cdd6f4);
      --border: var(--vscode-sideBar-border, #313244);
      --input-bg: var(--vscode-input-background, #181825);
      --input-fg: var(--vscode-input-foreground, #cdd6f4);
      --input-border: var(--vscode-input-border, #45475a);
      --accent: var(--vscode-focusBorder, #89b4fa);
      --user-msg-bg: var(--vscode-textBlockQuote-background, #2a2a3a);
      --error-fg: var(--vscode-errorForeground, #f38ba8);
      --muted: var(--vscode-descriptionForeground, #6c7086);
    }
    html, body { height: 100%; overflow: hidden; font-family: var(--vscode-font-family, -apple-system, sans-serif); font-size: var(--vscode-font-size, 13px); color: var(--fg); background: var(--bg); }
    #app { display: flex; flex-direction: column; height: 100%; }
    #header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 11px; flex-shrink: 0; }
    #header select { flex: 1; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none; }
    #header select:focus { border-color: var(--accent); }
    #status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    #status-dot.connected { background: #a6e3a1; }
    #status-dot.disconnected { background: #f38ba8; }
    #status-dot.connecting { background: #f9e2af; }
    #messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
    #messages::-webkit-scrollbar { width: 6px; }
    #messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .message { padding: 8px 12px; border-radius: 8px; max-width: 100%; word-wrap: break-word; line-height: 1.5; }
    .message.user { background: var(--user-msg-bg); align-self: flex-end; }
    .message.agent { background: transparent; border-left: 2px solid var(--accent); padding-left: 10px; }
    .message.agent.streaming { border-left-style: dashed; }
    .message .role { font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
    .message pre { background: var(--input-bg); padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin: 8px 0; }
    .message code { background: var(--input-bg); padding: 2px 4px; border-radius: 3px; font-size: 12px; }
    .message pre code { background: none; padding: 0; }
    .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--muted); gap: 8px; }
    .empty-state .icon { opacity: 0.6; }
    .empty-state .title { font-size: 14px; font-weight: 600; color: var(--fg); }
    .empty-state .hint { font-size: 11px; }
    .empty-state .actions { margin-top: 4px; }
    .empty-state .action-hint { font-size: 10px; background: var(--input-bg); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--input-border); }
    #input-area { padding: 8px 12px; border-top: 1px solid var(--border); flex-shrink: 0; }
    #input-area form { display: flex; gap: 8px; }
    #input-box { flex: 1; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; font-family: inherit; resize: none; outline: none; min-height: 36px; max-height: 120px; }
    #input-box:focus { border-color: var(--accent); }
    #input-box::placeholder { color: var(--muted); }
    #send-btn { background: var(--accent); color: var(--bg); border: none; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div id="app">
    <div id="header">
      <div id="status-dot" class="disconnected"></div>
      <select id="model-select" disabled>
        <option value="">Waiting for server…</option>
      </select>
    </div>
    <div id="messages">
      <div class="empty-state">
        <svg class="icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <div class="title">Trifecta</div>
        <div class="hint">AI coding agent in your sidebar</div>
        <div class="actions"><span class="action-hint">⌘L to focus</span></div>
      </div>
    </div>
    <div id="input-area">
      <form id="chat-form">
        <textarea id="input-box" placeholder="Ask Trifecta…" rows="1" disabled></textarea>
        <button type="submit" id="send-btn" disabled>Send</button>
      </form>
    </div>
  </div>

  <script>
    (() => {
      const vscode = acquireVsCodeApi();
      let ws = null, requestId = 0, pendingRequests = new Map(), streamingMsgId = null;
      const statusDot = document.getElementById('status-dot');
      const modelSelect = document.getElementById('model-select');
      const messagesEl = document.getElementById('messages');
      const inputBox = document.getElementById('input-box');
      const sendBtn = document.getElementById('send-btn');

      // If the server was already ready when the HTML was generated,
      // wsUrl will be embedded directly — no postMessage race condition.
      const EMBEDDED_WS_URL = "${wsUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}";

      function setStatus(s) {
        statusDot.className = s;
        const ok = s === 'connected';
        modelSelect.disabled = !ok;
        inputBox.disabled = !ok;
        sendBtn.disabled = !ok;
      }

      function connect(wsUrl) {
        if (ws) { ws.close(); ws = null; }
        setStatus('connecting');
        try {
          ws = new WebSocket(wsUrl);
        } catch(e) { return; }
        ws.onopen = () => { setStatus('connected'); fetchModels(); };
        ws.onclose = (e) => { setStatus('disconnected'); };
        ws.onerror = (e) => { setStatus('disconnected'); };
        ws.onmessage = (e) => { try { handleRpc(JSON.parse(e.data)); } catch(_) {} };
      }

      function sendRpc(method, params) {
        return new Promise((resolve, reject) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('Not connected'));
          const id = ++requestId;
          pendingRequests.set(id, { resolve, reject });
          ws.send(JSON.stringify({ _tag: 'Request', id, method, params }));
          setTimeout(() => { if (pendingRequests.has(id)) { pendingRequests.get(id).reject(new Error('timeout')); pendingRequests.delete(id); } }, 30000);
        });
      }

      function handleRpc(msg) {
        switch (msg._tag) {
          case 'Chunk': if (streamingMsgId) { const el = document.getElementById(streamingMsgId); if (el) { el.querySelector('.content').textContent += (msg.payload?.content || ''); messagesEl.scrollTop = messagesEl.scrollHeight; } } break;
          case 'Exit': if (streamingMsgId) { document.getElementById(streamingMsgId)?.classList.remove('streaming'); streamingMsgId = null; sendBtn.disabled = false; inputBox.disabled = false; inputBox.focus(); } break;
          case 'Ack': if (msg.id && pendingRequests.has(msg.id)) { pendingRequests.get(msg.id).resolve(msg.payload); pendingRequests.delete(msg.id); } break;
          case 'Defect': if (msg.id && pendingRequests.has(msg.id)) { pendingRequests.get(msg.id).reject(new Error(msg.payload?.message)); pendingRequests.delete(msg.id); } break;
          case 'Ping': ws?.send(JSON.stringify({ _tag: 'Pong' })); break;
        }
      }

      function addMessage(role, content, streaming) {
        const empty = messagesEl.querySelector('.empty-state'); if (empty) empty.remove();
        const id = 'msg-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = 'message ' + (role === 'You' ? 'user' : 'agent') + (streaming ? ' streaming' : '');
        div.innerHTML = '<div class="role">' + role + '</div><div class="content">' + content + '</div>';
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return id;
      }

      async function sendMessage(text) {
        if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
        addMessage('You', text);
        inputBox.value = ''; inputBox.style.height = 'auto';
        sendBtn.disabled = true; inputBox.disabled = true;
        streamingMsgId = addMessage('Agent', '', true);
        try {
          await sendRpc('provider.sendTurn', {
            threadId: 'vscode-' + Date.now(),
            input: { kind: 'text', text, cwd: '' },
            instanceId: 'codex',
            modelId: modelSelect.value || undefined,
          });
        } catch (err) {
          if (streamingMsgId) { document.getElementById(streamingMsgId)?.classList.remove('streaming'); streamingMsgId = null; }
          addMessage('Error', err.message);
          sendBtn.disabled = false; inputBox.disabled = false;
        }
      }

      async function fetchModels() {
        try {
          const result = await sendRpc('provider.listModels', {});
          if (result?.models) {
            modelSelect.innerHTML = result.models.map(m => '<option value="' + m.id + '">' + m.name + '</option>').join('');
            modelSelect.disabled = false;
          }
        } catch { modelSelect.innerHTML = '<option>GPT-5.4</option><option>Claude Sonnet 4</option><option>Claude Opus 4</option>'; modelSelect.disabled = false; }
      }

      document.getElementById('chat-form').addEventListener('submit', e => { e.preventDefault(); sendMessage(inputBox.value); });
      inputBox.addEventListener('input', () => { inputBox.style.height = 'auto'; inputBox.style.height = Math.min(inputBox.scrollHeight, 120) + 'px'; });
      inputBox.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputBox.value); } });
      // ── Startup ─────────────────────────────
      connect(EMBEDDED_WS_URL);
    })();
  </script>
</body>
</html>`;
  }
}
