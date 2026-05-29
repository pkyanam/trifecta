# Trifecta [![Socket Badge](https://socket.dev/api/badge/npm/package/@belweave/trifecta)](https://socket.dev/npm/package/@belweave/trifecta)

A cross-platform coding-agent platform with four clients: Desktop, Web, Mobile, and VS Code/Cursor extension. All clients connect to the same server over WebSocket to chat with AI agents, review diffs, approve actions, and drive Git.

**Made by [Belweave](https://belweave.ai) • Built on [T3 Code](https://t3.gg)**

## Quick Start

```bash
# Fastest path — no install required
npx @belweave/trifecta
```

This starts the server and prints a pairing URL/QR code. Open it in any client to connect.

For desktop apps, download the latest installer from [GitHub Releases](https://github.com/pkyanam/trifecta/releases).

## Architecture

```
Clients (Mobile · VS Code/Cursor · Web UI)
           │
    WebSocket · Effect-style RPC
           ▼
Server (Trifecta Desktop — Node.js, Effect-TS)
           │
    stdio: JSON-RPC / ACP
           ▼
Agents (Codex · Claude · OpenCode · Gemini · Antigravity · Cursor · Hermes · Devin · ACP)
```

## Repository Layout

| Path | Description |
|------|-------------|
| [`trifecta-desktop/`](./trifecta-desktop) | Core platform — server, web UI, Electron app, VS Code extension, shared packages (Turborepo + Bun) |
| [`trifecta-mobile/`](./trifecta-mobile) | Cross-platform mobile + web client (Expo, React Native) |
| [`trifecta-www/`](./trifecta-www) | Marketing site and cloud dashboard (Next.js) |
| [`server/`](./server) | Built server bundle + systemd unit for self-hosting |
| `docs/` | Architecture notes |
| `_reference/` | Read-only reference checkouts |
| `t3code-original/` | Preserved upstream T3 Code subtree |

## Components

### trifecta-desktop
The core platform: Node.js/Effect-TS server, React web UI, Electron desktop app, and VS Code/Cursor extension in a single Turborepo monorepo.

**Tech stack:** Electron 41, Effect-TS, React 19, Vite 8, Tailwind CSS 4, Turborepo, Bun

**Development:**
```bash
cd trifecta-desktop
bun install
bun run dev            # server + web UI
bun run dev:desktop    # Electron shell
```

**Documentation:** [trifecta-desktop/README.md](./trifecta-desktop/README.md) • [DEPLOY.md](./trifecta-desktop/DEPLOY.md) • [REMOTE.md](./trifecta-desktop/REMOTE.md)

### trifecta-mobile
Cross-platform mobile + web client built with Expo and React Native. Runs on iOS, Android, and web from a single codebase.

**Tech stack:** Expo SDK 56, React Native 0.85, React 19, Expo Router, Tailwind CSS v4

**Development:**
```bash
cd trifecta-mobile
bun install
bun start              # interactive menu
bun run ios            # iOS simulator
bun run android        # Android emulator
bun run web            # web browser
```

**Documentation:** [trifecta-mobile/README.md](./trifecta-mobile/README.md)

### trifecta-www
Marketing site and cloud dashboard. Built with Next.js 16 and deployed on Vercel.

**Tech stack:** Next.js 16, React 19, Tailwind CSS 4, Clerk (auth), Supabase (database), Daytona (sandboxes)

**Development:**
```bash
cd trifecta-www
npm install
npm run dev            # http://localhost:3000
```

**Documentation:** [trifecta-www/README.md](./trifecta-www/README.md)

## Supported Agents

| Agent | Connection | Setup |
|-------|------------|-------|
| Codex | JSON-RPC (stdio) | `codex login` |
| Claude Code | JSON-RPC (stdio) | `claude auth login` |
| OpenCode | JSON-RPC (stdio) | `opencode auth login` |
| Gemini | Headless CLI | `npm i -g @google/gemini-cli` |
| Antigravity | Python SDK/CLI | `google-antigravity` SDK or `agy` CLI |
| Cursor | ACP (stdio) | Bundled `cursor-agent` (Early Access) |
| Hermes | ACP (stdio) | `hermes setup` |
| Devin | ACP (stdio) | `devin acp` |
| ACP Registry | ACP (stdio) | Any ACP-compatible agent |

## Self-Hosting

**Docker:**
```bash
docker build --platform=linux/amd64 --build-arg INSTALL_CODEX=true -t trifecta-server ./trifecta-desktop
docker run -d --name trifecta --restart unless-stopped -p 3773:3773 \
  -v /opt/trifecta/data:/data -v /home/ubuntu/.codex:/home/trifecta/.codex \
  -e TRIFECTA_HOST=0.0.0.0 -e TRIFECTA_PORT=3773 -e TRIFECTA_HOME=/data \
  trifecta-server
```

**Environment variables:** `TRIFECTA_HOST`, `TRIFECTA_PORT`, `TRIFECTA_HOME`, `TRIFECTA_LOG_LEVEL`, `CODEX_HOME`, `OPENAI_API_KEY`

See [trifecta-desktop/DEPLOY.md](./trifecta-desktop/DEPLOY.md) for full AWS EC2 walkthrough.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute, best practices, and what we're looking for.

**Questions?** Open an [Issue](https://github.com/pkyanam/trifecta/issues) or email info@belweave.com

## Status

Trifecta is early and moving fast — expect rough edges.

**Support:** [Discord](https://discord.gg/jn4EGJjrvv)

## License

Copyright © Belweave. All rights reserved.
