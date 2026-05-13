# Trifecta — AI Coding Agent Extension for VS Code / Cursor

Embed a full-featured AI coding agent chat sidebar directly into your IDE. Companion mobile apps available for <a href="../../trifecta-ios/">iOS</a> and <a href="../../trifecta-android/">Android</a> — compatible with both Trifecta Desktop and <a href="https://t3.gg">T3 Code by Theo (t3.gg)</a>.

## What's Inside

Trifecta is a universal coding agent interface — it wraps **OpenAI Codex**, **Claude Code**, **OpenCode**, and **Cursor** behind a single UI that lives in your editor's activity bar.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  VS Code / Cursor (Extension Host)              │
│  ┌──────────┐    spawns     ┌────────────────┐  │
│  │ Extension│──────────────▶│ Trifecta Server│  │
│  │ (sidebar)│◀── iframe ───│  (Node.js)     │  │
│  │          │  + auth tokens│  + providers   │  │
│  └──────────┘              └────────────────┘  │
└─────────────────────────────────────────────────┘
```

The extension spawns a local Node.js server and embeds its web UI in a sidebar webview iframe. The pre-consumes the single-use pairing token before the iframe loads, so Cursor/Codex can't steal it. Auth tokens (session + WebSocket) are passed into the iframe via URL parameters — cookies don't work in VS Code webviews.

## Quick Start

### From a Monorepo Checkout

```bash
cd ~/projects/trifecta/trifecta-desktop
bun install
bun run build --filter=t3 --filter=trifecta-ide
```

Then open VS Code and run:
- `Extensions: Install from VSIX...` → select the built `.vsix`
- Or run the extension from the Debug view (`F5`)

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `trifecta.autoStart` | `true` | Auto-start server on VS Code open |
| `trifecta.serverPort` | `0` | Server port (`0` = random) |

## Development

```bash
# Watch mode for extension (rebundles on save)
cd apps/vscode && npm run watch

# Build web app + server
bun run build --filter=t3

# Full rebuild
bun run build
```

## Authentication Flow

1. Server starts and generates a single-use pairing token
2. Extension reads the token from stdout and calls `/api/auth/bootstrap/bearer`
3. Server returns a session token + WebSocket token
4. Extension opens iframe at `/?wsToken=XXX&sessionToken=YYY`
5. Web app captures tokens from URL, strips them via `replaceState`
6. WebSocket connects with `?wsToken=`, HTTP requests use `?token=` (since cookies are blocked in webviews)

## Commands

| Command | ID | Description |
|---------|----|-------------|
| Open Trifecta | `trifecta.openPanel` | Show the sidebar chat panel |
| Focus Trifecta Chat | `trifecta.focusChat` | Focus into the chat input |

## License

MIT
