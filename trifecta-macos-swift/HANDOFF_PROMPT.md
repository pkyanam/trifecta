# Handoff Prompt — Trifecta macOS Swift Client

## Status

**M0 and M1 are complete and verified.**

**M0** — `TrifectaProtocol` library + `TrifectaConformance` CLI, proven against a live
`trifecta serve` instance. Bearer bootstrap, WS connect, `server.getConfig` unary,
`orchestration.subscribeShell` stream — all verified. The Effect-RPC wire framing
(Request/Chunk/Exit/Ack/Interrupt/Ping) is solid.

**M1** — Connection & Pairing UI, complete and building cleanly:
- `KeychainStore` (SecItem wrapper, token per env UUID)
- `ConnectionStore` (@Observable, @MainActor) — pairing, connect/disconnect, exponential
  backoff reconnect matching `wsConnectionState.ts` (1 s, 2×, 64 s max, 7 retries)
- Full SwiftUI app (`TrifectaApp` target): `NavigationSplitView` shell, environment list
  with status dots, pairing sheet (URL paste + manual), toolbar status capsule

**Your task: implement M2 — Read-only shell.**

---

## Repo location

```
/Users/preetham/projects/trifecta/trifecta-macos-swift/
```

Everything you need to build is inside this directory. Do not touch anything outside it.
The rest of the monorepo is reference-only.

---

## What exists

```
trifecta-macos-swift/
├── PLAN.md                              ← architecture + full roadmap
├── HANDOFF_PROMPT.md                    ← this file
├── Package.swift                        ← SwiftPM; macOS 14+; no external deps
└── Sources/
    ├── TrifectaProtocol/                ← pure Swift library (no UI)
    │   ├── RPC/
    │   │   ├── JSONValue.swift
    │   │   ├── RpcMessages.swift
    │   │   └── RpcTransport.swift       ← actor; connect/callUnary/subscribe/waitForDisconnect
    │   ├── Contracts/
    │   │   ├── Auth.swift
    │   │   ├── Orchestration.swift      ← shell shapes only (M0 scope) — EXPAND IN M2
    │   │   └── ServerConfig.swift
    │   └── Pairing/
    │       ├── PairingClient.swift
    │       └── KeychainStore.swift      ← added in M1
    ├── TrifectaCore/                    ← @Observable stores (no UI)
    │   ├── SavedEnvironment.swift
    │   └── ConnectionStore.swift        ← manages transport + reconnect
    ├── TrifectaApp/                     ← SwiftUI app
    │   ├── TrifectaApp.swift            ← @main
    │   ├── ContentView.swift            ← NavigationSplitView shell
    │   ├── EnvironmentListView.swift    ← sidebar env list (M1)
    │   ├── PairingFlowView.swift        ← add-connection sheet (M1)
    │   ├── ConnectionStatusView.swift   ← toolbar capsule (M1)
    │   └── ViewModifiers.swift          ← .trifectaSurface()
    └── TrifectaConformance/
        └── main.swift                   ← M0 CLI harness (regression — don't break it)
```

### Key types you'll use

```swift
// From TrifectaProtocol — the live transport (get from ConnectionStore)
let stream = await transport.subscribe(
    tag: "orchestration.subscribeShell",
    payload: .object([:])
)
let threadStream = await transport.subscribe(
    tag: "orchestration.subscribeThread",
    payload: .object(["threadId": .string(threadId)])
)

// From TrifectaCore — already wired into the app
@Environment(ConnectionStore.self) var store
store.transport          // RpcTransport? — non-nil when connected
store.connectionStatus   // ConnectionStatus enum
store.activeEnvironment  // SavedEnvironment?
```

---

## Gotchas from M0/M1

1. **SourceKit cross-file errors** — all files in the same SwiftPM target are in the
   same module, but SourceKit resolves them in isolation. `swift build` is always clean;
   ignore editor squiggles like "No such module 'TrifectaProtocol'" inside `TrifectaCore`.

2. **`RpcTransport` is an `actor`** — calling its methods from `@MainActor` synchronous
   context requires `await` or fire-and-forget `Task { await ... }`. See how
   `ConnectionStore.disconnect()` handles this: capture the reference, nil it, then
   `Task { await stale?.disconnect() }`.

3. **`server.getConfig` returns `null` for client-role sessions** — owner-only.

4. **Pairing tokens are single-use** — bootstrap consumes the token; `sessionToken`
   in Keychain is the long-lived credential. Already handled in M1.

5. **`subscribeThread` payload** — the wire payload is `{ "threadId": "<id>" }`.
   Pass it as `payload: .object(["threadId": .string(id)])`.

6. **`OrchestrationEvent` is a large discriminated union** — for M2 (read-only), you only
   need to handle the subset that affects the view. Use a `default` / `.unknown` case for
   events you don't care about rather than exhaustively decoding all 20+ types.

---

## M2 scope (your deliverable)

> **Read-only shell** — sidebar tree of projects/threads, open a thread, render messages +
> activity feed (read-only), snapshot+incremental reducers.
>
> RPC surface: `subscribeShell`, `subscribeThread`

### Part 1 — Expand `TrifectaProtocol/Contracts/Orchestration.swift`

The existing file has shell shapes only (M0). Add the full thread-detail types needed for
`subscribeThread`. Reference: `trifecta-desktop/packages/contracts/src/orchestration.ts`.

Types to add (hand-port as `Codable` structs/enums):

```swift
// Already exist — keep as-is:
//   OrchestrationProjectShell, OrchestrationThreadShell
//   OrchestrationShellSnapshot, OrchestrationShellStreamItem

// Add — thread detail snapshot:
struct OrchestrationMessage: Decodable {
    let id: String
    let role: String          // "user" | "assistant" | "system"
    let text: String
    let turnId: String?
    let streaming: Bool
    let createdAt: String
    let updatedAt: String
}

struct OrchestrationThreadActivity: Decodable {
    let id: String
    let tone: String          // "info" | "tool" | "approval" | "error"
    let kind: String
    let summary: String
    let payload: JSONValue    // opaque — render by kind in view layer
    let turnId: String?
    let createdAt: String
}

struct OrchestrationSession: Decodable {
    let threadId: String
    let status: String        // "idle"|"starting"|"running"|"ready"|"interrupted"|"stopped"|"error"
    let providerName: String?
    let runtimeMode: String
    let activeTurnId: String?
    let lastError: String?
    let updatedAt: String
}

struct OrchestrationLatestTurn: Decodable {
    let turnId: String
    let state: String         // "running"|"interrupted"|"completed"|"error"
    let requestedAt: String
    let startedAt: String?
    let completedAt: String?
    let assistantMessageId: String?
}

struct OrchestrationThread: Decodable {
    let id: String
    let projectId: String
    let title: String
    let branch: String?
    let worktreePath: String?
    let latestTurn: OrchestrationLatestTurn?
    let messages: [OrchestrationMessage]
    let activities: [OrchestrationThreadActivity]
    let session: OrchestrationSession?
    let createdAt: String
    let updatedAt: String
    let archivedAt: String?
    // Omit modelSelection, proposedPlans, checkpoints for M2 — add in M3+
}

struct OrchestrationThreadDetailSnapshot: Decodable {
    let snapshotSequence: Int
    let thread: OrchestrationThread
}

// Incremental events — only the 4 types relevant to M2 read view:
enum OrchestrationThreadStreamItem: Decodable {
    case snapshot(OrchestrationThreadDetailSnapshot)
    case messageSent(message: OrchestrationMessage)        // type="thread.message-sent"
    case activityAppended(activity: OrchestrationThreadActivity) // type="thread.activity-appended"
    case sessionSet(session: OrchestrationSession)         // type="thread.session-set"
    case unknown(kind: String)                             // all other event types
    // Decode: kind="snapshot" → .snapshot; kind="event" → inspect event.type
}
```

The wire shape for `subscribeThread` stream items:
```json
// kind = "snapshot"
{ "kind": "snapshot", "snapshot": { "snapshotSequence": N, "thread": {...} } }

// kind = "event"  
{ "kind": "event", "event": { "type": "thread.message-sent", "payload": { "message": {...} } } }
{ "kind": "event", "event": { "type": "thread.activity-appended", "payload": { "activity": {...} } } }
{ "kind": "event", "event": { "type": "thread.session-set", "payload": { "session": {...} } } }
```

For the `"event"` case, decode `event.type` first, then decode `event.payload.*` for the
specific type. See `orchestration.ts:1103-1113` for the `OrchestrationThreadStreamItem`
schema and `:880-1100` for `OrchestrationEvent` payloads.

### Part 2 — `ShellStore` in `TrifectaCore`

```swift
@Observable @MainActor
final class ShellStore {
    var projects: [OrchestrationProjectShell] = []
    var threads: [OrchestrationThreadShell] = []
    var snapshotSequence: Int = 0
    var isLoading: Bool = true
    var error: String?

    // Derived — threads grouped by project
    var threadsByProjectId: [String: [OrchestrationThreadShell]] { ... }

    func start(transport: RpcTransport) async   // subscribe + apply events
    func stop()                                  // cancel subscription
}
```

Subscription pattern:
```swift
func start(transport: RpcTransport) async {
    isLoading = true
    let stream = await transport.subscribe(tag: "orchestration.subscribeShell")
    subscriptionTask = Task {
        for try await value in stream {
            let data = try JSONEncoder().encode(value)
            let item = try JSONDecoder().decode(OrchestrationShellStreamItem.self, from: data)
            apply(item)
        }
    }
}

private func apply(_ item: OrchestrationShellStreamItem) {
    switch item {
    case .snapshot(let snap):
        snapshotSequence = snap.snapshotSequence
        projects = snap.projects
        threads = snap.threads
        isLoading = false
    case .projectUpserted(_, let p):
        if let i = projects.firstIndex(where: { $0.id == p.id }) { projects[i] = p }
        else { projects.append(p) }
    case .projectRemoved(_, let id):
        projects.removeAll { $0.id == id }
        threads.removeAll { $0.projectId == id }
    case .threadUpserted(_, let t):
        if let i = threads.firstIndex(where: { $0.id == t.id }) { threads[i] = t }
        else { threads.append(t) }
    case .threadRemoved(_, let id):
        threads.removeAll { $0.id == id }
    }
}
```

**Wire `ShellStore` into `ConnectionStore`**: when `connectionStatus` becomes `.connected`,
call `shellStore.start(transport:)`; when it becomes anything else, call `shellStore.stop()`.
Add `var shellStore = ShellStore()` to `ConnectionStore`, or inject it through the app.

### Part 3 — `ThreadDetailStore` in `TrifectaCore`

```swift
@Observable @MainActor
final class ThreadDetailStore {
    var thread: OrchestrationThread?
    var isLoading: Bool = false
    var error: String?
    private(set) var activeThreadId: String?
    private var subscriptionTask: Task<Void, Never>?

    func open(threadId: String, transport: RpcTransport) async
    func close()
}
```

On `open`: cancel existing subscription, subscribe to `orchestration.subscribeThread`
with payload `{ "threadId": threadId }`, apply snapshot then incremental events.

Apply events:
- `thread.message-sent` → append/upsert message in `thread.messages`
- `thread.activity-appended` → append activity in `thread.activities`
- `thread.session-set` → update `thread.session`
- All others → ignore (M2 is read-only)

### Part 4 — UI

Replace the M1 detail placeholder in `ContentView` with a real `NavigationSplitView`
that has three columns: sidebar (environment/projects), content (thread list), detail (thread view).

Or use a two-column split where the sidebar shows a collapsible project → thread tree.
Either approach is fine for M2.

**Sidebar tree** (`ProjectThreadSidebarView`):
```
▼ My Project
    Thread A          ● (green if session running)
    Thread B
▼ Other Project
    Thread C
```
- Use `List` with `DisclosureGroup` or `OutlineGroup`
- Thread row: title + status dot (green if session.status == "running"|"ready", gray otherwise)
- Badge for `hasPendingApprovals` or `hasPendingUserInput` (orange dot or SF symbol)
- Clicking a thread → set `selectedThreadId` → `ThreadDetailStore.open(...)`

**Thread detail** (`ThreadDetailView`):
- `ScrollView` with messages + activities interleaved, sorted by `createdAt`
- `OrchestrationMessage`:
  - `role == "user"` → right-aligned bubble (blue, like iMessage)
  - `role == "assistant"` → left-aligned, plain text; if `streaming == true` show a pulsing cursor at end
- `OrchestrationThreadActivity`:
  - Compact row: icon by `tone` (info=ℹ️ circle, tool=wrench, approval=checkmark, error=⚠️)
  - Show `summary` text; `payload` is opaque in M2 (don't render internals)
  - Can be collapsed
- Empty state when no thread selected

**Liquid Glass / UI conventions** (same as M1):
- `.trifectaSurface()` on all surfaces
- Use `Color(.systemGray)` not `.gray` on macOS (`.gray` is not the system gray)
- All stores `@MainActor @Observable`, injected via `.environment(...)`

---

## Build & run

```bash
cd /Users/preetham/projects/trifecta/trifecta-macos-swift

# Build everything (must stay clean)
swift build

# Run the app
swift run TrifectaApp

# Regression check — M0 conformance (needs a live server + fresh pairing URL)
.build/debug/TrifectaConformance "http://<host>:<port>/pair#token=<TOKEN>"
```

---

## Reference files in `trifecta-desktop/`

- `packages/contracts/src/orchestration.ts` — source of truth for all types
  - `OrchestrationMessage` `:216`, `OrchestrationThread` `:333`
  - `OrchestrationThreadActivity` `:302`, `OrchestrationSession` `:260`
  - `OrchestrationThreadStreamItem` `:1103`, `OrchestrationEvent` union `:980-1100`
  - Event payload types (`.message-sent` `:880`, `.activity-appended` `:1097`)
- `apps/web/src/store.ts` — Zustand store patterns; snapshot+incremental reducer logic
- `apps/web/src/orchestrationEventEffects.ts` — per-event-type reducers (port nearly line-for-line)
- `apps/web/src/routes/` + `apps/web/src/components/` — UI inventory reference

---

## What M3 looks like (don't build it yet — just FYI)

M3 is the conversation loop: composer (send message, model picker, runtime/interaction mode),
streaming assistant deltas, interrupt, approval prompts (`thread.approval.respond`),
user-input prompts (`thread.user-input.respond`). RPC surface: `dispatchCommand`.
The `OrchestrationThread.latestTurn` and `session.status` fields you decode in M2
drive the M3 UI state machine.
