/**
 * Trifecta VS Code Extension
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────┐
 * │  VS Code Extension                               │
 * │                                                  │
 * │  ┌────────────────┐  ┌────────────────────────┐  │
 * │  │  ServerManager  │  │  ChatViewProvider      │  │
 * │  │  (child process │  │  (webview sidebar)     │  │
 * │  │   → provider    │  │   ├─ Chat messages     │  │
 * │  │     CLIs)       │  │   ├─ Model picker      │  │
 * │  └───────┬─────────┘  │   ├─ Input box         │  │
 * │          │            │   └─ WebSocket → server │  │
 * │          │            └────────────┬───────────┘  │
 * │          │                         │              │
 * │          ▼                         ▼              │
 * │  ┌────────────────────────────────────────────┐   │
 * │  │  Trifecta Server (child process)           │   │
 * │  │  - Provider orchestration (Codex/Claude/…) │   │
 * │  │  - WebSocket RPC (port 3773)               │   │
 * │  │  - Session management, auth, git           │   │
 * │  └────────────────────────────────────────────┘   │
 * └──────────────────────────────────────────────────┘
 *
 * The server handles ALL provider logic. The webview is a thin chat UI
 * that speaks the existing WebSocket RPC protocol — same as mobile apps.
 * Zero server code changes needed.
 */

import * as vscode from "vscode";
import { ServerManager } from "./serverManager";

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

  // Register commands
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

  // Start server
  if (autoStart) {
    await serverManager.start();
  }

  context.subscriptions.push({
    dispose: () => serverManager?.stop(),
  });
}

export function deactivate() {
  serverManager?.stop();
}

/**
 * Sidebar webview provider.
 *
 * The webview is a self-contained HTML page with a chat UI that connects
 * to the Trifecta server via WebSocket using the existing RPC protocol
 * defined in packages/contracts.
 *
 * Unlike the full web app, this is a condensed IDE-native experience:
 * - Model picker in the view title
 * - Chat messages with agent streaming
 * - Compact input at the bottom
 * - Integration with VS Code theme
 */
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
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "assets"),
      ],
    };

    // Load the chat UI
    webviewView.webview.html = this.getChatHtml(webviewView.webview);

    // When the server is ready, tell the webview to connect
    this.serverManager.onReady((port) => {
      webviewView.webview.postMessage({ type: "connect", port });
    });

    const readyPort = this.serverManager.getReadyPort();
    if (readyPort !== null) {
      webviewView.webview.postMessage({ type: "connect", port: readyPort });
    }

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case "ready":
          // Webview is loaded and ready to receive connect
          const port = this.serverManager.getReadyPort();
          if (port !== null) {
            webviewView.webview.postMessage({ type: "connect", port });
          }
          break;
        case "focusInput":
          // Webview is asking us to focus (handled by focusInput())
          break;
      }
    });
  }

  focusInput() {
    this._view?.show(true);
    this._view?.webview.postMessage({ type: "focusInput" });
  }

  /**
   * The chat webview HTML. This is a minimal, IDE-themed chat interface
   * that connects to the Trifecta server via WebSocket.
   *
   * It speaks the same RPC protocol defined in packages/contracts:
   *   - Request / Chunk / Exit / Defect / Ping / Pong / Ack
   *   - Over WebSocket at ws://127.0.0.1:<port>
   *
   * Design principles:
   *   - Match VS Code theme (via CSS variables)
   *   - Minimal UI: input at bottom, messages scroll up
   *   - Model picker in the view title bar
   *   - Streaming agent responses with markdown rendering
   */
  private getChatHtml(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src 'unsafe-inline';
                 style-src 'unsafe-inline';
                 connect-src ws://127.0.0.1:*;
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
      --agent-msg-bg: transparent;
      --error-fg: var(--vscode-errorForeground, #f38ba8);
      --muted: var(--vscode-descriptionForeground, #6c7086);
    }

    html, body {
      height: 100%;
      overflow: hidden;
      font-family: var(--vscode-font-family, -apple-system, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
    }

    #app {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* ── Header ──────────────────────────────── */
    #header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      flex-shrink: 0;
    }
    #header select {
      flex: 1;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      outline: none;
    }
    #header select:focus { border-color: var(--accent); }
    #status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #status-dot.connected { background: #a6e3a1; }
    #status-dot.disconnected { background: #f38ba8; }
    #status-dot.connecting { background: #f9e2af; }

    /* ── Messages ────────────────────────────── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    #messages::-webkit-scrollbar {
      width: 6px;
    }
    #messages::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 3px;
    }

    .message {
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 100%;
      word-wrap: break-word;
      line-height: 1.5;
    }
    .message.user {
      background: var(--user-msg-bg);
      align-self: flex-end;
    }
    .message.agent {
      background: var(--agent-msg-bg);
      border-left: 2px solid var(--accent);
      padding-left: 10px;
    }
    .message.agent.streaming {
      border-left-style: dashed;
    }
    .message .role {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .message pre {
      background: var(--input-bg);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
      margin: 8px 0;
    }
    .message code {
      background: var(--input-bg);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 12px;
    }
    .message pre code {
      background: none;
      padding: 0;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      gap: 8px;
    }
    .empty-state .icon { font-size: 32px; }
    .empty-state .title { font-size: 14px; font-weight: 600; color: var(--fg); }
    .empty-state .hint { font-size: 11px; }

    /* ── Input ───────────────────────────────── */
    #input-area {
      padding: 8px 12px;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    #input-area form {
      display: flex;
      gap: 8px;
    }
    #input-box {
      flex: 1;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      font-family: inherit;
      resize: none;
      outline: none;
      min-height: 36px;
      max-height: 120px;
    }
    #input-box:focus { border-color: var(--accent); }
    #input-box::placeholder { color: var(--muted); }
    #send-btn {
      background: var(--accent);
      color: var(--bg);
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    #send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Loading spinner ─────────────────────── */
    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
    }
    .loading .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="app">
    <div id="header">
      <div id="status-dot" class="disconnected"></div>
      <select id="model-select" disabled>
        <option value="">Connecting…</option>
      </select>
    </div>
    <div id="messages">
      <div class="empty-state">
        <svg class="icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <div class="title">Trifecta</div>
        <div class="hint">AI coding agent in your sidebar</div>
        <div class="actions">
          <span class="action-hint">⌘L to focus</span>
        </div>
      </div>
    </div>
    <div id="input-area">
      <form id="chat-form">
        <textarea id="input-box"
          placeholder="Ask Trifecta…"
          rows="1"
          disabled
        ></textarea>
        <button type="submit" id="send-btn" disabled>Send</button>
      </form>
    </div>
  </div>

  <script>
    (() => {
      const vscode = acquireVsCodeApi();

      // ── State ────────────────────────────────
      let ws = null;
      let requestId = 0;
      let pendingRequests = new Map();
      let streamingMsgId = null;

      // ── DOM ───────────────────────────────────
      const statusDot = document.getElementById('status-dot');
      const modelSelect = document.getElementById('model-select');
      const messagesEl = document.getElementById('messages');
      const chatForm = document.getElementById('chat-form');
      const inputBox = document.getElementById('input-box');
      const sendBtn = document.getElementById('send-btn');

      // ── WebSocket lifecycle ───────────────────
      function setStatus(status) {
        statusDot.className = status;
        const connected = status === 'connected';
        modelSelect.disabled = !connected;
        inputBox.disabled = !connected;
        sendBtn.disabled = !connected;
      }

      function connect(port) {
        if (ws) { ws.close(); ws = null; }
        setStatus('connecting');

        ws = new WebSocket('ws://127.0.0.1:' + port);

        ws.onopen = () => {
          setStatus('connected');
          // Authenticate with the server
          // (For localhost, the server auto-bootstraps)
          fetchModels();
        };

        ws.onclose = () => setStatus('disconnected');
        ws.onerror = () => setStatus('disconnected');

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          handleRpcMessage(msg);
        };
      }

      // ── RPC Protocol ──────────────────────────
      function sendRpc(method, params) {
        return new Promise((resolve, reject) => {
          const id = ++requestId;
          pendingRequests.set(id, { resolve, reject });
          ws.send(JSON.stringify({
            _tag: 'Request',
            id,
            method,
            params,
          }));
          // Timeout after 30s
          setTimeout(() => {
            if (pendingRequests.has(id)) {
              pendingRequests.get(id).reject(new Error('RPC timeout'));
              pendingRequests.delete(id);
            }
          }, 30000);
        });
      }

      function handleRpcMessage(msg) {
        switch (msg._tag) {
          case 'Chunk':
            appendToStream(msg.payload?.content || '');
            break;
          case 'Exit':
            finishStream();
            break;
          case 'Ack':
            if (msg.id && pendingRequests.has(msg.id)) {
              const { resolve } = pendingRequests.get(msg.id);
              pendingRequests.delete(msg.id);
              resolve(msg.payload);
            }
            break;
          case 'Defect':
            if (msg.id && pendingRequests.has(msg.id)) {
              const { reject } = pendingRequests.get(msg.id);
              pendingRequests.delete(msg.id);
              reject(new Error(msg.payload?.message || 'RPC error'));
            }
            break;
          case 'Ping':
            ws.send(JSON.stringify({ _tag: 'Pong' }));
            break;
        }
      }

      // ── Chat UI ───────────────────────────────
      function appendToStream(content) {
        if (!streamingMsgId) return;
        const el = document.getElementById(streamingMsgId);
        if (!el) return;
        const contentEl = el.querySelector('.content');
        if (!contentEl) return;
        contentEl.textContent += content;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function finishStream() {
        if (!streamingMsgId) return;
        const el = document.getElementById(streamingMsgId);
        if (el) el.classList.remove('streaming');
        streamingMsgId = null;
        sendBtn.disabled = false;
        inputBox.disabled = false;
        inputBox.focus();
      }

      function addMessage(role, content, streaming = false) {
        // Remove empty state
        const empty = messagesEl.querySelector('.empty-state');
        if (empty) empty.remove();

        const id = 'msg-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = 'message ' + role + (streaming ? ' streaming' : '');
        div.innerHTML = '<div class="role">' + role + '</div>'
          + '<div class="content">' + content + '</div>';
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return id;
      }

      async function sendMessage(text) {
        if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

        // Show user message
        addMessage('You', text);
        inputBox.value = '';
        inputBox.style.height = 'auto';
        sendBtn.disabled = true;
        inputBox.disabled = true;

        // Start streaming agent message
        streamingMsgId = addMessage('Agent', '', true);

        try {
          await sendRpc('provider.sendTurn', {
            threadId: 'vscode-' + Date.now(),
            input: {
              kind: 'text',
              text: text,
              cwd: '', // TODO: get workspace folder
            },
            instanceId: 'codex', // TODO: use selected model's provider
            modelId: modelSelect.value || undefined,
          });
        } catch (err) {
          finishStream();
          addMessage('Error', 'Failed to send message: ' + err.message);
        }
      }

      async function fetchModels() {
        try {
          const result = await sendRpc('provider.listModels', {});
          if (result?.models) {
            modelSelect.innerHTML = result.models
              .map(m => '<option value="' + m.id + '">' + m.name + '</option>')
              .join('');
            modelSelect.disabled = false;
          }
        } catch {
          // Server may not expose listModels yet — use defaults
          modelSelect.innerHTML = '<option>GPT-5.4</option><option>Claude Sonnet 4</option><option>Claude Opus 4</option>';
          modelSelect.disabled = false;
        }
      }

      // ── Event handlers ────────────────────────
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage(inputBox.value);
      });

      inputBox.addEventListener('input', () => {
        inputBox.style.height = 'auto';
        inputBox.style.height = Math.min(inputBox.scrollHeight, 120) + 'px';
      });

      inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(inputBox.value);
        }
      });

      // ── VS Code messages ──────────────────────
      window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
          case 'connect':
            connect(msg.port);
            break;
          case 'focusInput':
            inputBox.focus();
            break;
        }
      });

      // Signal ready to extension host
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}
