# PLAN — Port T3 Code remote-control work into Trifecta + consolidate mobile onto React Native

> Status: **planning only**. No Trifecta source is modified by this document. This is the
> roadmap for two related efforts:
>
> 1. **Workstream A** — bring the new remote-control / review / terminal-streaming functionality
>    from the `t3code/mobile-remote-connect` branch into Trifecta **without merging**, rebranded
>    and refactored to fit Trifecta Desktop (not a file copy, and extended where it makes sense).
> 2. **Workstream B** — collapse the two native apps (`trifecta-ios` SwiftUI, `trifecta-android`
>    Kotlin) into a **single React Native + Expo** mobile codebase that shares Trifecta's TypeScript
>    runtime with the web app.

Reference clone: `_reference/t3code-remote-control/` (branch `t3code/mobile-remote-connect`, gitignored).
Diff base used throughout: merge-base `d1e85c4e` against `origin/main` → the branch's 50 commits
**are** the new work (T3 Code `main` is stale).

---

## 0. Non-negotiables / guardrails

- **No git merge** from `t3tools/t3code`. The forks diverged too far; we cherry-pick *capabilities*,
  not commits.
- **Preserve Belweave/Trifecta branding.** Trifecta is already `@belweave/*` with a
  `DesktopAppBranding` contract and `apps/web/src/branding.ts`. Nothing `@t3tools`, `t3.codes`,
  `com.t3tools.*`, `T3Client`, `~/.t3`, or `t3 serve` ships into Trifecta.
- **Refactor, don't copy.** Port behavior file-by-file by *reconciling against Trifecta's existing
  shapes*, never by overwriting a Trifecta file with a T3 file.
- **Extend, don't just match.** Where Trifecta already has a richer surface (e.g. SSH client,
  saved environments, accents/themes), the ported code conforms to Trifecta's model and adds the
  new capability on top.
- This document is the deliverable for now — implementation happens in later, separately-approved
  passes.

---

## 1. Current-state inventory (what already exists vs. what is genuinely new)

The single most important finding: **Trifecta already has remote control.** Pairing, WebSocket RPC,
saved environments, hosted pairing, and SSH launch already work across web + iOS + Android. So this
is **not** a "build remote control" project — it is a "port the *new* capabilities + de-duplicate
the client" project.

### What Trifecta already has

| Capability | Where it lives in Trifecta |
|---|---|
| Server: pairing tokens, sessions, `serve` | `trifecta-desktop/apps/server/src/auth/`, `bin.ts`, `serverRuntimeStartup.ts` |
| Server: VCS naming (git→vcs already done server-side) | `trifecta-desktop/apps/server/src/vcs/` (`GitVcsDriver`, `VcsDriver`, …) |
| Web: WS RPC client (un-extracted, lives in the app) | `trifecta-desktop/apps/web/src/rpc/wsTransport.ts`, `environments/{runtime,remote}/` |
| Web: hosted pairing, saved environments, branding | `apps/web/src/hostedPairing.ts`, `pairingUrl.ts`, `branding.ts` |
| Native iOS remote client (SwiftUI, 64 files) | `trifecta-ios/Trifecta/Core/Networking/` (`T3Client`, `EffectRPC`, `PairingFlow`, `KeychainStore`), `Features/{Connection,SSH,Threads,Thread,Sidebar,Settings}` |
| Native Android remote client (Kotlin, 56 files) | `trifecta-android/.../core/networking/`, `features/{connection,ssh,threads,thread,newthread,settings}` |
| Shared package skeleton | `@belweave/client-runtime` (only `knownEnvironment`, `advertisedEndpoint`, `sourceControlDiscoveryState`, `scoped`) |

### What the branch adds that Trifecta does NOT have (confirmed absent)

| New capability | Source on branch | Trifecta status |
|---|---|---|
| `review.getDiffPreview` RPC + `ReviewService` | `apps/server/src/review/ReviewService.ts`, `packages/contracts/src/review.ts` | **Absent** |
| `terminal.attach` streaming RPC (replays buffer on attach) | `apps/server/src/ws.ts`, `packages/contracts/src/terminal.ts` | **Absent** |
| `subscribeTerminalMetadata` streaming RPC | `apps/server/src/ws.ts`, `contracts/src/terminal.ts` | **Absent** |
| WS robustness: intentional-close + heartbeat freshness | `client-runtime/src/wsRpcProtocol.ts`, `wsTransport.ts` | Partial — verify |
| **Shared client-runtime extraction** (transport + ~30 state reducers) | `packages/client-runtime/src/*` (45 files) | **Not extracted** (web owns its own copy) |
| Client-side VCS state set | `client-runtime/src/{vcsRefState,vcsStatusState,vcsActionState}.ts` | **Absent** |
| RN/Expo mobile app + 2 native modules | `apps/mobile/` (libghostty terminal `t3-terminal`, native diff `t3-review-diff`) | N/A (Trifecta is native) |

### Contracts divergence is small (good news)

Both contract packages have **33 files**; the only filename difference is `review.ts`. Divergence is
therefore *intra-file* (added schemas in `terminal.ts`/`rpc.ts`), not structural. Port = surgical
additions, **not** a contracts rewrite.

---

## 2. Strategic thesis (why A and B are one project)

Today Trifecta maintains the remote client **three times**: TypeScript (web), Swift (iOS), Kotlin
(Android). Every new server RPC must be implemented three times. The branch demonstrates the better
shape: **one `client-runtime` TypeScript package consumed by both web and a React Native app**, with
only thin per-platform *native modules* (terminal renderer, diff renderer).

So the workstreams compound:

```
Extract @belweave/client-runtime (web stops owning the WS client)
        │
        ├── Web re-points at the shared runtime  (Workstream A payoff)
        │
        └── RN/Expo mobile consumes the SAME runtime  (Workstream B foundation)
                    │
                    └── Retire trifecta-ios + trifecta-android  (3 clients → 1.5)
```

Recommendation: **do the `client-runtime` extraction first** — it is the keystone for both
workstreams and de-risks the RN effort before a single screen is built.

---

## 3. Branding / rebrand token map

Apply mechanically to anything ported from the branch. Nothing in the left column ships.

| T3 token | Trifecta replacement |
|---|---|
| `@t3tools/{contracts,shared,client-runtime}` | `@belweave/{contracts,shared,client-runtime}` |
| `@t3tools/mobile` | `@belweave/mobile` |
| `T3Client`, `T3Connection`, `T3Error` (class/type names) | `TrifectaClient`, `TrifectaConnection`, `TrifectaError` (and align with existing native names) |
| `t3 serve`, `npx t3` (CLI/docs) | Trifecta CLI name (confirm published bin) |
| `app.t3.codes`, `u.expo.dev/<t3 id>` | Trifecta hosted domain + new Expo/EAS project |
| `com.t3tools.t3code[.dev/.preview]` | `com.belweave.trifecta[.dev/.preview]` |
| scheme `t3code` | `trifecta` |
| `~/.t3/ssh-launch` | Trifecta's existing dotdir (confirm in `apps/server/src/ssh/`) |
| `NSLocalNetworkUsageDescription` "T3 Code …" | Trifecta-worded copy |
| App display name "T3 Code" / icons / splash | Trifecta assets (`trifectaAppLogo.png`, existing `Assets.xcassets`) |

**Do NOT copy:** T3 marketing pages, T3 icon/splash assets, `REMOTE.md` verbatim (Trifecta already
has its own `REMOTE.md`), `app.config.ts` wholesale, EAS project IDs, or any `t3.codes` URL.

> Note: Trifecta's *own* native code still uses residual `T3Client`/`T3Connection` class names even
> though the package is `com.belweave.trifecta`. Treat full rename as a cleanup opportunity, tracked
> but **out of scope** for these workstreams (and mostly mooted by Workstream B retiring that code).

---

## 4. Workstream A — Port the new remote functionality

Sequence is dependency-ordered. Each phase reconciles against Trifecta files; never overwrite.

### A1 — Contracts (smallest, do first)
- Add `packages/contracts/src/review.ts` (`ReviewDiffPreviewInput/Result/Source/Error`,
  `working-tree | branch-range`, diff hashing + truncation). Rebrand imports.
- Add to `terminal.ts`: `TerminalAttachInput`, `TerminalAttachStreamEvent`,
  `TerminalMetadataStreamEvent` — **diff against Trifecta's `terminal.ts`** and add only the deltas.
- Register in `rpc.ts` / `WS_METHODS`: `review.getDiffPreview`, `terminal.attach` (stream),
  `subscribeTerminalMetadata` (stream); export the three `Rpc.make(...)` defs into `WsRpcGroup`.
- Acceptance: `@belweave/contracts` typechecks; web + native build untouched.

### A2 — Server (clean, isolated win)
- Port `apps/server/src/review/ReviewService.ts` (+ test) → wire its layer in `server.ts`
  (`Layer.provideMerge(GitVcsDriver.layer, VcsDriverRegistry…)` — mirror the branch but onto
  Trifecta's existing `VcsLayerLive`).
- Wire RPC handlers in `apps/server/src/ws.ts`:
  - `reviewGetDiffPreview` → `review.getDiffPreview`
  - `terminalAttach` → `Stream.callback` over `terminalManager.attachStream` (replays hydrated
    buffer). **Verify Trifecta's `TerminalManager` exposes/needs `attachStream`**; extend if absent.
  - `subscribeTerminalMetadata` → `Stream.callback` over `terminalManager.subscribeMetadata`.
- Apply WS robustness: intentional-close classification + heartbeat freshness (compare
  `apps/server/src/ws.ts` + `serverRuntimeStartup.ts` against the branch behavior).
- Acceptance: server tests green; new RPCs reachable from `wscat`/integration harness.

### A3 — Extract `@belweave/client-runtime` (the keystone)
This is the largest and highest-leverage step. Two viable routes — **pick before starting**
(see Open Questions): 
- **Route 1 (extract Trifecta's own):** move `apps/web/src/rpc/wsTransport.ts` +
  `environments/runtime/connection.ts` + relevant stores into `@belweave/client-runtime`, then add
  the branch's *new* pieces. Lowest semantic risk (keeps Trifecta's proven client), but more manual.
- **Route 2 (port the branch's runtime):** bring over the branch's 45 `client-runtime` files
  (transport: `wsRpcProtocol/wsTransport/wsRpcClient/reconnectBackoff/transportError`; lifecycle:
  `environmentConnection/environmentRuntimeState`; reducers: `threadDetail*`, `shellSnapshot*`,
  `terminalSessionState`, `archivedThreadsState`, `checkpointDiffState`, `filesystemBrowseState`,
  `composerPathSearchState`, `vcsRefState/vcsStatusState/vcsActionState`; actions: `gitActions`,
  `addProject`, `projectPaths`) and reconcile their contract imports to Trifecta's. Faster to feature
  parity, but must diff every reducer against Trifecta's store assumptions.
- Either way: depends on Effect `RpcClient`/`Socket` (already in Trifecta's catalog,
  `effect 4.0.0-beta.59`).
- Acceptance: package builds + its vitest suite passes in isolation.

### A4 — Web re-point + new UI surfaces
- Repoint `apps/web` from its in-app WS client to `@belweave/client-runtime` (delete the duplicated
  transport once parity is proven by `apps/web` tests).
- Add web UI for the new RPCs as desired (diff-preview surface, terminal attach/metadata) — optional
  for parity, required if web should reach native/mobile feature parity.
- Acceptance: `@belweave/web` tests pass; manual pairing→connect→stream smoke test unchanged.

---

## 5. Workstream B — Native iOS/Android → single React Native + Expo app

Goal: replace `trifecta-ios` (SwiftUI) and `trifecta-android` (Kotlin) with one
`apps/mobile` Expo app named `@belweave/mobile`, consuming `@belweave/client-runtime` from A3.

### B0 — Decision gate (feasibility + parity matrix)
Before committing, confirm there is no native-only feature that RN cannot reach. Build a parity
matrix from the existing native features:

| Feature (native today) | iOS | Android | RN plan |
|---|---|---|---|
| Pairing + QR scan | `Connection/QRScannerView` | `connection/QrScannerScreen` | `expo-camera` |
| Credential storage | `KeychainStore` | (Keystore) | `expo-secure-store` |
| WS RPC client | `EffectRPC.swift` | `EffectRpc.kt` | `@belweave/client-runtime` (TS) |
| SSH launch/connect | `Core/Networking/SshClient` | `core/networking/SshClient` | **Risk** — see below |
| Threads / Thread / Sidebar | `Features/Threads,Thread,Sidebar` | `features/threads,thread` | RN screens + shared reducers |
| Settings | `Features/Settings` | `features/settings` | RN screens |
| Terminal | (native term?) | (native term?) | `t3-terminal`-style libghostty native module |
| Review diff + inline comments | — | — | `t3-review-diff`-style native module |

Open the SSH question explicitly: the branch's SSH launch is a **desktop** feature; on mobile the RN
app connects to already-exposed endpoints. Confirm whether Trifecta's mobile SSH client must survive
the migration or can be dropped in favor of pairing-only.

### B1 — Scaffold `apps/mobile` (Expo) with Trifecta branding
- New Expo app under `trifecta-desktop/apps/mobile` (joins the bun workspace + `turbo.json`).
- Author a **fresh** `app.config.ts` (do not copy T3's): name "Trifecta", scheme `trifecta`,
  bundle/package `com.belweave.trifecta[.dev/.preview]`, new EAS project + Expo updates URL, Trifecta
  icons/splash, Trifecta-worded `NSLocalNetworkUsageDescription`.
- Adopt the branch's stack as the template: Expo SDK 55, RN 0.83, React 19, `expo-router`
  (file-based), `@effect/atom-react`, Shiki, `@pierre/diffs`, `expo-secure-store`, `expo-camera`,
  `expo-haptics`, `react-native-gesture-handler`.
- Reuse the branch's **route tree** as the IA blueprint: `connections/{index,new}`,
  `new/add-project/{repository,destination,local}`, `threads/[environmentId]/[threadId]/{index,
  terminal,review,review-comment,git/*}`.

### B2 — Native modules (build vs. adapt)
Two Expo native modules carry the heavy native work; both are the reusable substance:
- `t3-terminal` → `trifecta-terminal`: libghostty-backed terminal view. Largest native lift; pairs
  with A2's `terminal.attach`/`subscribeTerminalMetadata`.
- `t3-review-diff` → `trifecta-review-diff`: native diff renderer with inline comment selection;
  pairs with A1/A2's `review.getDiffPreview`.
- Decision: adapt the branch's module source (rebranded) vs. rebuild. Adapting is faster but inherits
  T3's native build config — budget time to rebrand Swift/Kotlin/Gradle/podspec identifiers.

### B3 — Feature build-out (parity-driven)
Implement screens against shared reducers from `@belweave/client-runtime`, closing the B0 matrix:
pairing → environment list → threads → thread detail (chat) → terminal → review/diff → git actions →
settings. Each screen reuses a runtime reducer rather than re-deriving state.

### B4 — Cutover & retirement
- Ship RN app to TestFlight / Play internal track under the **existing** Trifecta app records
  (same `com.belweave.trifecta` identifiers → OTA/store continuity; verify signing + Expo `appVersion`
  runtime policy).
- Parity sign-off vs. native, then archive `trifecta-ios/` and `trifecta-android/` (and their native
  `T3Client`/`EffectRpc` code — which also clears the residual T3 naming).
- Update `.gitignore` / CI / release scripts that referenced the native apps.

---

## 6. Recommended sequencing (milestones)

1. **M1 — Contracts (A1).** Lowest risk; unblocks everything. ~small.
2. **M2 — Server RPCs (A2).** ReviewService + terminal streaming + WS robustness. Independent of UI.
3. **M3 — client-runtime extraction (A3).** Keystone. Pick Route 1 vs 2 first.
4. **M4 — Web re-point + optional new surfaces (A4).** Proves the extraction.
5. **M5 — RN scaffold + native modules (B0–B2).** Can start in parallel with M4 once M3 lands.
6. **M6 — RN feature parity (B3).**
7. **M7 — Cutover & native retirement (B4).**

A1/A2 deliver user-visible value (review diff preview, terminal attach) **before** the big RN bet,
so the project produces wins even if B is deferred.

---

## 7. Risks & open questions

- **Route 1 vs Route 2 for A3** — extract Trifecta's proven web client, or port the branch's runtime?
  Decide before M3. (Recommendation: Route 1 for safety unless reducer parity with mobile is the
  priority.)
- **Effect version skew** — branch and Trifecta both target `effect 4.0.0-beta.59`-era APIs; confirm
  exact catalog match before porting `RpcClient`/`Socket` code.
- **`TerminalManager` surface** — does Trifecta's manager already expose `attachStream` /
  `subscribeMetadata`, or must they be added (A2)?
- **SSH on mobile** — keep or drop in the RN app (B0)?
- **libghostty native module** — biggest single unknown; build cost + per-platform build config +
  rebrand. De-risk with an early spike.
- **Store/identity continuity** — RN app must reuse `com.belweave.trifecta` records and signing to
  avoid a fresh app listing; validate before B4.
- **Intra-file contract drift** — even though file lists match, `terminal.ts`/`rpc.ts` must be
  diffed line-by-line, not replaced.

---

## 8. Explicitly out of scope (for now)

- Any change to Trifecta source (this is plan-only).
- Merging git history from `t3tools/t3code`.
- Renaming Trifecta's existing residual `T3Client`/`T3Connection` native classes (mooted by B4).
- T3 marketing site, T3 assets, T3 hosted infrastructure.
- New product features beyond review-diff-preview + terminal attach/metadata unless chosen during A4.

---

### Appendix — key reference paths in the clone

```
_reference/t3code-remote-control/
  packages/contracts/src/review.ts            # new review schemas
  packages/contracts/src/{terminal,rpc}.ts    # terminal attach/metadata + WS_METHODS
  apps/server/src/review/ReviewService.ts      # new server service
  apps/server/src/ws.ts                        # RPC handler wiring (review + terminal streams)
  packages/client-runtime/src/                 # 45 files: transport + lifecycle + reducers
  apps/mobile/                                 # Expo app, routes under src/app/, modules/{t3-terminal,t3-review-diff}
  REMOTE.md                                    # T3's remote docs (reference only; do not copy)
```
