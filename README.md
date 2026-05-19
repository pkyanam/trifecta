# Trifecta

Trifecta is a cross-platform coding agent platform. It consists of a desktop server that runs AI coding agents, plus native mobile clients for iOS and Android that let you chat with your agent, review changes, and manage your development workflow from anywhere.

The mobile apps are also designed to be compatible with the official **Belweave** desktop server, not just Trifecta Desktop.

## Monorepo Structure (Absolutely Comprehensive)

The repository is organized as a Turborepo + Bun monorepo containing multiple top-level folders and deeply nested scoped packages under the `@belweave/*` and `@t3tools/*` namespaces (the latter preserved from the original T3 Code subtree merge).

### Top-Level Folders

```
trifecta/
├── trifecta-desktop/          # Primary monorepo for desktop, web, server, IDE extension, and all shared packages (Turborepo root)
├── trifecta-ios/              # Native iOS client (SwiftUI + Xcode)
├── trifecta-android/          # Native Android client (Kotlin + Jetpack Compose)
├── trifecta-www/              # Marketing / landing website (Next.js)
├── t3code-original/           # Preserved original T3 Code / Theo's reference monorepo (subtree merge source)
├── docs/                      # Architecture, observability, and engineering documentation
├── _reference/                # Reference implementations (Hermes Agent, etc.)
├── .github/                   # CI/CD workflows, issue templates
└── ... (root config files: turbo.json, package.json as @belweave/monorepo, etc.)
```

### Detailed Breakdown of Each Folder

#### 1. `trifecta-desktop/` (Core Platform Monorepo)

This is the heart of the project. It is a full Turborepo workspace containing the desktop app, server, web UI, VS Code extension, and all shared libraries. It publishes/runs under the `@belweave/*` scoped package names.

**Internal Scoped Packages & Apps (`@belweave/*` and related):**

- `@belweave/monorepo` — Root workspace definition (`package.json` at trifecta-desktop/)
- `@belweave/trifecta` — The main server package (apps/server). Node.js + Effect-TS WebSocket server that orchestrates agents.
- `@belweave/desktop` — Electron desktop shell (apps/desktop)
- `@belweave/web` — React 19 + Vite web UI (apps/web). Full-featured interface for desktop use.
- `@belweave/marketing` — Marketing site inside the desktop workspace (apps/marketing, Astro-based)
- `@belweave/contracts` — Shared Effect Schema + TypeScript contracts for events, RPC, models (packages/contracts). Schema-only, no runtime logic.
- `@belweave/shared` — Shared runtime utilities (git, stores, utils) with explicit subpath exports (e.g. `@belweave/shared/git`) (packages/shared)
- `@belweave/client-runtime` — Client-side runtime for WebSocket/RPC (packages/client-runtime)
- `@belweave/ssh` — SSH tunnel / remote environment helpers (packages/ssh)
- `@belweave/tailscale` — Tailscale integration for secure remote access (packages/tailscale)
- `@belweave/scripts` — Build, release, and utility scripts (scripts/)
- `@belweave/oxlint-plugin-trifecta` — Custom oxlint plugin for Trifecta-specific lint rules (oxlint-plugin-trifecta/)
- `trifecta-ide` (VS Code extension) — Located at `apps/vscode/`. The Trifecta IDE extension (renamed from oxlint-plugin-t3code / t3code). Provides native sidebar, model picker, etc.

**Key Subdirectories inside trifecta-desktop/:**
- `apps/server/`, `apps/web/`, `apps/desktop/`, `apps/vscode/`, `apps/marketing/`
- `packages/*` (as listed above)
- `scripts/`, `docs/`, `release/`, `.plans/`

**Tech Stack Highlights:**
- Effect-TS everywhere for robust error handling and streaming
- WebSocket + Effect-style RPC for mobile ↔ desktop communication
- Supports 8 agents: Codex, Claude Code, Gemini, Cursor, Hermes, Devin, OpenCode, ACP Registry
- Turborepo + Bun for fast builds and filtering (`--filter=@belweave/web --filter=@belweave/trifecta`)

See `trifecta-desktop/README.md`, `trifecta-desktop/AGENTS.md`, `trifecta-desktop/DEPLOY.md`, and `trifecta-desktop/REMOTE.md` for full details.

#### 2. `trifecta-ios/`

Native iOS client written in SwiftUI.

**Key Features:**
- Chat, thread/project management, approvals, Git Lite, model picker, image attachments, multi-server profiles
- Uses EffectRPC over WebSocket for communication with desktop server
- Supports both Trifecta Desktop and Belweave/T3 Code servers

**Project Structure Highlights:**
- `Trifecta/` (Swift sources): App/, Core/ (Models, Networking, Stores), etc.
- Full Xcode project with privacy manifests and asset catalogs.

See `trifecta-ios/README.md` for the complete engineering guide and file-by-file breakdown.

#### 3. `trifecta-android/`

Native Android client (Kotlin + Jetpack Compose). Mirrors iOS feature set for consistency.

**Key Features:**
- Full chat timeline, thread/project management, approvals, Git Lite, two-level provider/model picker, photo attachments, deep linking (`trifecta://`)
- Encrypted token storage, multi-server support

**Requirements:** Android 8.0+ (API 26+), Android Studio Ladybug+, JDK 17

See `trifecta-android/README.md` for full details.

#### 4. `trifecta-www/`

Marketing / promotional website built with Next.js. Hosts public-facing content, docs links, and download CTAs for the desktop app and mobile clients.

#### 5. `t3code-original/`

Preserved original monorepo from the T3 Code (Theo) subtree merge (`pingdotgg/t3code`). Contains the historical `@t3tools/*` scoped packages that were the foundation for the current `@belweave/*` packages.

**Historical Scoped Packages:**
- `@t3tools/monorepo`, `@t3tools/contracts`, `@t3tools/shared`, `@t3tools/ssh`, `@t3tools/client-runtime`, `@t3tools/tailscale`, `@t3tools/web`, `@t3tools/desktop`, `@t3tools/marketing`, `@t3tools/scripts`, `@t3tools/oxlint-plugin-t3code`

This folder exists for reference, git history, and future subtree merge operations (`git merge -Xsubtree=trifecta-desktop t3code/main`).

#### 6. `docs/`

Architecture documentation, observability guides, deployment notes, and engineering decision records.

#### 7. `_reference/`

Reference repositories and implementations (e.g., Hermes Agent UI-TUI, Codex Monitor, etc.) used during development for protocol and UX patterns.

## Supported Agents

Trifecta wraps multiple coding agents behind a single unified interface (see table in original README for details on Codex, Claude Code, OpenCode, Gemini, Cursor, Hermes, Devin, ACP Registry).

## How the Platform Works

(See architecture diagram and explanation in the original content.)

## License

Copyright (c) Belweave. All rights reserved.
