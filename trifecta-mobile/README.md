# Trifecta Mobile

A cross-platform mobile client for the [Trifecta](https://trifecta.belweave.ai) server built with [Expo](https://expo.dev) and [Expo Router](https://docs.expo.dev/router/introduction/). Pairs with a running Trifecta desktop server to access your AI models, projects, and conversations from iOS, Android, and web.

## Features

- **Server pairing** — one-time token exchange stores a persistent session in the device keychain; paste a pairing URL to auto-fill server URL and token
- **WebSocket RPC** — real-time bidirectional connection to the server with exponential-backoff reconnection
- **Multi-provider model picker** — searchable provider rail + model list sourced live from the server config
- **Project & thread management** — real-time subscription to projects and chat threads, sorted by recency
- **Streaming AI chat** — throttled 30fps token rendering, full markdown (code blocks, GFM tables, inline formatting), shimmer loading states
- **Git integration** — live branch/diff status in the conversation header, stacked git actions (commit, push, pull, create PR), and a worktree manager
- **Liquid Glass** — glassmorphic prompt composer and toolbar on iOS 26 via `expo-glass-effect`
- **Platform-adaptive layouts** — native gesture-driven drawer on iOS/Android, collapsible sidebar on web
- **Dark mode** — automatic light/dark theme using OKLCH design tokens in Tailwind CSS v4
- **Native UI controls** — SwiftUI model picker, haptic feedback, SF Symbols on iOS
- **Keyboard-aware** — prompt input stays above the keyboard with `react-native-keyboard-controller`
- **Virtualized chat** — performant scrolling with `@legendapp/list` and Reanimated scroll-to-bottom button

## Tech Stack

| Layer      | Technology                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Framework  | Expo SDK 56, React Native 0.85, React 19                                                                                |
| Navigation | Expo Router (file-based) with typed routes, [Legend List](https://legendapp.com/open-source/list/) for virtualized chat |
| Styling    | Tailwind CSS v4 via [Uniwind](https://uniwind.dev/) + `tailwind-merge`                                                  |
| Native UI  | `@expo/ui` (SwiftUI), `expo-symbols`, `expo-haptics`, `expo-glass-effect`                                               |
| Web UI     | Radix UI (context menu, dropdown menu, tooltips), Lucide icons                                                          |
| Markdown   | Custom AST renderer with `mdast-util-from-markdown` + `react-syntax-highlighter`                                        |
| Animations | `react-native-reanimated`, `react-native-gesture-handler`                                                               |
| Storage    | `expo-secure-store` (keychain) for server credentials                                                                   |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) and the [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A running Trifecta server — start one with:

  ```bash
  npx @belweave/trifecta
  ```

- For iOS: Xcode and a simulator or device (requires a custom dev build — **does not work in Expo Go**)

### Install & Run

```bash
# Install dependencies
bun install

# Start the dev server
bun start

# Run on a specific platform
bun run ios
bun run android
bun run web
```

### Pairing with the Server

1. Start the Trifecta server on your desktop (`npx @belweave/trifecta`)
2. Open the app — you'll be prompted to pair on first launch
3. Copy the pairing URL printed by the server, then tap **Paste link** in the app to auto-fill, or enter the server URL and token manually
4. Tap **Connect** — your session is stored securely in the device keychain

> HTTPS and Cloudflare Tunnel URLs work — the app upgrades to WSS automatically. Use Tailscale or stay on the same LAN when not using a public tunnel.

### Environment Variables

No environment variables are required for local development. Create a `.env` file only if you need to override defaults.

## Customization

### Theme

Edit `src/global.css` to change design tokens. Colors use OKLCH for perceptual uniformity across light and dark modes. The `@theme` block maps CSS variables to Tailwind classes:

```css
--app-background  ->  bg-background
--app-foreground  ->  text-foreground
--app-muted       ->  bg-muted
--app-border      ->  border-border
```

## Quality checks

```bash
bun run typecheck
bun run lint
```

## Verification

This app requires a custom Expo development build and does not work in Expo Go.

- Use `npx serve-sim` to verify iOS and Apple platforms.
- Use `npx agent-browser` to verify on web.

## Support

Contact: info@belweave.com  
Privacy Policy: https://trifecta.belweave.ai/privacy  
Terms & Conditions: https://trifecta.belweave.ai/terms-and-conditions
