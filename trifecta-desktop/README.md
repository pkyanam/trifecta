# Trifecta

Trifecta is a coding agent platform with a desktop server, web UI, and native mobile clients. It supports **eight** coding agents behind a single unified interface.

Companion mobile apps for <a href="../trifecta-ios/">iOS</a> and <a href="../trifecta-android/">Android</a> are also available — they work with Belweave-powered Trifecta Desktop servers.

## Installation

> [!WARNING]
> Trifecta supports multiple coding agents. Install and authenticate at least one before use:
>
> **Native providers:**
> - [Codex](https://developers.openai.com/codex/cli): `codex login`
> - [Claude Code](https://claude.com/product/claude-code): `claude auth login`
> - [OpenCode](https://opencode.ai): `opencode auth login`
> - [Gemini CLI](https://github.com/google-gemini/gemini-cli): `npm i -g @google/gemini-cli` + set `GEMINI_API_KEY`
>
> **ACP providers (Agent Client Protocol):**
> - [Cursor](https://cursor.sh): comes with the Cursor IDE (`cursor auth login`)
> - [Hermes Agent](https://github.com/NousResearch/hermes-agent): `hermes setup`
> - [Devin](https://devin.ai): `devin acp`
> - **ACP Registry**: any [ACP](https://agentclientprotocol.com)-compatible agent (configurable command + args)

### Run without installing

```bash
npx @belweave/trifecta
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pkyanam/trifecta/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install Belweave.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask belweave-code
```

#### Arch Linux (AUR)

```bash
yay -S belweave-bin
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Electron Desktop Shell                  │
│  ┌───────────────────────────────────────────────┐  │
│  │           React/Vite Web UI                    │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │ WebSocket                      │
│  ┌──────────────────▼────────────────────────────┐  │
│  │         Node.js Server (Effect-TS)             │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │         Provider Registry                │  │  │
│  │  │  Codex │ Claude │ Gemini │ Cursor        │  │  │
│  │  │  Hermes │ Devin │ OpenCode │ ACP Registry │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 41 (desktop), Node.js (server) |
| Framework | Effect-TS (functional effect system) |
| Build | Turborepo, tsdown, Vite 8 |
| Web UI | React 19, Tailwind CSS 4, Zustand, Lexical |
| Linting | oxlint + oxfmt (Oxidation toolchain) |
| Agents | 8 providers via JSON-RPC or ACP over stdio |

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

## If you REALLY want to contribute still.... read this first

Before local development, prepare the environment and install dependencies:

```bash
# Optional: only needed if you use mise for dev tool management.
mise install
bun install .
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
