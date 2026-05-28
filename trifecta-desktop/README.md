# Trifecta Desktop

The core of the Trifecta platform: a Node.js server that orchestrates AI coding agents, the web UI it serves, an Electron desktop app, and a VS Code / Cursor extension — all in one Turborepo + Bun monorepo.

It wraps **nine** coding agents behind a single interface, and pairs with the companion [iOS](../trifecta-ios) and [Android](../trifecta-android) apps over the same protocol.

## Install

> [!IMPORTANT]
> Trifecta drives agents you already have installed. Set up and authenticate at least one before pairing a client.

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
| **ACP Registry** | ACP (stdio)      | Any [ACP](https://agentclientprotocol.com)-compatible agent (configurable command + args) |

### Run without installing

```bash
npx @belweave/trifecta
```

### Desktop app

Grab the latest build from [GitHub Releases](https://github.com/pkyanam/trifecta/releases), or a package registry:

```bash
# macOS (Homebrew)
brew install --cask belweave-code

# Windows (winget)
winget install Belweave.T3Code

# Arch Linux (AUR)
yay -S belweave-bin
```

## Architecture

```
  Clients     iOS  ·  Android  ·  VS Code / Cursor  ·  Web UI
                              │
                   WebSocket · Effect-style RPC
                              ▼
  Server      Trifecta Desktop — Node.js, Effect-TS (@belweave/trifecta)
              WebSocket gateway · provider registry · Git · SSH
                              │
                   stdio:  JSON-RPC  /  ACP
                              ▼
  Agents      Codex · Claude · OpenCode · Gemini · Antigravity
              Cursor · Hermes · Devin · ACP Registry
```

The same server binary backs the desktop app, the VS Code extension, and remote/self-hosted deployments. The Electron shell wraps the React web UI, but that UI is just one client — every client (web, mobile, editor) speaks the same WebSocket RPC.

### Workspace

**Apps**

| Package               | Path             | Role                                                                               |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `@belweave/trifecta`  | `apps/server`    | Agent-orchestration server — Effect-TS, WebSocket RPC, provider registry, Git, SSH |
| `@belweave/web`       | `apps/web`       | Web UI — React 19, Vite 8, Tailwind 4, Zustand, Lexical                            |
| `@belweave/desktop`   | `apps/desktop`   | Electron shell + auto-update                                                       |
| `trifecta-ide`        | `apps/vscode`    | VS Code / Cursor extension ([README](./apps/vscode/README.md))                     |
| `@belweave/marketing` | `apps/marketing` | In-repo marketing site (Astro)                                                     |

**Packages**

| Package                    | Path                               | Role                                                                  |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| `@belweave/contracts`      | `packages/contracts`               | Effect Schema contracts — events, RPC, models, settings (schema only) |
| `@belweave/shared`         | `packages/shared`                  | Shared runtime utilities (git, stores, helpers)                       |
| `@belweave/client-runtime` | `packages/client-runtime`          | Client-side WebSocket / RPC runtime                                   |
| `@belweave/ssh`            | `packages/ssh`                     | SSH terminal + tunnel helpers                                         |
| `@belweave/tailscale`      | `packages/tailscale`               | Tailscale integration for remote access                               |
| `effect-acp`               | `packages/effect-acp`              | Effect bindings for the Agent Client Protocol                         |
| `effect-codex-app-server`  | `packages/effect-codex-app-server` | Effect bindings for the Codex app-server protocol                     |
| `oxlint-plugin-trifecta`   | `oxlint-plugin-trifecta`           | Custom oxlint rules                                                   |

### Tech stack

| Layer         | Technology                                 |
| ------------- | ------------------------------------------ |
| Runtime       | Electron 41 (desktop), Node.js (server)    |
| Framework     | Effect-TS (functional effect system)       |
| Build         | Turborepo, tsdown, Vite 8                  |
| Web UI        | React 19, Tailwind CSS 4, Zustand, Lexical |
| Lint / format | oxlint + oxfmt (Oxc toolchain)             |
| Agents        | 9 providers via JSON-RPC or ACP over stdio |

## Development

```bash
# Optional — only if you manage dev tools with mise
mise install

bun install
bun run dev            # server + web
bun run dev:desktop    # Electron shell
```

Useful scripts: `bun run build`, `bun run typecheck`, `bun run test`, `bun run lint`, `bun run fmt`. Filter to a package with Turbo, e.g. `bun run build --filter=@belweave/trifecta --filter=@belweave/web`.

## More docs

- [CONTRIBUTING.md](./CONTRIBUTING.md) — read before opening an issue or PR
- [DEPLOY.md](./DEPLOY.md) · [REMOTE.md](./REMOTE.md) — self-hosting and remote access
- [docs/observability.md](./docs/observability.md) — logging and tracing
- [docs/providers/](./docs/providers) · [docs/source-control-providers.md](./docs/source-control-providers.md)

## Status

We're very early — expect bugs, and we're not accepting external contributions yet. Need help? Join the [Discord](https://discord.gg/jn4EGJjrvv).
