# Trifecta VS Code Extension

Universal coding agent interface for VS Code and Cursor.  
Same backend as the desktop app — spawns Codex, Claude Code, OpenCode, or Cursor as child processes.

## How It Works

```
VS Code Extension          Trifecta Server (child process)
┌─────────────────┐        ┌──────────────────────────────┐
│  Chat Sidebar   │◄─WSS──│  Provider Orchestration       │
│  Model Picker   │        │  ├─ Codex (JSON-RPC stdio)   │
│  Message Input  │        │  ├─ Claude Code              │
└─────────────────┘        │  ├─ OpenCode                 │
                           │  └─ Cursor                   │
                           └──────────────────────────────┘
```

The extension is a thin UI shell. All provider logic lives in the server.

## Development

```bash
# From the monorepo root:
cd trifecta-desktop

# Build the server first (the extension depends on it):
bun run build --filter=t3

# Install extension deps and build:
cd apps/vscode
npm install
npm run build

# Press F5 in VS Code to launch Extension Development Host
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `trifecta.serverPath` | Auto-detected | Path to server `dist/bin.mjs` |
| `trifecta.autoStart` | `true` | Start server automatically |
| `trifecta.serverPort` | `0` (random) | Port for the server |

## Architecture Notes

- **Zero server code duplication** — uses the same `apps/server` as desktop/mobile
- **Node.js or Bun** — server auto-detects bun, falls back to Node.js
- **Localhost only** — server binds to `127.0.0.1`, no network exposure
- **Provider auth pass-through** — inherits `~/.codex`, `~/.claude`, `~/.config/opencode` from host
