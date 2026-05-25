# Trifecta macOS — Native Swift Client Plan

A native Swift/SwiftUI macOS client for the Trifecta server. **No Electron, no React, no
JS bundle.** It is a standalone client (like the iOS/Android apps), not bundled with the
server. It speaks the *exact* same pairing + WebSocket protocol that `trifecta-desktop`'s
web app (`apps/web`) speaks.

> Reference codebase for the protocol: `trifecta-desktop/` (this is the only source of
> truth used to derive this plan). All file paths below are relative to
> `trifecta-desktop/` unless noted.

---

## Goals & non-goals

**Goal:** functionally 1:1 with the web app (`apps/web`) for connecting to and operating a
Trifecta server — pair, browse projects/threads, run agents, stream responses, approve
actions, view diffs, terminals, git, and settings.

**Liquid Glass UI:** target macOS 26 (Tahoe) for the Liquid Glass look; **floor at macOS 14
Sonoma** with graceful fallback (decision confirmed). All glass usage is centralized behind
custom view modifiers that branch on `#available(macOS 26, *)` → `.glassEffect(…)`, else
`.background(.regularMaterial)`.

**Non-goals (initially):** the desktop-only local-process features — SSH *launch* of remote
servers, app auto-update, managing the local backend lifecycle. These need local process
access and are out of scope for a pure client. (SSH *terminal* sessions to already-known
hosts ARE in scope via the `ssh.*` RPCs; only desktop-managed SSH *launch* is excluded.)

---

## Confirmed decisions

1. **Contract translation:** hand-port `Codable` structs mirroring `packages/contracts/src/*.ts`
   for the MVP. Revisit codegen (Effect Schema → JSON Schema → Swift) only if drift becomes
   painful. `@effect/openapi-generator` is already in the repo catalog if we go that route.
2. **macOS floor:** macOS 14 Sonoma. Liquid Glass on macOS 26. Don't support < 14.

---

## The protocol we must speak (the whole ballgame)

The server is a clean client/server split: one WebSocket (`/ws`) speaking **Effect-RPC over
JSON**, plus plain HTTP/JSON REST endpoints for pairing/auth. The web app and the Electron
app are both just clients of this. There is no privileged desktop-only channel needed for
parity.

### A. Pairing + auth (plain HTTP/JSON — easy)

Reference implementation to mirror: `apps/web/src/environments/remote/api.ts` — this is the
**bearer-token** path designed for non-browser clients (browsers use cookies; we use a
bearer token + Keychain).

1. **Input:** a pairing URL `host=<httpBaseUrl>#token=<PAIRCODE>` — token is in the URL
   **hash** (`REMOTE.md:172`). Sources: `trifecta serve` QR/printout, or desktop "Create Link".
2. **Bootstrap:** `POST {host}/api/auth/bootstrap/bearer` body `{ "credential": "<token>" }`
   → `AuthBearerBootstrapResult { authenticated, role, sessionMethod:"bearer-session-token",
   expiresAt, sessionToken }` (`apps/server/src/auth/http.ts:104`). Store `sessionToken` in
   **Keychain**.
3. **Restore/verify session:** `GET {host}/api/auth/session` header
   `Authorization: Bearer <sessionToken>` → `AuthSessionState` (`auth/http.ts:37`).
4. **Environment descriptor:** `GET {host}/.well-known/belweave/environment` →
   `ExecutionEnvironmentDescriptor` (`remote/api.ts:140`).
5. **Mint WS ticket:** `POST {host}/api/auth/ws-token` (bearer) → `{ token, expiresAt }`
   (`auth/http.ts:131`).
6. **Connect WS:** `wss://{host}/ws?wsToken=<token>` — token rides as a **query param**
   because WS upgrades can't carry custom auth headers. Param name `wsToken`
   (`apps/server/src/auth/Layers/ServerAuth.ts:40`, consumed at `:356`). Path mangling
   (append `/ws`) logic: `apps/web/src/rpc/protocol.ts:74-85`.

Owner-only management endpoints (only needed for the "Connections" settings screen managing
other devices): `/api/auth/pairing-token`, `/api/auth/pairing-links[/revoke]`,
`/api/auth/clients[/revoke|/revoke-others]` (`auth/http.ts`).

Auth contract types: `packages/contracts/src/auth.ts`.

### B. WebSocket transport — Effect-RPC over JSON (the hard part)

Server: `RpcServer.toHttpEffectWebsocket(WsRpcGroup, { disableTracing: true })` with
`RpcSerialization.layerJson` (`apps/server/src/ws.ts:1763-1768`).
Client mirror: `RpcClient.makeProtocolSocket` + `RpcSerialization.layerJson`
(`apps/web/src/rpc/protocol.ts:225-243`).

Exact wire messages (re-implement these two enums in Swift):
source of truth `node_modules/effect/dist/unstable/rpc/RpcMessage.d.ts`.

**Client → server:**
- `{ "_tag":"Request", "id":"<n>", "tag":"<method>", "payload":<json>, "headers":[] }`
  — `id` is a stringified incrementing bigint; `tag` is the method name
  (e.g. `"orchestration.dispatchCommand"`). `headers` is `[[string,string]]`.
- `{ "_tag":"Ack", "requestId":"<n>" }` — streaming backpressure; send after consuming chunk(s).
- `{ "_tag":"Interrupt", "requestId":"<n>", "interruptors":[...] }` — cancel a request/stream.
- `{ "_tag":"Ping" }` / `{ "_tag":"Eof" }` — heartbeat / shutdown.

**Server → client:**
- `{ "_tag":"Chunk", "requestId":"<n>", "values":[…] }` — one or more results. Unary responses
  arrive as a one-element chunk; streams as many.
- `{ "_tag":"Exit", "requestId":"<n>", "exit": {"_tag":"Success","value":…}
  | {"_tag":"Failure","cause":[ {"_tag":"Fail","error":…} | {"_tag":"Die","defect":…}
  | {"_tag":"Interrupt","fiberId":…} ]} }` — terminal message for the request.
- `{ "_tag":"Defect", "defect":… }`, `{ "_tag":"Pong" }`,
  `{ "_tag":"ClientProtocolError", "error":… }`.

Choreography:
- **Unary call:** send `Request` → collect `Chunk`(s) → resolve on `Exit.Success` / throw on
  `Exit.Failure`.
- **Subscription:** send `Request` → emit each `Chunk` value to an `AsyncThrowingStream`,
  send `Ack` for flow control → send `Interrupt` to unsubscribe → terminate on `Exit`.
- **Heartbeat:** ping/pong keeps socket alive and drives reconnect
  (`protocol.ts:296-322`, `wsConnectionState.ts`). Reconnect = exponential-ish backoff.

### C. The RPC surface

`WsRpcGroup` in `packages/contracts/src/rpc.ts:122-645` — ~60 methods. Method-name constants
in `WS_METHODS` (`rpc.ts:122-199`) and `ORCHESTRATION_WS_METHODS` (`orchestration.ts:25-32`).
Groups: orchestration, terminal, ssh terminal, vcs/git, source control, server
config/settings, keybindings, filesystem browse, project file ops, auth-access stream.

### D. Domain model — event-sourced CQRS

Three orchestration methods carry ~90% of the product (`orchestration.ts`):

- **`orchestration.subscribeShell`** (stream) → `snapshot` of all projects + thread shells,
  then incremental `project-upserted/removed` / `thread-upserted/removed` events. Drives the
  **sidebar tree**. Shapes: `OrchestrationShellSnapshot`, `OrchestrationShellStreamItem`
  (`orchestration.ts:402-441`).
- **`orchestration.subscribeThread`** (stream) → `OrchestrationThreadDetailSnapshot` (full
  thread: messages, activities, proposed plans, checkpoints, session, latest turn) then
  incremental thread events (`thread.message-sent`, `thread.activity-appended`,
  `thread.turn-diff-completed`, `thread.reverted`, `thread.session-set`, …). Drives the
  **chat view**. Shapes: `OrchestrationThread` (`:333`), `OrchestrationThreadDetailSnapshot`
  (`:448`), event union (`:1000-1100`).
- **`orchestration.dispatchCommand`** (unary) → all mutations: `project.create`,
  `thread.create`, `thread.turn.start` (send message / start turn), `thread.turn.interrupt`,
  `thread.approval.respond`, `thread.user-input.respond`, `thread.checkpoint.revert`,
  `thread.meta.update`, `thread.runtime-mode.set`, `thread.interaction-mode.set`,
  archive/unarchive/delete, etc. (`orchestration.ts:454-760`).

Also: `getTurnDiff`, `getFullThreadDiff`, `replayEvents`, `getArchivedShellSnapshot`,
`subscribeShell`.

**Activity model is generic** (a gift): `OrchestrationThreadActivity { id, tone:
info|tool|approval|error, kind, summary, payload: Unknown, turnId, createdAt }`
(`orchestration.ts:302-312`). `payload` is freeform JSON keyed by `kind` — tool calls,
reasoning, approvals all flow through one shape. The renderer is a registry keyed on `kind`;
no typed schema per tool is required. Decode `payload` lazily/opaquely
(`AnyCodable`-style or keep as raw `Data`/JSON and parse per-`kind` in the view layer).

---

## Swift architecture

```
TrifectaMac/                       (Xcode project, SwiftPM-organized)
├── Packages/
│   ├── TrifectaProtocol/          // pure Swift, no UI
│   │   ├── Contracts/             // Codable structs ⇄ Effect Schema
│   │   │                          //   (auth, orchestration, git, terminal, ssh, server,
│   │   │                          //    settings, sourceControl, model, provider, …)
│   │   ├── RpcClient/             // Effect-RPC framing over URLSessionWebSocketTask
│   │   ├── Pairing/               // REST auth flow + Keychain
│   │   └── Transport/             // reconnect, heartbeat, AsyncStream plumbing
│   └── TrifectaCore/              // @Observable stores + reducers
│       ├── ShellStore             //   consumes subscribeShell
│       ├── ThreadStore            //   consumes subscribeThread (open thread)
│       ├── ConnectionStore        //   environments, status, reconnect
│       ├── CommandDispatcher      //   builds *Command payloads → dispatchCommand
│       └── SettingsStore
└── App/                           // SwiftUI views, Liquid Glass, app lifecycle
```

- **Networking:** `URLSession` for REST; `URLSessionWebSocketTask` for `/ws`. Wrap socket
  send/receive in an `actor`. Unary calls = `async throws`; subscriptions =
  `AsyncThrowingStream`. (Pattern: the `ios-networking` skill.)
- **Contracts:** hand-written `Codable`. Discriminated unions (`type`/`_tag` literals) →
  Swift enums with associated values + custom `init(from:)` keyed on the discriminator.
  (Pattern: the `swift-codable` skill.)
- **State:** Observation framework (`@Observable`). Snapshot-then-incremental reducers mirror
  `apps/web/src/store.ts` + `orchestrationEventEffects.ts` (port nearly line-for-line).
  (Pattern: `swift-architecture` → MV with `@Observable`.)
- **UI:** `NavigationSplitView` (sidebar = projects/threads; detail = chat). Screen inventory
  comes from `apps/web/src/routes/` + `apps/web/src/components/` (135 components). Centerpiece
  = chat transcript (message bubbles + activity feed: tool calls, reasoning, approvals with
  inline accept/deny → `thread.approval.respond`, user-input prompts →
  `thread.user-input.respond`, proposed plans) + composer (prompt editor, model picker,
  runtime/interaction mode). (Patterns: `swiftui-liquid-glass`, `swiftui-navigation`,
  `swiftui-layout-components`.)

---

## #1 risk and how to kill it early

**Risk:** hand-reimplementing the Effect-RPC framing/handshake (chunk batching, `Ack`
backpressure timing, ping/pong cadence, initial socket handshake, error `cause` shapes). The
`.d.ts` gives message *shapes*, not the exact *choreography*.

**De-risk in M0, before any UI:**
1. Run `npx @belweave/trifecta serve` locally; pair the **web app** against it; capture raw
   `/ws` frames (browser devtools → WS, or a local proxy). Capture: connect → a unary call →
   a subscription with chunks/acks/interrupt → exit. This removes ~90% of the guesswork.
2. Build a **conformance harness**: a tiny Swift CLI that pairs, opens `/ws`, calls one unary
   (`server.getConfig`) and one stream (`orchestration.subscribeShell`), and prints decoded
   values. Get this green against a live server before writing any view. Framing right here =
   framing right everywhere.

---

## Liquid Glass + backward compat

- Target macOS 26 for the glass look; floor macOS 14 Sonoma.
- Centralize glass behind custom modifiers, e.g. `.trifectaSurface()`:
  `if #available(macOS 26, *) { content.glassEffect(…) } else { content.background(.regularMaterial) }`.
- Wrap new chrome APIs (toolbar/tab/split-view glass) ourselves for predictable fallback.
- Companion skill: `swiftui-liquid-glass`.

---

## Roadmap (MVP = M0–M3)

| Milestone | Deliverable | RPC surface |
|---|---|---|
| **M0 — Protocol spike** | CLI harness: pair, open WS, one unary + one stream decode cleanly | bootstrap/bearer, ws-token, `/ws`, `server.getConfig`, `subscribeShell` |
| **M1 — Connection & pairing UI** | Paste/scan pairing URL, Keychain storage, connection status, reconnect, multi-environment list | auth REST, `subscribeAuthAccess`, env descriptor |
| **M2 — Read-only shell** | Sidebar tree of projects/threads; open a thread; render messages + activity feed (read-only); snapshot+incremental reducers | `subscribeShell`, `subscribeThread` |
| **M3 — Conversation loop (MVP done)** | Composer → send message, stream assistant deltas, interrupt, model/runtime/interaction pickers, approvals & user-input prompts | `dispatchCommand` (`thread.*`), `model`/`provider` contracts |
| **M4 — Diffs & git** | Turn/thread diff viewer, VCS status, git actions (stacked actions, PR flow), branch switcher | `getTurnDiff`, `getFullThreadDiff`, `subscribeVcsStatus`, `git.*`, `vcs.*` |
| **M5 — Terminals** | Thread terminal + SSH terminal panes (SwiftTerm-style emulator over the streams) | `terminal.*`, `subscribeTerminalEvents`, `ssh.*`, `subscribeSshTerminal` |
| **M6 — Settings & source control** | Connections/providers/keybindings/diagnostics/quotas; clone/publish repos; filesystem browse | `server.*`, `sourceControl.*`, `projects.*`, `filesystem.browse` |
| **M7 — Polish** | Liquid Glass pass, command palette, keyboard shortcuts, animations, archived threads | — |

---

## Key reference files in `trifecta-desktop/`

- Wire format: `node_modules/effect/dist/unstable/rpc/RpcMessage.d.ts`
- RPC group / methods: `packages/contracts/src/rpc.ts`
- Orchestration domain: `packages/contracts/src/orchestration.ts`
- Auth contract: `packages/contracts/src/auth.ts`
- All contracts: `packages/contracts/src/*.ts`
- Client transport reference: `apps/web/src/rpc/protocol.ts`, `wsTransport.ts`, `wsRpcClient.ts`,
  `wsConnectionState.ts`
- Remote (bearer) auth reference: `apps/web/src/environments/remote/api.ts`
- Store/reducers reference: `apps/web/src/store.ts`, `orchestrationEventEffects.ts`
- Server WS mount + auth: `apps/server/src/ws.ts` (`/ws` at `:1753`), `apps/server/src/auth/`
- UI inventory: `apps/web/src/routes/`, `apps/web/src/components/`
- Remote-access concepts: `REMOTE.md`

---

## Immediate next step

Execute **M0**: write the Swift `TrifectaProtocol` RPC client + pairing flow + a conformance
CLI, and prove the wire format against a live `npx @belweave/trifecta serve` before building
any UI. Needs a running server to test against.
