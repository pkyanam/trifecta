# Trifecta — AI Coding Agent for VS Code / Cursor

Embed a full coding-agent chat sidebar directly in your editor. Companion apps available for [iOS](../../../trifecta-ios) and [Android](../../../trifecta-android), all pairing with the same Trifecta Desktop server.

## What's inside

Trifecta is a universal coding-agent interface — it wraps **nine** agents behind one UI in your editor's activity bar:

| Agent            | Connection       | Install / sign in                                                                         |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| **Codex**        | JSON-RPC (stdio) | [Codex CLI](https://developers.openai.com/codex/cli) · `codex login`                      |
| **Claude Code**  | JSON-RPC (stdio) | [Claude Code](https://claude.com/product/claude-code) · `claude auth login`               |
| **OpenCode**     | JSON-RPC (stdio) | [OpenCode](https://opencode.ai) · `opencode auth login`                                   |
| **Gemini**       | Headless CLI     | [Gemini CLI](https://github.com/google-gemini/gemini-cli) · `npm i -g @google/gemini-cli` |
| **Antigravity**  | Python SDK / CLI | Google Antigravity · `google-antigravity` SDK or the `agy` CLI                            |
| **Cursor**       | ACP (stdio)      | [Cursor](https://cursor.sh) · bundled `cursor-agent` _(Early Access)_                     |
| **Hermes**       | ACP (stdio)      | [Hermes Agent](https://github.com/NousResearch/hermes-agent) · `hermes setup`             |
| **Devin**        | ACP (stdio)      | [Devin](https://devin.ai) · `devin acp`                                                   |
| **ACP Registry** | ACP (stdio)      | Any [ACP](https://agentclientprotocol.com)-compatible agent                               |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  VS Code / Cursor (extension host)              │
│  ┌──────────┐    spawns     ┌────────────────┐  │
│  │ Extension│──────────────▶│ Trifecta server│  │
│  │ (sidebar)│◀── iframe ────│  (Node.js)     │  │
│  │          │  + auth tokens│  + providers   │  │
│  └──────────┘               └────────────────┘  │
└─────────────────────────────────────────────────┘
```

The extension spawns a local Node.js server and embeds its web UI in a sidebar webview iframe. It pre-consumes the single-use pairing token before the iframe loads, so the host can't intercept it. Auth tokens (session + WebSocket) are passed into the iframe via URL parameters — cookies don't work in VS Code webviews.

## Quick start

From a monorepo checkout:

```bash
cd trifecta-desktop
bun install
bun run build --filter=@belweave/trifecta --filter=trifecta-ide
```

Then, in VS Code: **Extensions: Install from VSIX…** and select the built `.vsix`, or launch from the Debug view (`F5`).

### Settings

| Setting               | Default | Description                              |
| --------------------- | ------- | ---------------------------------------- |
| `trifecta.autoStart`  | `true`  | Auto-start the server when VS Code opens |
| `trifecta.serverPort` | `0`     | Server port (`0` = random)               |

### Commands

| Command             | ID                   | Description                 |
| ------------------- | -------------------- | --------------------------- |
| Open Trifecta       | `trifecta.openPanel` | Show the sidebar chat panel |
| Focus Trifecta Chat | `trifecta.focusChat` | Focus the chat input        |

## Development

```bash
cd apps/vscode && npm run watch        # rebundle the extension on save
bun run build --filter=@belweave/trifecta   # rebuild web UI + server
```

## Authentication flow

1. The server starts and generates a single-use pairing token
2. The extension reads it from stdout and calls `/api/auth/bootstrap/bearer`
3. The server returns a session token + WebSocket token
4. The extension opens the iframe at `/?wsToken=…&sessionToken=…`
5. The web app captures the tokens from the URL and strips them via `replaceState`
6. The WebSocket connects with `?wsToken=`; HTTP requests use `?token=` (cookies are blocked in webviews)

## License

MIT
