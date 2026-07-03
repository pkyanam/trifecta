# Trifecta Desktop → Rust Migration Plan

> **Status:** Proposal / high-level plan. This document describes *what* to port,
> *in what order*, and the *hard problems* to solve. It is intentionally
> architecture-level; detailed per-module designs are out of scope and should be
> written per-phase as work begins.

## 1. Executive Summary

`trifecta-desktop/` is the core Trifecta platform: a WebSocket server that wraps
many AI coding agents (Codex, Claude, Gemini, Grok, Hermes, OpenCode, Cursor,
Devin, Antigravity, and any ACP-compatible agent) behind one interface, a large
React web UI, an Electron shell, a VS Code extension, and a set of shared
packages. It is ~370k lines of TypeScript built on **Effect-TS**, **Bun/Node**,
**React 19 + Vite**, and **Electron 41**.

This plan proposes porting the entire application to Rust:

- **Server / runtime** → a Rust workspace of crates built on **Tokio**, keeping
  the exact WebSocket + JSON-RPC/ACP-over-stdio protocols so existing clients
  keep working during the transition.
- **Electron shell** → **Tauri 2** (Rust host process; smaller, faster, no
  bundled Node).
- **Web UI** → a Rust/WASM frontend (**Leptos** or **Dioxus**) to make the port
  "entirely Rust," *or* — as a pragmatic interim — keep the existing React UI
  running inside Tauri while the backend is ported first (recommended sequencing;
  see §8).

The single most expensive and highest-risk piece is the **115k-LOC React web
UI**. The backend (server + packages) is a much cleaner fit for Rust and should
go first because it is where Trifecta's "performance and reliability first"
priorities live.

## 2. Goals & Non-Goals

**Goals**
- Preserve *all* current behavior and the client-facing protocol (mobile, web,
  VS Code, and desktop clients must keep working).
- Move performance-critical and reliability-critical subsystems (provider
  process management, streaming, persistence, git/ssh) to Rust.
- Replace Electron with a lighter Rust-hosted shell.
- Keep the migration incremental and continuously shippable — never a multi-month
  "big bang" branch.

**Non-Goals**
- Rewriting the mobile app (`trifecta-mobile/`) or the marketing/cloud site
  (`trifecta-www/`). They are separate clients and only depend on the WebSocket
  protocol, which we hold stable.
- Changing the agent protocols themselves (ACP, Codex app-server JSON-RPC).
- Feature additions during the port. Parity first.

## 3. Current Architecture (inventory)

Tech stack: Electron 41, Effect-TS (`effect@4.0.0-beta`), React 19, Vite 8,
Tailwind 4, Turborepo, Bun. SQLite via `@effect/sql-sqlite-bun`. Native
`node-pty` for terminals. Lint/format via `oxlint`/`oxfmt` (+ a custom
`oxlint-plugin-trifecta`).

### Apps

| App | ~LOC (src) | Responsibility |
|-----|-----------|----------------|
| `apps/server` | ~140k | Node/Bun WebSocket server. Provider registry + drivers, session/turn lifecycle, orchestration event projection, persistence (SQLite), git/VCS/source-control, ssh, terminals (pty), auth/pairing, HTTP asset serving, telemetry/observability. |
| `apps/web` | ~116k | React/Vite SPA. Session UX, conversation/event rendering, diffs, terminals, editor, client state. Connects over WebSocket. |
| `apps/desktop` | ~14k | Electron shell + auto-updater, window/menu/tray, protocol handlers, safe storage, SSH prompts, backend port management. |
| `apps/vscode` | ~0.5k | VS Code / Cursor extension client. |
| `apps/marketing` | ~0.03k | Small marketing surface. |

**`apps/server/src` subsystems** (file counts indicate relative weight):
`provider/` (131 files — the agent driver system), `persistence/` (76 — SQLite
client, migrations, services), `orchestration/` (38 — domain-event projection),
`sourceControl/` (28), `auth/` (22), `textGeneration/` (20), `vcs/` (16),
`ssh/` (12), `checkpointing/` (10), `terminal/` (7), plus `git/`, `project/`,
`workspace/`, `environment/`, `diagnostics/`, `telemetry/`, `observability/`,
`stream/`, and the WebSocket/HTTP entrypoints (`ws.ts`, `wsServer`, `http.ts`,
`server.ts`, `bin.ts`).

**Agent drivers** (`apps/server/src/provider/Drivers/`): Codex, Claude
(`@anthropic-ai/claude-agent-sdk`), OpenCode (`@opencode-ai/sdk`), Gemini, Grok,
Hermes, Cursor, Devin, Antigravity, and a generic **ACP Registry** driver
(any Agent Client Protocol agent).

### Packages

| Package | ~LOC | Responsibility |
|---------|------|----------------|
| `packages/contracts` | ~10k | Effect/Schema schemas: RPC, WebSocket protocol, provider/session/model types, git, terminal, ssh, orchestration, settings, editor. **Schema-only, no runtime logic.** |
| `packages/shared` | ~7k | Runtime utilities (git, path, net, shell, semver, qr, search ranking, workers) via explicit subpath exports. |
| `packages/effect-codex-app-server` | ~39k | Effect bindings for the Codex app-server JSON-RPC protocol (mostly generated). |
| `packages/effect-acp` | ~14k | Effect bindings for the Agent Client Protocol (agent/client/terminal/rpc). |
| `packages/ssh` | ~3k | SSH terminal + tunnel helpers (auth, command, config, tunnel). |
| `packages/tailscale` | ~0.5k | Tailscale integration. |
| `packages/client-runtime` | ~0.7k | Client-side WebSocket/RPC runtime + endpoint discovery. |

### Protocols (must be preserved)
- **Client ⇄ server:** WebSocket, Effect-style RPC + push channels (e.g.
  `orchestration.domainEvent`). Message shapes defined in `packages/contracts`.
- **Server ⇄ agents:** JSON-RPC over stdio (Codex app-server) and **ACP** over
  stdio; some providers via vendor SDKs (`@anthropic-ai/claude-agent-sdk`,
  `@opencode-ai/sdk`).

### Native / OS dependencies
- `node-pty` (native pty — terminals), SQLite (`@effect/sql-sqlite-bun`),
  Electron `safeStorage` (OS keychain), `electron-updater`, `sharp` (icon
  generation, build-time only), child-process spawning of agent CLIs.

## 4. Target Rust Architecture

Propose a single Cargo workspace under `trifecta-desktop/` (or a new
`trifecta-rs/` during coexistence), mirroring today's package boundaries:

```
crates/
  contracts/         # serde + schemars types (port of packages/contracts) — the keystone crate
  shared/            # git/path/net/shell/semver/qr utilities (packages/shared)
  acp/               # ACP client/agent/terminal over stdio (packages/effect-acp)
  codex-app-server/  # Codex JSON-RPC bindings (packages/effect-codex-app-server)
  persistence/       # sqlx/rusqlite + migrations (apps/server/src/persistence)
  providers/         # provider registry + drivers (apps/server/src/provider)
  orchestration/     # domain-event projection (apps/server/src/orchestration)
  vcs/ git/ source-control/
  ssh/               # russh-based ssh + tunnels (packages/ssh + apps/server/src/ssh)
  terminal/          # portable-pty (replaces node-pty)
  auth/              # pairing, tokens, safe storage
  server/            # axum/tokio-tungstenite WebSocket + HTTP server (apps/server)
apps/
  desktop/           # Tauri 2 shell (replaces apps/desktop Electron)
  web/               # Leptos/Dioxus WASM UI (replaces apps/web React) — see §6
```

**Core technology choices**
- Async runtime: **Tokio**.
- WebSocket/HTTP: **axum** + **tokio-tungstenite** (or `axum::extract::ws`).
- Serialization/contracts: **serde** (+ `schemars` if we want to emit JSON
  Schema for cross-client validation, replacing Effect/Schema's role).
- Persistence: **sqlx** (compile-time-checked SQL) or **rusqlite**; port the
  migrations directory 1:1.
- PTY/terminals: **portable-pty** (Wezterm) instead of `node-pty`.
- SSH: **russh** / **russh-sftp** instead of the Node ssh stack.
- Desktop shell: **Tauri 2**; auto-update via Tauri updater (replaces
  `electron-updater`); OS secrets via **keyring** crate (replaces Electron
  `safeStorage`).
- Process management: `tokio::process` for spawning agent CLIs over stdio.
- UI (if going full-Rust): **Leptos** or **Dioxus** (both compile to WASM,
  support fine-grained reactivity, and pair with Tauri).

## 5. Effect-TS → Rust: the paradigm translation

Effect-TS is pervasive and is the biggest *conceptual* (not just mechanical)
translation. Map its idioms deliberately rather than 1:1:

| Effect-TS concept | Rust equivalent |
|-------------------|-----------------|
| `Effect<A, E, R>` (typed errors + requirements) | `Result<A, E>` with `thiserror` error enums; dependencies via structs/traits (DI) |
| Layers / services / `Context` | Trait objects + constructor injection, or an app `struct` holding services |
| Fibers / structured concurrency | Tokio tasks + `JoinSet`, `CancellationToken`, scoped tasks |
| `Stream` | `futures::Stream` / `tokio_stream`, channels (`tokio::sync::mpsc`, `broadcast`) |
| `Schema` (encode/decode + validation) | `serde` + `validator`/`schemars`; hand-written codecs where schemas are load-bearing |
| `Ref` / `SubscriptionRef` | `Arc<RwLock<_>>`, `watch`/`broadcast` channels |
| Scopes / resource finalizers | RAII (`Drop`), `scopeguard` |

The `contracts` crate is the keystone: it defines the wire types shared with all
clients, so it must be ported first and kept byte-compatible with the current
Effect/Schema output.

## 6. The Web UI problem (largest risk)

`apps/web` is ~116k LOC of React 19 using Zustand, TanStack Router/Query,
Lexical (rich editor), xterm.js (terminals), `@pierre/diffs` (diff rendering),
`@legendapp/list` (virtualization), react-markdown, dnd-kit. There is no
mechanical TS→Rust translation for this; it must be **rewritten**. Three options:

1. **Full Rust/WASM rewrite (Leptos or Dioxus).** Truly "entirely Rust." Highest
   effort; requires Rust equivalents for the editor (Lexical), diff view, and
   terminal. Terminals can embed xterm.js via JS interop or use a WASM terminal;
   the Lexical editor is the hardest single component.
2. **Keep React, host in Tauri (recommended interim).** Port the backend first;
   run the existing web UI unchanged inside a Tauri webview. Ships value early,
   removes Electron/Node from the host, and defers the UI rewrite. Not "100%
   Rust" until step 3, but de-risks everything else.
3. **Hybrid, incremental.** Start with (2), then rewrite UI surfaces
   screen-by-screen in Leptos/Dioxus behind the same WebSocket contracts.

**Recommendation:** sequence 2 → 3 → (optionally) 1. The contracts crate makes
the frontend swappable because the client talks to the server only over the
stable WebSocket protocol.

## 7. Component porting strategy (server & packages)

Order by dependency and by "cleanest Rust fit first":

1. **`contracts`** — port all schemas to serde types; snapshot-test wire
   compatibility against the TS encoder output.
2. **`shared`** — pure utilities; straightforward, high test coverage target.
3. **`persistence`** — port SQLite schema + migrations to sqlx/rusqlite; verify
   against an existing TS-created DB file for read/write compatibility.
4. **`effect-acp` + `codex-app-server`** — stdio JSON-RPC/ACP bindings; these
   are protocol adapters and translate well. (The codex bindings are largely
   generated — regenerate from the same source of truth if possible.)
5. **`terminal`** (portable-pty), **`ssh`** (russh), **`git`/`vcs`/
   `sourceControl`** — subprocess + libgit2 (`git2` crate) work.
6. **`providers`** — the driver registry and each agent driver. Port the shared
   driver machinery first, then drivers one at a time (Codex → Claude → the
   rest). Vendor SDKs (`claude-agent-sdk`, `opencode-sdk`) have no Rust
   equivalent; reimplement the thin HTTP/stdio layers we actually use.
7. **`orchestration`** — domain-event projection from provider runtime activity.
8. **`auth`**, **`telemetry`/`observability`**, **`server`** (axum WebSocket +
   HTTP asset serving, rate limiting, lifecycle).
9. **`desktop`** — Tauri shell, updater, menus, tray, safe storage, backend port
   management, SSH password prompts.
10. **`vscode`** — extension stays TypeScript (VS Code extension host is JS-only);
    it is a thin client over the WebSocket protocol and needs no Rust port.

## 8. Phased roadmap

- **Phase 0 — Foundations.** Cargo workspace, CI (fmt/clippy/test), pick UI
  strategy (§6), stand up `contracts` + `shared` with wire-compat snapshot tests.
- **Phase 1 — Data & protocol adapters.** `persistence`, `effect-acp`,
  `codex-app-server`, `terminal`, `ssh`, `git/vcs`. Prove DB and stdio protocol
  compatibility against the running TS server.
- **Phase 2 — Rust server (parity).** `providers` (Codex first, then others),
  `orchestration`, `auth`, `axum` WebSocket/HTTP server. Run the **Rust server
  behind the existing React UI and existing mobile clients** — this is the first
  end-to-end milestone and validates the whole protocol surface.
- **Phase 3 — Tauri shell.** Replace Electron with Tauri hosting the existing
  React UI; port updater, menus, tray, safe storage, deep links. Ship a Rust
  desktop app (React inside, Rust everywhere else).
- **Phase 4 — Rust UI (optional / to reach 100% Rust).** Incrementally rewrite
  the web UI in Leptos/Dioxus screen-by-screen behind the stable contracts,
  retiring React last (editor + diff + terminal components are the long pole).
- **Phase 5 — Decommission.** Remove the TS server/desktop packages once parity
  and a bake period are confirmed; keep the VS Code extension in TS.

Each phase is independently shippable; the WebSocket contract is the invariant
that lets old and new pieces coexist.

## 9. Testing & validation

- **Wire-compat snapshots:** golden JSON fixtures for every contract type,
  asserted equal between TS and Rust encoders.
- **DB compat:** open a DB written by the TS server with the Rust persistence
  layer and round-trip it.
- **Protocol conformance:** replay recorded agent stdio sessions (Codex/ACP)
  through the Rust adapters and diff the emitted orchestration events.
- **Differential/shadow testing:** run TS and Rust servers side-by-side against
  the same client actions and diff push messages.
- **Port the Vitest suites** to `cargo test` per crate; keep the existing TS
  tests running against the TS impl until each crate is retired.
- **Client compatibility:** the unchanged mobile app and VS Code extension are
  live integration tests throughout Phases 2–3.

## 10. Effort & risk

- **Rough scale:** backend + packages ≈ 200k LOC of logic to port (Phases 0–2);
  UI ≈ 116k LOC to rewrite (Phase 4). Backend is a multi-quarter effort for a
  small team; a full-Rust UI roughly doubles the timeline.
- **Highest risks:** (1) React UI rewrite scope; (2) Effect-TS semantics
  (structured concurrency, typed errors, resource scoping) being subtly
  reimplemented; (3) vendor agent SDKs with no Rust equivalent; (4) exact
  behavioral parity for streaming under reconnects/partial streams (a stated
  core priority); (5) Lexical editor parity.
- **Mitigations:** keep the protocol frozen, ship per-phase, run TS and Rust
  side-by-side, and defer the UI rewrite until the backend is proven.

## 11. Open questions

- Full-Rust UI (Leptos/Dioxus) vs. keeping React-in-Tauri long-term? This is the
  biggest scope decision and drives the timeline.
- Tauri 2 vs. a bespoke `wry`/`tao` shell for the window layer?
- `sqlx` (compile-time SQL checks, async) vs. `rusqlite` (simpler, sync) for
  persistence?
- Do we regenerate the Codex/ACP bindings from their upstream schema, or
  hand-port the current generated TS?
- Is a Bun/Node runtime acceptable anywhere long-term (e.g. the VS Code
  extension client stays TS), or is the goal zero JS in the desktop product?
