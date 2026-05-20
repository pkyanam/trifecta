# Trifecta for Android

Native Android client for the Trifecta coding-agent platform. Chat with your AI coding agent, watch it work, review and approve actions, drive Git, and open an SSH terminal — all from your Android phone or tablet.

Pairs with a Trifecta Desktop server (and the [T3 Code by Theo (t3.gg)](https://t3.gg) server it builds on).

## Features

- **Chat** — Start and continue coding threads with streaming output and markdown
- **Threads & projects** — Organize by project and archive completed work
- **Approvals** — Accept, decline, or session-approve command, file-read, and file-change requests
- **Proposed plans** — Review an agent's plan and start a turn to implement it
- **Git Lite** — Pull, commit, and push from the thread, with status and inline diffs
- **SSH terminal** — Open a terminal to hosts your server can reach (when the server enables SSH)
- **Model picker** — A provider rail + model list with favorites, recents, and colored provider badges; pick any model your server has configured
- **Image attachments** — Attach photos from your gallery
- **Multi-server profiles** — Save, switch, rename, and remove servers; pair via QR or `trifecta://` deep links
- **Tailored look** — Light/dark/system, four accent colors, transcript density, and composer height, with Material 3 and a Liquid-Glass-inspired design

## Requirements

- Android 8.0+ (API 26)
- Android Studio (latest stable) + JDK 17
- A Trifecta Desktop (or T3 Code) server to pair with

## Project structure

```
trifecta-android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/java/com/belweave/trifecta/
│       ├── TrifectaApp.kt              # Application bootstrap
│       ├── MainActivity.kt             # Compose entry point + navigation
│       ├── core/
│       │   ├── env/AppEnvironment.kt   # Global session, connection, profiles
│       │   ├── models/                 # Thread, Message, Activity, ServerConfig,
│       │   │                           #   ServerEvent, SshSession, ModelSelection…
│       │   ├── networking/             # T3Connection, T3Client, EffectRpc,
│       │   │                           #   SshClient, UploadImage, ConnectionState
│       │   ├── auth/                   # PairingFlow + KeychainStore
│       │   ├── preferences/            # DataStore prefs + saved profiles
│       │   ├── stores/                 # ThreadListStore, ThreadStore (shared state)
│       │   └── util/                   # RelativeTime, helpers
│       ├── designsystem/               # T3Theme/Color/Typography/Spacing/Style,
│       │   │                           #   T3AdaptiveGlass, MarkdownText, MessageBubble
│       │   └── AppPreferences.kt       # Appearance, accent, density enums
│       └── features/
│           ├── connection/             # Pairing & server setup (+ ViewModel)
│           ├── threads/                # Thread list (+ ViewModel)
│           ├── thread/                 # Timeline, composer, activity, model picker,
│           │                           #   header (+ ThreadViewModel)
│           ├── newthread/              # New thread creation (+ ViewModel)
│           ├── ssh/                    # SSH terminal screen
│           └── settings/               # Appearance, profiles, providers (+ ViewModel)
├── build.gradle.kts
├── settings.gradle.kts
└── gradle/libs.versions.toml           # Version catalog
```

## Architecture

### State

UI state is driven by Kotlin `StateFlow`. Per-screen `ViewModel`s expose state; shared session data lives in stores held by `AppEnvironment`.

| Layer | Component | Responsibility |
|---|---|---|
| Global session | `AppEnvironment` | Connection, client, server config, profiles |
| Thread list | `ThreadListStore` | Projects, thread shells, live shell stream |
| Thread detail | `ThreadStore` / `ThreadViewModel` | Messages, activity, approvals, plans |
| Preferences | `AppPreferencesStore` | DataStore-backed appearance, accent, density |
| Secrets | `KeychainStore` | AES256-GCM `EncryptedSharedPreferences` for tokens + URLs |

### Networking

A single long-lived OkHttp WebSocket carries everything.

- **Connection** — `T3Connection` manages the OkHttp WebSocket, a 5s ping/pong heartbeat, and exponential-backoff reconnect
- **RPC** — `T3Client` maps requests to coroutine continuations and demuxes inbound messages
- **Wire format** — Effect-style JSON envelopes: `Request`, `StreamRequest`, `Chunk`, `Exit`, `Defect`, `Ping`, `Pong`, `Ack`
- **Streaming** — `orchestration.subscribeShell` and `orchestration.subscribeThread`, both re-subscribed on reconnect

### Auth flow

1. The desktop app emits a pairing URL (also handled as a `trifecta://` deep link)
2. The app reads `/.well-known/belweave/environment`
3. `POST /api/auth/bootstrap/bearer` exchanges the credential for a bearer token
4. The token is stored in `EncryptedSharedPreferences`
5. A fresh `wsToken` is minted before each connect; the WebSocket opens at `wss://<host>/ws?wsToken=…`

Saved credentials trigger automatic reconnect on launch.

## Building

```bash
cd trifecta-android
./gradlew :app:assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:assembleRelease    # signed release (needs keystore in local.properties)
```

Or open the `trifecta-android` folder in Android Studio, sync Gradle, and run the `app` configuration.

## Build config & dependencies

`compileSdk 36` · `minSdk 26` · `targetSdk 36` · JVM 17 · Kotlin 2.2+

| Dependency | Purpose |
|---|---|
| Jetpack Compose (BOM) + Material 3 | Declarative UI |
| Navigation Compose | In-app navigation |
| Kotlinx Coroutines | Async |
| Kotlinx Serialization | JSON |
| OkHttp | WebSocket + HTTP |
| AndroidX Security Crypto | `EncryptedSharedPreferences` |
| DataStore Preferences | Type-safe preferences |
| Coil | Image loading |

## Preferences

| Preference | Options | Default |
|---|---|---|
| Appearance | system, light, dark | system |
| Accent | blue, violet, green, orange | blue |
| Transcript density | compact, comfortable | comfortable |
| Composer height | compact, comfortable, expanded | comfortable |

## Permissions

- **Internet** / **Network State** — WebSocket + API communication
- **Read Media Images** — gallery access for attachments
- **Cleartext Traffic** — allows HTTP/ws for local servers

## Contributing

- Target JVM 17, Kotlin 2.2+
- Compose + `StateFlow` + `ViewModel` for UI; prefer `suspend` functions over callbacks
- Match the iOS design-system tokens for visual consistency
- Run `./gradlew :app:lintDebug` before submitting

## License

Copyright © Belweave. All rights reserved.
