# Trifecta for iOS

Native iOS client for the Trifecta coding agent platform. Chat with your AI coding assistant, review changes, approve actions, and manage development threads from your iPhone or iPad.

**Compatible with both Trifecta Desktop and the official <a href="https://t3.gg">T3 Code by Theo (t3.gg)</a> desktop server.**


## Features

- **Chat with your agent** — Start and continue coding conversations with full context
- **Thread management** — Organize work by project, archive completed threads, search and sort
- **Approvals on the go** — Accept, decline, or session-approve command, file-read, and file-change requests
- **Git Lite** — Pull, commit, and push from your phone with inline diffs and status
- **Model picker** — Choose from any provider/model configured on your desktop server
- **Image attachments** — Snap a photo and attach it to any message
- **Multi-server support** — Save and switch between multiple Trifecta desktop servers
- **Adaptive UI** — Full support for light/dark mode, customizable accent colors, and density settings

## Requirements

- iOS 18.0+
- Xcode 16+
- Swift 5.10+
- A Trifecta Desktop or <a href="https://t3.gg">T3 Code by Theo (t3.gg)</a> desktop server to pair with

## Project Structure

```
trifecta-ios/
├── Trifecta.xcodeproj/                 # Xcode project
├── Info.plist                          # Bundle metadata and permissions
├── PrivacyInfo.xcprivacy               # Required API declarations
└── Trifecta/                           # Sources
    ├── TrifectaApp.swift               # @main entry point
    ├── Assets.xcassets/                # App icon and accent color
    ├── App/                            # Root routing, environment, tabs
    │   ├── AppRoot.swift               # Routes between setup and main UI
    │   ├── MainTabView.swift           # Chat + Settings tabs
    │   ├── AppEnvironment.swift        # Global session and connection state
    │   └── AppPreferences.swift        # UI helpers and keyboard dismissal
    ├── Core/                           # Business logic
    │   ├── Models/                     # Thread, Message, ServerEvent, VCS, etc.
    │   ├── Networking/                 # WebSocket, RPC client, auth
    │   │   ├── T3Connection.swift      # WebSocket lifecycle and reconnect
    │   │   ├── T3Client.swift          # RPC request/response matching
    │   │   ├── EffectRPC.swift         # Wire format encoder/decoder
    │   │   └── Auth/                   # Pairing flow and Keychain storage
    │   └── Stores/                     # Observable state containers
    │       ├── ThreadListStore.swift   # Project + thread list state
    │       └── ThreadStore.swift       # Individual thread detail state
    ├── DesignSystem/                   # UI tokens and components
    │   ├── T3Color.swift               # Semantic color tokens (light/dark)
    │   ├── T3Typography.swift          # Type scale with DM Sans
    │   ├── T3Spacing.swift             # Spacing and radius tokens
    │   ├── T3Style.swift               # Reusable primitives (Card, Pill, etc.)
    │   └── Components/                 # Shared UI components
    │       ├── MessageBubble.swift     # Chat bubble with markdown
    │       ├── MarkdownText.swift      # Markdown renderer
    │       ├── ModelPickerSheet.swift  # Provider → model picker
    │       ├── ConnectionPill.swift    # Connection status indicator
    │       └── StreamingDots.swift     # Typing animation
    └── Features/                       # Screen-level UI
        ├── Connection/                 # Pairing and server setup
        ├── Threads/                    # Thread list, archived threads, new thread
        ├── Thread/                     # Chat timeline, composer, activity, git
        └── Settings/                   # Appearance, profiles, sign out
```

## Architecture

### State Management

All state uses Swift's `@Observable` macro (no `ObservableObject` or Combine):

| Layer | Component | Responsibility |
|---|---|---|
| **Global Session** | `AppEnvironment` | Connection, client, server config, profiles |
| **Thread List** | `ThreadListStore` | Projects, thread shells, live shell stream |
| **Thread Detail** | `ThreadStore` | Messages, activity, approvals, plans |
| **Preferences** | `@AppStorage` | Appearance, accent, density, composer size |
| **Secrets** | `KeychainStore` | Bearer tokens and server URLs |

### Networking

A single long-lived WebSocket carries all communication:

- **Connection** — `T3Connection` actor manages `URLSessionWebSocketTask`, heartbeat (5s ping/pong), and exponential backoff reconnect
- **RPC** — `T3Client` actor maps requests to continuations and demuxes inbound messages
- **Wire format** — Custom Effect-style JSON envelopes: `Request`, `Chunk`, `Exit`, `Defect`, `Ping`, `Pong`, `Ack`
- **Streaming** — Two subscription topics: `orchestration.subscribeShell` (projects + threads) and `orchestration.subscribeThread` (thread detail + events)

### Auth Flow

1. Desktop app emits a pairing URL
2. iOS parses the URL and fetches `/.well-known/t3/environment`
3. POST `/api/auth/bootstrap/bearer` exchanges the credential for a bearer token
4. Bearer token is saved to Keychain (`kSecClassGenericPassword`)
5. On every WebSocket connect, a fresh `wsToken` is minted via `POST /api/auth/ws-token`
6. WebSocket opens with `wss://<host>/ws?wsToken=...`

On app launch, if a bearer token and server URL exist in Keychain, the app reconnects automatically.

## Building

### Xcode

1. Open `Trifecta.xcodeproj`
2. Select the **Trifecta** scheme
3. Choose a destination (iOS 18 simulator or device)
4. Press **Run**

### Command Line

```bash
# Simulator build
xcodebuild -project "trifecta-ios/Trifecta.xcodeproj" \
  -scheme "Trifecta" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  build

# Device build (requires signing)
xcodebuild -project "trifecta-ios/Trifecta.xcodeproj" \
  -scheme "Trifecta" \
  -configuration Debug \
  -sdk iphoneos \
  -destination "id=<DEVICE_UDID>" \
  -allowProvisioningUpdates \
  build
```

## Key Behaviors

- **Resume on launch** — Automatically reconnects if credentials are saved
- **Reconnect** — Exponential backoff with jitter on disconnect; connection pill shows status
- **Auto-scroll** — Timeline scrolls to bottom as new messages arrive
- **Optimistic model selection** — Local UI updates immediately, reconciles with server echo
- **Git Lite** — Pull, commit, and push only enable when meaningful; confirmations for network actions
- **Multi-server profiles** — Save multiple servers, switch, rename, and delete with confirmation

## User Preferences

| Preference | Options | Default |
|---|---|---|
| Appearance | system, light, dark | system |
| Accent | blue, violet, green, orange | blue |
| Transcript density | compact, comfortable | comfortable |
| Composer size | compact, comfortable, expanded | comfortable |

## Permissions

- **Photo Library** — For attaching images to messages
- **Local Network** — For connecting to desktop servers on LAN or Tailscale
- **Arbitrary Loads** — Allows HTTP/ws connections to non-public servers

## Dependencies

None. The app uses only Apple frameworks:

- `SwiftUI` — UI layer
- `Foundation` — Networking, JSON, concurrency
- `Security` — Keychain access
- `PhotosUI` — Image picker
- `UIKit` — Keyboard dismissal shim

## Testing

Manual smoke tests:

1. Pair with a fresh server; confirm reconnect after app relaunch
2. Switch saved profiles; confirm bearer tokens stay scoped
3. Trigger an approval; confirm Accept/Decline round-trip
4. Trigger a proposed plan; tap Implement plan; confirm new turn starts
5. Make a change in a worktree; pull, commit, push from the git sheet
6. Archive and unarchive a thread; confirm live stream updates

## License

Copyright (c) Belweave. All rights reserved.
