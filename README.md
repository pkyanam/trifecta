# Trifecta

Trifecta is a cross-platform coding-agent platform. A desktop server runs AI coding agents on your machine; native **iOS** and **Android** apps, a **VS Code / Cursor** extension, and a **web UI** all connect to it — so you can chat with an agent, watch it work, review diffs, approve actions, and drive Git from anywhere.

One interface, **nine** coding agents: Codex, Claude Code, OpenCode, Gemini, Antigravity, Cursor, Hermes, Devin, and any [ACP](https://agentclientprotocol.com)-compatible agent.

Trifecta is made by **Belweave** and builds on [T3 Code by Theo (t3.gg)](https://t3.gg). The clients speak the same wire protocol, so they pair with a Trifecta Desktop or T3 Code server.

## How it works

```
   iOS app   Android app   VS Code / Cursor   Web UI
      └───────────┴──────────────┴──────────────┘
                         │
              WebSocket  ·  Effect-style RPC
                         │
              ┌──────────▼───────────┐
              │   Trifecta Desktop    │
              │  server (Effect-TS)   │
              └──────────┬───────────┘
                         │  stdio: JSON-RPC / ACP
     ┌─────────┬─────────┼─────────┬─────────┬─────────┐
   Codex    Claude     Gemini    Cursor    Hermes    Devin …
```

A single long-lived WebSocket carries every message between a client and the server. The server keeps your projects and threads in sync, streams agent output as it happens, and brokers approvals. Each agent runs as a local subprocess the server talks to over stdio — JSON-RPC for native agents, the Agent Client Protocol (ACP) for ACP agents.

## Repository layout

| Path | What it is |
|---|---|
| [`trifecta-desktop/`](./trifecta-desktop) | The core platform — server, web UI, Electron desktop app, VS Code extension, and all shared packages (Turborepo + Bun) |
| [`trifecta-ios/`](./trifecta-ios) | Native iOS / iPadOS client (SwiftUI) |
| [`trifecta-android/`](./trifecta-android) | Native Android client (Kotlin + Jetpack Compose) |
| [`trifecta-www/`](./trifecta-www) | Marketing site — [trifecta.belweave.com](https://trifecta.belweave.com) (Next.js) |
| [`server/`](./server) | Built server bundle + systemd unit for self-hosting |
| `docs/` | Architecture notes |
| `_reference/` | Read-only reference checkouts kept for development (CodexBar, hermes-agent, antigravity-sdk-python, remodex) |
| `t3code-original/` | Preserved upstream T3 Code subtree, kept for git history and future merges |

Each top-level project has its own README with build instructions and a deeper architecture walkthrough.

## Supported agents

| Agent | Connection | Install / sign in |
|---|---|---|
| **Codex** | JSON-RPC (stdio) | [Codex CLI](https://developers.openai.com/codex/cli) · `codex login` |
| **Claude Code** | JSON-RPC (stdio) | [Claude Code](https://claude.com/product/claude-code) · `claude auth login` |
| **OpenCode** | JSON-RPC (stdio) | [OpenCode](https://opencode.ai) · `opencode auth login` |
| **Gemini** | Headless CLI | [Gemini CLI](https://github.com/google-gemini/gemini-cli) · `npm i -g @google/gemini-cli` |
| **Antigravity** | Python SDK / CLI | Google Antigravity · `google-antigravity` SDK or the `agy` CLI |
| **Cursor** | ACP (stdio) | [Cursor](https://cursor.sh) · bundled `cursor-agent` *(Early Access)* |
| **Hermes** | ACP (stdio) | [Hermes Agent](https://github.com/NousResearch/hermes-agent) · `hermes setup` |
| **Devin** | ACP (stdio) | [Devin](https://devin.ai) · `devin acp` |
| **ACP Registry** | ACP (stdio) | Any [ACP](https://agentclientprotocol.com)-compatible agent (custom command) |

You only need one. Install and authenticate at least one agent before pairing a client.

## Getting started

The fastest way to try Trifecta is the desktop server:

```bash
npx @belweave/trifecta
```

Then pair a client by scanning or opening the pairing URL it prints. See [`trifecta-desktop/README.md`](./trifecta-desktop/README.md) for desktop-app installers (Homebrew, winget, AUR) and [`server/README.md`](./server/README.md) for self-hosting.

## Status

Trifecta is early and moving fast — expect rough edges. We are not accepting external contributions yet.

## License

Copyright © Belweave. All rights reserved.
