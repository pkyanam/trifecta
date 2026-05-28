# @belweave/trifecta

The Trifecta server — a Node.js process that orchestrates AI coding agents behind a single WebSocket interface, serves the Trifecta web UI, and pairs with the companion desktop, iOS, and Android clients over the same protocol.

It wraps **nine** coding agents (Codex, Claude Code, OpenCode, Gemini, Antigravity, Cursor, Hermes, Devin, and any ACP-compatible agent) so every client speaks to them the same way.

## Run without installing

```bash
npx @belweave/trifecta
# or
bunx @belweave/trifecta
```

This starts the server and opens the web UI. Run `npx @belweave/trifecta --help` to see all flags and subcommands (`start`, `serve`, `auth`, `project`).

> [!IMPORTANT]
> Trifecta drives agents you already have installed. Set up and authenticate at least one agent before pairing a client.

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

## Requirements

- **Node.js ≥ 22.16** (also runs on 23.11+ and 24.10+), or Bun ≥ 1.3.
- On install, the native [`node-pty`](https://www.npmjs.com/package/node-pty) dependency is built for your platform.

## Prefer a desktop app?

Grab a signed build from [GitHub Releases](https://github.com/pkyanam/trifecta/releases), or:

```bash
brew install --cask belweave-code   # macOS
winget install Belweave.T3Code       # Windows
yay -S belweave-bin                  # Arch Linux (AUR)
```

## Documentation

Full docs, architecture, self-hosting, and remote-access guides live in the [monorepo README](https://github.com/pkyanam/trifecta/tree/main/trifecta-desktop#readme).

## License

[MIT](./LICENSE) © Belweave

---

We're very early — expect bugs. Need help? Join the [Discord](https://discord.gg/jn4EGJjrvv).
