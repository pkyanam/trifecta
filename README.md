# Trifecta

Trifecta is a cross-platform coding-agent platform with four clients:

- **Desktop app** — Electron app for macOS, Windows, and Linux. Bundles the server, web UI, and auto-updater in one package.
- **Web app** — the same React UI served directly from the desktop server, or accessed at `https://app.trifecta.belweave.ai` for cloud-hosted backends.
- **Mobile app** — React Native app (iOS and Android) built with Expo. Ships as a single codebase that also runs in the browser.
- **VS Code / Cursor extension** — *(work in progress)* editor-native sidebar that pairs with any running Trifecta server.

Every client connects to the same server over WebSocket, so you can chat with an agent, watch it work, review diffs, approve actions, and drive Git from any of them interchangeably.

One interface, **nine** coding agents: Codex, Claude Code, OpenCode, Gemini, Antigravity, Cursor, Hermes, Devin, and any [ACP](https://agentclientprotocol.com)-compatible agent.

Trifecta is made by **Belweave** and builds on [T3 Code by Theo (t3.gg)](https://t3.gg). All clients speak the same WebSocket wire protocol and pair with a Trifecta Desktop or T3 Code server.

## How it works

```
  Clients   Mobile app (iOS · Android · Web)  ·  VS Code / Cursor  ·  Web UI
                              │
                   WebSocket · Effect-style RPC
                              ▼
  Server    Trifecta Desktop — runs your agents (Node.js, Effect-TS)
                              │
                   stdio:  JSON-RPC  /  ACP
                              ▼
  Agents    Codex · Claude · OpenCode · Gemini · Antigravity
            Cursor · Hermes · Devin · ACP Registry
```

A single long-lived WebSocket carries every message between a client and the server. The server keeps your projects and threads in sync, streams agent output as it happens, and brokers approvals. Each agent runs as a local subprocess the server talks to over stdio — JSON-RPC for native agents, the Agent Client Protocol (ACP) for ACP agents.

## Repository layout

| Path | What it is |
|---|---|
| [`trifecta-desktop/`](./trifecta-desktop) | The core platform — server, web UI, Electron desktop app, VS Code extension, and all shared packages (Turborepo + Bun) |
| [`trifecta-mobile/`](./trifecta-mobile) | Cross-platform mobile + web client built with Expo and React Native |
| [`trifecta-www/`](./trifecta-www) | Marketing site and cloud dashboard — [trifecta.belweave.com](https://trifecta.belweave.com) (Next.js) |
| [`server/`](./server) | Built server bundle + systemd unit for self-hosting |
| `docs/` | Architecture notes |
| `_reference/` | Read-only reference checkouts (CodexBar, hermes-agent, antigravity-sdk-python, remodex) |
| `t3code-original/` | Preserved upstream T3 Code subtree for git history and future merges |

---

## trifecta-desktop

The core of the platform: a Node.js / Effect-TS server that orchestrates AI coding agents, the React web UI it serves, an Electron desktop app, and a VS Code / Cursor extension — all in a single Turborepo + Bun monorepo.

### Supported agents

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
| **ACP Registry** | ACP (stdio) | Any [ACP](https://agentclientprotocol.com)-compatible agent (custom command + args) |

You only need one. Install and authenticate at least one agent before pairing a client.

### Getting started

The fastest path — no install required:

```bash
npx @belweave/trifecta
```

This starts the server, prints a pairing URL and QR code, then pair any client by opening that URL. You can also use `bunx` instead of `npx`.

#### Desktop app

Download the latest macOS, Windows, or Linux installer from [GitHub Releases](https://github.com/pkyanam/trifecta/releases).

### Architecture

```
  Clients     Mobile  ·  VS Code / Cursor  ·  Web UI
                              │
                   WebSocket · Effect-style RPC
                              ▼
  Server      @belweave/trifecta — Node.js, Effect-TS
              WebSocket gateway · provider registry · Git · SSH
                              │
                   stdio:  JSON-RPC  /  ACP
                              ▼
  Agents      Codex · Claude · OpenCode · Gemini · Antigravity
              Cursor · Hermes · Devin · ACP Registry
```

The same server binary backs the desktop app, the VS Code extension, and remote/self-hosted deployments. The Electron shell wraps the React web UI, but every client (web, mobile, editor) speaks the same WebSocket RPC — none is privileged over another.

### Workspace

**Apps**

| Package | Path | Role |
|---|---|---|
| `@belweave/trifecta` | `apps/server` | Agent-orchestration server — Effect-TS, WebSocket RPC, provider registry, Git, SSH |
| `@belweave/web` | `apps/web` | Web UI — React 19, Vite 8, Tailwind CSS 4, Zustand, Lexical |
| `@belweave/desktop` | `apps/desktop` | Electron 41 shell + auto-update |
| `trifecta-ide` | `apps/vscode` | VS Code / Cursor extension |
| `@belweave/marketing` | `apps/marketing` | In-repo marketing site (Astro) |

**Packages**

| Package | Path | Role |
|---|---|---|
| `@belweave/contracts` | `packages/contracts` | Effect Schema contracts — events, RPC, models, settings |
| `@belweave/shared` | `packages/shared` | Shared runtime utilities (git, stores, helpers) |
| `@belweave/client-runtime` | `packages/client-runtime` | Client-side WebSocket / RPC runtime |
| `@belweave/ssh` | `packages/ssh` | SSH terminal + tunnel helpers |
| `@belweave/tailscale` | `packages/tailscale` | Tailscale integration for remote access |
| `effect-acp` | `packages/effect-acp` | Effect bindings for the Agent Client Protocol |
| `effect-codex-app-server` | `packages/effect-codex-app-server` | Effect bindings for the Codex app-server protocol |
| `oxlint-plugin-trifecta` | `oxlint-plugin-trifecta` | Custom oxlint rules |

### Tech stack

| Layer | Technology |
|---|---|
| Runtime | Electron 41 (desktop), Node.js (server) |
| Framework | Effect-TS (functional effect system) |
| Build | Turborepo, tsdown, Vite 8 |
| Web UI | React 19, Tailwind CSS 4, Zustand, Lexical |
| Lint / format | oxlint + oxfmt (Oxc toolchain) |
| Agents | 9 providers via JSON-RPC or ACP over stdio |

### Development

```bash
# Optional — only if you manage dev tools with mise
mise install

bun install
bun run dev            # server + web UI
bun run dev:desktop    # Electron shell
```

Other scripts: `bun run build`, `bun run typecheck`, `bun run test`, `bun run lint`, `bun run fmt`. Filter to a package with Turbo: `bun run build --filter=@belweave/trifecta --filter=@belweave/web`.

### Remote access

There are three ways to connect clients to a server running on another machine:

**1. Desktop app** — Settings → Connections → toggle **Network access**. The settings panel shows all reachable endpoints (LAN, Tailscale, HTTPS). Use **Create Link** to generate a shareable pairing URL. Tailscale HTTPS endpoints work with the hosted web app at `https://app.trifecta.belweave.ai`.

**2. Headless server (CLI)**

```bash
# Bind to a Tailscale IP
npx @belweave/trifecta serve --host "$(tailscale ip -4)"

# With Tailscale Serve for HTTPS
npx @belweave/trifecta serve --tailscale-serve
```

**3. Desktop-managed SSH launch** — Settings → Connections → Remote Environments → Add environment → SSH. The desktop app probes the remote host, starts or reuses a server, and opens a local port forward. The remote host must have a compatible Node.js runtime (`^22.16 || ^23.11 || >=24.10`).

**Hosted web pairing** — `https://app.trifecta.belweave.ai/pair?host=https://backend.example.com:3773#token=PAIRCODE` saves the backend in browser local storage. Requires the backend to be reachable over HTTPS/WSS (use a Tailscale HTTPS endpoint or another HTTPS tunnel).

### Self-hosting (Docker / AWS EC2)

```bash
# Build the image (bake in Codex CLI)
docker build --platform=linux/amd64 \
  --build-arg INSTALL_CODEX=true \
  -t trifecta-server ./trifecta-desktop

# Run
docker run -d \
  --name trifecta \
  --restart unless-stopped \
  -p 3773:3773 \
  -v /opt/trifecta/data:/data \
  -v /home/ubuntu/.codex:/home/trifecta/.codex \
  -e TRIFECTA_HOST=0.0.0.0 \
  -e TRIFECTA_PORT=3773 \
  -e TRIFECTA_HOME=/data \
  trifecta-server

# Health check
curl http://localhost:3773/.well-known/belweave/environment | jq .
```

**Environment variables**

| Variable | Default | Description |
|---|---|---|
| `TRIFECTA_HOST` | `0.0.0.0` | Interface to bind |
| `TRIFECTA_PORT` | `3773` | HTTP + WebSocket port |
| `TRIFECTA_HOME` | `/data` | Persistent data directory |
| `TRIFECTA_LOG_LEVEL` | `Info` | `Debug`, `Info`, `Warning`, `Error` |
| `CODEX_HOME` | — | Codex auth/config directory |
| `OPENAI_API_KEY` | — | Codex API key (alternative to `codex login`) |

See [`trifecta-desktop/DEPLOY.md`](./trifecta-desktop/DEPLOY.md) for a full AWS EC2 walkthrough and [`trifecta-desktop/REMOTE.md`](./trifecta-desktop/REMOTE.md) for the complete remote-access reference.

---

## trifecta-mobile

A high-performance AI chatbot built with [Expo](https://expo.dev) and [Expo Router](https://docs.expo.dev/router/introduction/). Runs on **iOS, Android, and web** from a single codebase. Ships with iOS 26 Liquid Glass support and a responsive web sidebar.

### Features

- **Liquid Glass** — glassmorphic prompt composer, navigation bars, and toolbar buttons on iOS 26 via `expo-glass-effect`
- **Streaming messages** — throttled ~30 fps updates, markdown rendering (code blocks, GFM tables, inline formatting), and shimmer loading states
- **Virtualized chat** — performant scrolling with `@legendapp/list` and a Reanimated-powered scroll-to-bottom button
- **Platform-adaptive layouts** — gesture-driven drawer on iOS/Android; collapsible sidebar + inset content panel on web
- **Web-first sidebar** — Radix context menus, dropdown menus, and tooltips for a desktop-grade web experience
- **Dark mode** — automatic light/dark theme using OKLCH design tokens in Tailwind CSS v4
- **Native UI controls** — SwiftUI model picker menu (`@expo/ui`), toolbar buttons, and haptic feedback on iOS
- **Keyboard-aware** — prompt input stays above the software keyboard via `react-native-keyboard-controller`
- **Image picker** — attach images to messages with `expo-image-picker`
- **Secure storage** — API keys and session data stored with `expo-secure-store`

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 56, React Native 0.85, React 19 |
| Navigation | Expo Router (file-based, typed routes) |
| Styling | Tailwind CSS v4 via [Uniwind](https://uniwind.dev/) + `tailwind-merge` |
| Chat list | `@legendapp/list` (virtualized) |
| Native UI | `@expo/ui` (SwiftUI), `expo-symbols`, `expo-haptics`, `expo-glass-effect` |
| Web UI | Radix UI (context menu, dropdown menu, tooltips), Lucide icons |
| Markdown | Custom AST renderer — `mdast-util-from-markdown` + `react-syntax-highlighter` |
| Animations | `react-native-reanimated`, `react-native-gesture-handler` |
| AI / streaming | Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`) |
| Language | TypeScript 6 |

### Getting started

#### Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key — used by the server-side chat route (`app/api/chat+api.ts`) |
| `EXPO_PUBLIC_MOCK_AI` | Set to `1` to use mock streaming responses (useful for UI development without an API key) |

#### Install and run

```bash
# Install dependencies
bun install

# Start the dev server (interactive menu)
bun start

# Run on a specific platform
bun run ios
bun run android
bun run web
```

Requires [Bun](https://bun.sh) and the [Expo CLI](https://docs.expo.dev/get-started/installation/). For iOS, you also need Xcode and a simulator or device.

> **Important:** trifecta-mobile requires a custom Expo development build and will **not** run in Expo Go. Use `bunx expo run:ios` or `bunx expo run:android` to build locally, or an EAS development build.

#### Verifying on-device / in-browser

```bash
# iOS simulator
npx serve-sim

# Web browser
npx agent-browser
```

### Customization

**Theme** — edit `src/global.css`. Colors use OKLCH for perceptual uniformity across light and dark modes. The `@theme` block maps CSS variables to Tailwind classes (`bg-background`, `text-foreground`, `bg-muted`, `border-border`, etc.).

**Chat backend** — the AI SDK streaming architecture (`createStreamingStore` + throttled token callback) is wired to `app/api/chat+api.ts`. Swap in any AI SDK provider by replacing the Anthropic adapter.

**Database** — connect Convex in one command:

```bash
npx eas-cli@latest integrations:convex:connect
```

Pair with [better-auth](https://labs.convex.dev/better-auth/framework-guides/expo) for authentication. Convex also supports Expo push notifications.

### Building and deploying (EAS)

```bash
# Production iOS build
eas build --platform ios --profile production

# Production Android build
eas build --platform android --profile production

# App Store / Play Store metadata
npx eas-cli@latest metadata:push
```

Configuration lives in `eas.json`. See the [EAS docs](https://docs.expo.dev/build/introduction/) for the full reference.

---

## trifecta-www

Marketing site and cloud dashboard for Trifecta. Built with Next.js 16 and deployed on Vercel.

Live at [trifecta.belweave.com](https://trifecta.belweave.com) and [trifecta.belweave.ai](https://trifecta.belweave.ai).

### Pages

| Route | Page |
|---|---|
| `/` | Landing — overview of the platform, clients, and agents |
| `/pricing` | Pricing |
| `/developers` | Setup guide for the desktop server |
| `/docs` | API and integration docs |
| `/privacy` | Privacy policy |
| `/sign-in` · `/sign-up` | Clerk-powered authentication |
| `/(dashboard)/dashboard` | Cloud dashboard — manage sandbox environments (Daytona) and billing |

### Features

- **Authentication** — Clerk (`@clerk/nextjs`) handles sign-in, sign-up, and session management
- **Cloud dashboard** — authenticated users can create and manage cloud sandbox environments backed by Daytona (`@daytonaio/sdk`)
- **Database** — Supabase (`@supabase/supabase-js`, `@supabase/ssr`) for persistent user and project data
- **Pairing flow** — QR code generation (`qrcode`) for pairing mobile and desktop clients with a cloud-hosted server
- **Dark mode** — `next-themes` + Tailwind CSS 4 with automatic system-preference detection
- **Toast notifications** — `sonner` for non-blocking feedback

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`) |
| Components | Base UI (`@base-ui/react`) + shadcn-style primitives (CVA, `tailwind-merge`) |
| Auth | Clerk (`@clerk/nextjs`, `@clerk/themes`) |
| Database | Supabase (PostgreSQL via `@supabase/supabase-js`) |
| Sandboxes | Daytona (`@daytonaio/sdk`) |
| Icons | Lucide React |
| Fonts | Geist Sans / Geist Mono |
| Hosting | Vercel |
| Language | TypeScript 5 |

### Development

```bash
cd trifecta-www

# Copy environment variables
cp .env.example .env.local
# Fill in: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
#          NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#          DAYTONA_API_KEY

npm install
npm run dev      # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

> **Note:** This project uses Next.js 16, which has breaking changes from older releases. Read the relevant guide in `node_modules/next/dist/docs/` before writing code, as APIs and conventions may differ from earlier versions.

### Deploy

```bash
cd trifecta-www
vercel --prod
```

The project is pre-configured for Vercel via `vercel.json`. Environment variables must be set in the Vercel project dashboard.

---

## Status

Trifecta is early and moving fast — expect rough edges. We are not accepting external contributions yet. Need help? Join the [Discord](https://discord.gg/jn4EGJjrvv).

## License

Copyright © Belweave. All rights reserved.
