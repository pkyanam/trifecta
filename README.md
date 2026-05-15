# Trifecta

Trifecta is a cross-platform coding agent platform. It consists of a desktop server that runs AI coding agents, plus native mobile clients for iOS and Android that let you chat with your agent, review changes, and manage your development workflow from anywhere.

The mobile apps are also designed to be compatible with the official **Belweave** desktop server, not just Trifecta Desktop.

## What's in this repo

```
trifecta/
├── trifecta-desktop/    Desktop server + web UI (Electron, React, Node.js)
├── trifecta-ios/        Native iOS client (SwiftUI)
├── trifecta-android/    Native Android client (Jetpack Compose)
├── trifecta-www/        Marketing website (Next.js)
├── docs/                Architecture documentation
└── _reference/          Reference repos (Hermes Agent)
```

---

## Supported Agents

Trifecta wraps multiple coding agents behind a single unified interface:

| Agent | Protocol | Install |
|-------|----------|---------|
| **Codex** | JSON-RPC (stdio) | [Codex CLI](https://developers.openai.com/codex/cli) — `codex login` |
| **Claude Code** | JSON-RPC (stdio) | [Claude Code](https://claude.com/product/claude-code) — `claude auth login` |
| **OpenCode** | JSON-RPC (stdio) | [OpenCode](https://opencode.ai) — `opencode auth login` |
| **Gemini** | Headless CLI | [Gemini CLI](https://github.com/google-gemini/gemini-cli) — `npm i -g @google/gemini-cli`, set `GEMINI_API_KEY` |
| **Cursor** | ACP (stdio) | [Cursor](https://cursor.sh) — comes with the Cursor IDE |
| **Hermes** | ACP (stdio) | [Hermes Agent](https://github.com/NousResearch/hermes-agent) — `hermes setup` |
| **Devin** | ACP (stdio) | [Devin](https://devin.ai) — `devin acp` |
| **ACP Registry** | ACP (stdio) | Any [ACP](https://agentclientprotocol.com)-compatible agent (configurable) |

---

## Trifecta Desktop

The desktop app is the heart of the platform. It wraps coding agents and exposes them through a WebSocket server that the mobile clients connect to.

### What it does

- **Agent orchestration** — Spins up provider sessions and manages turn lifecycle
- **WebSocket server** — Streams structured events to connected mobile clients in real time
- **Web UI** — Full-featured React/Vite interface for desktop use
- **Project management** — Organizes work into projects and threads
- **Git integration** — Tracks branch status, diffs, and supports pull/commit/push
- **Model catalog** — Exposes all configured providers and models to mobile clients
- **SSH & Tailscale** — Remote environment access via SSH tunnels or Tailscale

### Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Effect-TS, WebSocket |
| Web UI | React 19, Vite 8, Tailwind CSS 4, TypeScript |
| Desktop | Electron 41, Effect-TS |
| Protocol | Effect-style RPC over WebSocket |
| Agents | Codex, Claude, Gemini, Cursor, Hermes, Devin, OpenCode, ACP Registry |

### Running the desktop app

```bash
cd trifecta-desktop
mise install        # optional: dev tool management
bun install .
bun run dev         # starts the server + web UI
```

See [trifecta-desktop/README.md](trifecta-desktop/README.md) for full details.

---

## Trifecta for iOS

Native iOS client written in SwiftUI. Connects to a Trifecta or **Belweave** desktop server to give you mobile access to your coding agent. Works with both Trifecta Desktop and the official Belweave desktop server.

### Features

- Chat with your agent and review full conversation history
- Manage threads by project, archive old work, search and sort
- Approve or decline agent actions (commands, file reads, file changes)
- Git Lite — pull, commit, and push with inline diffs
- Model picker with all providers configured on your server
- Image attachments via PhotosPicker
- Multi-server profile support
- Auto-reconnect with exponential backoff

### Quick Start

1. Open `trifecta-ios/Trifecta.xcodeproj` in Xcode
2. Select the **Trifecta** scheme and an iOS 18 simulator
3. Run
4. Pair with your Trifecta desktop server

**Requirements:** iOS 18.0+, Xcode 16+, Swift 5.10+

See [trifecta-ios/README.md](trifecta-ios/README.md) for the full engineering guide.

---

## Trifecta for Android

Native Android client written in Kotlin and Jetpack Compose. Mirrors the iOS feature set for a consistent cross-platform experience. Works with both Trifecta Desktop and the official **Belweave** desktop server.

### Features

- Full chat timeline with markdown rendering and streaming dots
- Thread and project management with live shell stream updates
- Approval workflow for agent actions
- Git Lite with status, diffs, pull/commit/push
- Two-level provider → model picker
- Photo gallery attachments
- Multi-server profiles with encrypted token storage
- Deep link support (`trifecta://`) for pairing URLs

### Quick Start

1. Open the `trifecta-android` folder in Android Studio
2. Sync Gradle and run the `app` configuration
3. Pair with your Trifecta desktop server

**Requirements:** Android 8.0+ (API 26), Android Studio Ladybug+, JDK 17

See [trifecta-android/README.md](trifecta-android/README.md) for full details.

---

## How the platform works

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│  iOS App    │ ◄────────────────► │                 │
└─────────────┘   Effect RPC       │   Trifecta      │
                                   │   Desktop       │
┌─────────────┐     WebSocket      │   Server        │
│ Android App │ ◄────────────────► │                 │
└─────────────┘   Streaming events └────────┬────────┘
                                            │
                                   ┌────────▼────────┐
                                   │  Codex / Claude / Gemini /
                                   │  Cursor / Hermes / Devin /
                                   │  OpenCode / ACP agents
                                   └─────────────────┘
```

1. The **desktop server** runs the coding agents and hosts a WebSocket endpoint
2. **Mobile clients** pair with the server via a short-lived pairing URL
3. Once paired, the client maintains a persistent WebSocket connection
4. All data — threads, messages, activity, git status — is streamed in real time
5. The client can send commands, approvals, user input, and git actions back to the server

---

## License

Copyright (c) Belweave. All rights reserved.
