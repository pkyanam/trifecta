# Trifecta for Android

Native Android client for the Trifecta coding agent platform. Chat with your AI coding assistant, review changes, approve actions, and manage development threads from your Android phone or tablet.

This app is also designed to be compatible with the official T3 Code desktop server.

## Features

- **Chat with your agent** — Start and continue coding conversations with full context
- **Thread management** — Organize work by project, archive completed threads
- **Approvals on the go** — Accept, decline, or session-approve command, file-read, and file-change requests
- **Git Lite** — Pull, commit, and push from your phone with inline diffs and status
- **Model picker** — Choose from any provider/model configured on your desktop server
- **Image attachments** — Select photos from your gallery and attach them to messages
- **Multi-server support** — Save and switch between multiple Trifecta desktop servers
- **Adaptive UI** — Full support for light/dark mode, customizable accent colors, and density settings

## Requirements

- Android 8.0+ (API 26)
- Android Studio Ladybug or newer
- JDK 17
- A Trifecta desktop server to pair with

## Project Structure

```
trifecta-android/
├── app/
│   ├── build.gradle.kts              # App module build config
│   └── src/main/java/com/belweave/trifecta/
│       ├── TrifectaApp.kt            # Application singleton bootstrap
│       ├── MainActivity.kt           # Compose entry point + navigation
│       ├── core/
│       │   ├── env/
│       │   │   └── AppEnvironment.kt # Global session, connection, profiles
│       │   ├── models/               # Thread, Message, ServerEvent, Activity, VCS, etc.
│       │   ├── networking/           # WebSocket, RPC, connection state
│       │   │   ├── T3Connection.kt   # OkHttp WebSocket lifecycle
│       │   │   ├── T3Client.kt       # RPC request/response matching
│       │   │   ├── EffectRpc.kt      # Wire format encoder/decoder
│       │   │   └── T3Error.kt        # Error types
│       │   ├── auth/                 # Pairing flow and encrypted storage
│       │   │   ├── PairingFlow.kt    # URL parsing and token exchange
│       │   │   └── KeychainStore.kt  # EncryptedSharedPreferences wrapper
│       │   ├── preferences/          # DataStore preferences + saved profiles
│       │   ├── stores/               # StateFlow-based state containers
│       │   │   ├── ThreadListStore.kt
│       │   │   └── ThreadStore.kt
│       │   └── util/                 # RelativeTime, JsonHelpers, etc.
│       ├── designsystem/             # Theme, tokens, and shared components
│       │   ├── T3Theme.kt            # Material3 theme with custom colors
│       │   ├── T3Color.kt            # Semantic color tokens
│       │   ├── T3Typography.kt       # Type scale
│       │   ├── T3Spacing.kt          # Spacing and radius tokens
│       │   ├── T3Style.kt            # Reusable primitives
│       │   ├── MarkdownText.kt       # Markdown renderer
│       │   ├── MessageBubble.kt      # Chat bubble component
│       │   └── StreamingDots.kt      # Typing animation
│       └── features/                 # Screen-level UI
│           ├── connection/           # Pairing and server setup
│           ├── threads/              # Thread list
│           ├── thread/               # Chat timeline, composer, activity, git
│           ├── newthread/            # New thread creation
│           └── settings/             # Appearance, accent, profiles, sign out
├── build.gradle.kts                  # Root build config
├── settings.gradle.kts               # Project settings
└── gradle/libs.versions.toml         # Version catalog
```

## Architecture

### State Management

All UI state is driven by Kotlin `StateFlow` inside ViewModels:

| Layer | Component | Responsibility |
|---|---|---|
| **Global Session** | `AppEnvironment` | Connection, client, server config, profiles |
| **Thread List** | `ThreadListStore` | Projects, thread shells, live shell stream |
| **Thread Detail** | `ThreadViewModel` | Messages, activity, approvals, plans |
| **Preferences** | `AppPreferencesStore` | DataStore-backed appearance, accent, density |
| **Secrets** | `KeychainStore` | AES256-GCM encrypted tokens and URLs |

### Networking

A single long-lived OkHttp WebSocket carries all communication:

- **Connection** — `T3Connection` manages OkHttp WebSocket, heartbeat (5s ping/pong), and exponential backoff reconnect
- **RPC** — `T3Client` maps requests to coroutine continuations and demuxes inbound messages
- **Wire format** — Custom Effect-style JSON envelopes: `Request`, `StreamRequest`, `Chunk`, `Exit`, `Defect`, `Ping`, `Pong`, `Ack`
- **Streaming** — Two subscription topics auto-resubscribe on reconnect: `orchestration.subscribeShell` and `orchestration.subscribeThread`

### Auth Flow

1. Desktop app emits a pairing URL
2. Android parses the URL (also supports `trifecta://` deep links)
3. GET `/.well-known/t3/environment` for server info
4. POST `/api/auth/bootstrap/bearer` exchanges credential for bearer token
5. Bearer token saved to `EncryptedSharedPreferences`
6. Fresh `wsToken` minted before every WebSocket connect
7. WebSocket opens at `wss://<host>/ws?wsToken=...`

On app launch, saved credentials trigger automatic reconnect.

## Building

### Android Studio

1. Open the `trifecta-android` folder in Android Studio
2. Sync project with Gradle files
3. Select the `app` run configuration
4. Choose an emulator or connected device
5. Click **Run**

### Command Line

```bash
cd trifecta-android
./gradlew :app:assembleDebug
```

The APK will be at `app/build/outputs/apk/debug/app-debug.apk`.

For release:

```bash
./gradlew :app:assembleRelease
```

## Key Dependencies

| Dependency | Purpose |
|---|---|
| Jetpack Compose (BOM) | Declarative UI |
| Material3 | Material Design components |
| OkHttp | WebSocket and HTTP client |
| Kotlinx Serialization | JSON encoding/decoding |
| Kotlinx Coroutines | Async programming |
| Security Crypto | EncryptedSharedPreferences |
| DataStore Preferences | Type-safe preferences |
| Coil | Image loading and caching |
| Navigation Compose | In-app navigation |

## Key Behaviors

- **Resume on launch** — Automatically reconnects if credentials are saved
- **Reconnect** — Exponential backoff with jitter; connection pill shows status
- **Auto-scroll** — Timeline scrolls to bottom as new messages arrive
- **Optimistic model selection** — Local UI updates immediately, reconciles with server echo
- **Git Lite** — Pull, commit, push only enable when meaningful; confirmations for network actions
- **Multi-server profiles** — Save, switch, rename, and delete servers with confirmation
- **Deep links** — `trifecta://` scheme for pairing URL ingestion

## User Preferences

| Preference | Options | Default |
|---|---|---|
| Appearance | system, light, dark | system |
| Accent | blue, violet, green, orange | blue |
| Transcript density | compact, comfortable | comfortable |
| Composer size | compact, comfortable, expanded | comfortable |

## Permissions

- **Internet** — WebSocket and API communication
- **Network State** — Connection status detection
- **Read Media Images** — Photo gallery access for attachments
- **Cleartext Traffic** — Allows HTTP/ws for local servers

## Testing

Manual smoke tests:

1. Pair with a fresh server; confirm reconnect after app relaunch
2. Switch saved profiles; confirm tokens stay scoped
3. Trigger an approval; confirm Accept/Decline round-trip
4. Trigger a proposed plan; tap Implement plan; confirm new turn starts
5. Make a change in a worktree; pull, commit, push from the git sheet
6. Archive and unarchive a thread; confirm live stream updates

## Contributing

- Target JVM 17, Kotlin 2.2+
- Use Compose + `StateFlow` + ViewModel for UI layers
- Prefer `suspend` functions and coroutines over callbacks
- Match iOS design system tokens for visual consistency
- Run `./gradlew :app:lintDebug` before submitting changes

## License

Copyright (c) Belweave. All rights reserved.
