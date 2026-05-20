# Trifecta for iOS

Native iOS and iPadOS client for the Trifecta coding-agent platform. Chat with your AI coding agent, watch it work, review and approve actions, drive Git, and open an SSH terminal — all from your iPhone or iPad.

Pairs with a Trifecta Desktop server (and the [T3 Code by Theo (t3.gg)](https://t3.gg) server it builds on).

## Features

- **Chat** — Start and continue coding threads with full streaming output, markdown, reasoning ("thinking") blocks, and inline Mermaid diagrams
- **Threads & projects** — Browse from a glass sidebar, organize by project, search, and archive completed work
- **Approvals** — Accept, decline, or session-approve command, file-read, and file-change requests as the agent runs
- **Proposed plans** — Review an agent's plan and kick off a new turn to implement it
- **Git Lite** — Pull, commit, and push from the thread, with status and inline diffs
- **SSH terminal** — Open a real terminal to hosts your server can reach, with host-key approval and a touch key bar (when the server enables SSH)
- **Model picker** — Pick any provider/model configured on your server, with search and favorites
- **Image attachments** — Snap or pick a photo and attach it to a message
- **Multi-server profiles** — Save, switch, rename, and remove servers
- **Tailored look** — Light/dark/system, six accent colors, a 14-color user-bubble palette, transcript density, and composer height — with haptics and Liquid Glass throughout

## Requirements

- iOS / iPadOS 18.0+
- Xcode 16+
- A Trifecta Desktop (or T3 Code) server to pair with

## Project structure

```
trifecta-ios/
├── Trifecta.xcodeproj/
├── Info.plist
└── Trifecta/
    ├── TrifectaApp.swift              # @main entry point
    ├── App/
    │   ├── AppRoot.swift              # Routes between setup and main UI
    │   ├── SidebarRootView.swift      # Glass sidebar drawer + home shell
    │   ├── MainTabView.swift          # Legacy tab shell
    │   ├── AppEnvironment.swift       # Global session & connection state
    │   └── AppPreferences.swift       # Appearance, accent, density enums
    ├── Core/
    │   ├── Models/                    # Thread, Message, Activity, ServerEvent,
    │   │                              #   ServerConfig, SshSession, ModelSelection…
    │   ├── Networking/
    │   │   ├── T3Connection.swift     # WebSocket lifecycle + reconnect (actor)
    │   │   ├── T3Client.swift         # RPC request/response matching (actor)
    │   │   ├── EffectRPC.swift        # Wire-format encoder/decoder
    │   │   ├── SshClient.swift        # SSH session RPC client
    │   │   └── Auth/                  # PairingFlow + KeychainStore
    │   └── Stores/                    # ThreadListStore, ThreadStore
    ├── DesignSystem/
    │   ├── T3Color/Typography/Spacing/Style.swift
    │   ├── T3AdaptiveGlass.swift      # Liquid Glass helpers
    │   ├── HapticFeedback.swift
    │   └── Components/                # MessageBubble, MarkdownText, ModelCatalogPicker,
    │                                  #   ProviderIcon, ConnectionPill, StreamingDots…
    └── Features/
        ├── Connection/                # Pairing & server setup
        ├── Sidebar/                   # Sidebar panel + thread rows
        ├── Threads/                   # List, archived, new thread
        ├── Thread/                    # Timeline, composer, activity, git, plans,
        │                              #   thinking & Mermaid blocks, approval cards
        ├── SSH/                       # Terminal view, key bar, terminal bridge
        └── Settings/                  # Appearance, profiles, providers, sign out
```

## Architecture

### State

All state uses Swift's `@Observable` macro — no `ObservableObject` or Combine.

| Layer | Component | Responsibility |
|---|---|---|
| Global session | `AppEnvironment` | Connection, client, server config, saved profiles |
| Thread list | `ThreadListStore` | Projects, thread shells, live shell stream |
| Thread detail | `ThreadStore` | Messages, activity, approvals, plans |
| Preferences | `@AppStorage` | Appearance, accent, bubble color, density, composer size |
| Secrets | `KeychainStore` | Bearer tokens and server URLs |

### Networking

A single long-lived WebSocket carries everything.

- **Connection** — `T3Connection` actor manages the `URLSessionWebSocketTask`, a 5s ping/pong heartbeat, and exponential-backoff reconnect
- **RPC** — `T3Client` actor maps requests to continuations and demuxes inbound messages
- **Wire format** — Effect-style JSON envelopes: `Request`, `Chunk`, `Exit`, `Defect`, `Ping`, `Pong`, `Ack`
- **Streaming** — Two topics that re-subscribe on reconnect: `orchestration.subscribeShell` (projects + threads) and `orchestration.subscribeThread` (thread detail + events)

### Auth flow

1. The desktop app emits a pairing URL
2. The app fetches `/.well-known/belweave/environment`
3. `POST /api/auth/bootstrap/bearer` exchanges the credential for a bearer token
4. The bearer token is stored in the Keychain (`kSecClassGenericPassword`)
5. Before each connect, a fresh `wsToken` is minted via `POST /api/auth/ws-token`
6. The WebSocket opens at `wss://<host>/ws?wsToken=…`

On launch, if a bearer token and server URL are present, the app reconnects automatically.

## Building

### Xcode

Open `Trifecta.xcodeproj`, select the **Trifecta** scheme and an iOS 18 destination, then **Run**. Swift Package Manager resolves dependencies on first build.

### Command line

```bash
xcodebuild -project "trifecta-ios/Trifecta.xcodeproj" \
  -scheme "Trifecta" -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
```

## Preferences

| Preference | Options | Default |
|---|---|---|
| Appearance | system, light, dark | system |
| Accent | blue, violet, green, orange, rose, teal | blue |
| User bubble | accent + 13 named colors | accent |
| Transcript density | compact, comfortable, spacious | comfortable |
| Composer height | compact, comfortable, expanded | comfortable |

## Permissions

- **Photo Library** — attaching images to messages
- **Local Network** — reaching desktop servers on LAN or Tailscale
- **Arbitrary Loads** — allows HTTP/ws to non-public servers

## Dependencies

- **Apple frameworks** — SwiftUI, Foundation, Security (Keychain), PhotosUI, UIKit
- **[SwiftTerm](https://github.com/migueldeicaza/SwiftTerm)** — terminal emulation for the SSH feature

## License

Copyright © Belweave. All rights reserved.
