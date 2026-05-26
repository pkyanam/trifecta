# AGENTS.md

This document provides detailed instructions and context for AI agents working with the Trifecta monorepo.

## Monorepo Structure

Trifecta is a monorepo containing three main applications and supporting infrastructure:

```
trifecta/
├── trifecta-desktop/    # Core platform (server, web UI, Electron, VS Code extension)
├── trifecta-mobile/     # Cross-platform mobile + web client (Expo, React Native)
├── trifecta-www/        # Marketing site and cloud dashboard (Next.js)
├── server/              # Built server bundle + systemd unit
├── docs/                # Architecture notes
├── _reference/          # Read-only reference checkouts
└── t3code-original/     # Preserved upstream T3 Code subtree
```

## Core Priorities

1. **Performance first** - Changes should not degrade performance
2. **Reliability first** - Behavior must be predictable under load and during failures
3. **Maintainability** - Avoid code duplication, extract shared logic when possible
4. **Correctness over convenience** - Choose robustness over short-term shortcuts

## Component-Specific Guidelines

### trifecta-desktop

**Location:** `trifecta-desktop/`

**Tech Stack:** Electron 41, Effect-TS, React 19, Vite 8, Tailwind CSS 4, Turborepo, Bun

**Task Completion Requirements:**
- All of `bun fmt`, `bun lint`, and `bun run typecheck` must pass before considering tasks completed
- NEVER run `bun test`. Always use `bun run test` (runs Vitest)

**Package Roles:**
- `apps/server`: Node.js WebSocket server. Wraps agent processes (JSON-RPC/ACP over stdio), serves React web app, manages provider sessions
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, client-side state. Connects via WebSocket
- `apps/desktop`: Electron shell + auto-updater
- `apps/vscode`: VS Code/Cursor extension
- `packages/contracts`: Shared Effect/Schema schemas and TypeScript contracts. Keep schema-only — no runtime logic
- `packages/shared`: Shared runtime utilities. Uses explicit subpath exports (e.g. `@belweave/shared/git`) — no barrel index
- `packages/client-runtime`: Client-side WebSocket/RPC runtime
- `packages/ssh`: SSH terminal + tunnel helpers
- `packages/tailscale`: Tailscale integration
- `packages/effect-acp`: Effect bindings for Agent Client Protocol
- `packages/effect-codex-app-server`: Effect bindings for Codex app-server protocol

**Development Commands:**
```bash
cd trifecta-desktop
bun install
bun run dev            # server + web UI
bun run dev:desktop    # Electron shell
bun run build          # build all packages
bun run typecheck      # type check all packages
bun run lint           # lint all packages
bun run fmt            # format all packages
bun run test           # run tests (Vitest)
```

**Filter to specific packages:**
```bash
bun run build --filter=@belweave/trifecta --filter=@belweave/web
```

**Key Architecture:**
- Server starts agent processes (Codex, Claude, etc.) per provider session via stdio
- Streams structured events to browser through WebSocket push messages
- Session startup/resume and turn lifecycle: `apps/server/src/codexAppServerManager.ts`
- Provider dispatch and thread event logging: `apps/server/src/providerManager.ts`
- WebSocket server routes NativeApi methods: `apps/server/src/wsServer.ts`
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent`

**Detailed Guidelines:** See [trifecta-desktop/AGENTS.md](./trifecta-desktop/AGENTS.md)

### trifecta-mobile

**Location:** `trifecta-mobile/`

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, Expo Router, Tailwind CSS v4, Uniwind

**Task Completion Requirements:**
- `bun run typecheck` must pass
- `bun run lint` must pass
- Manual testing on target platform(s) for UI changes

**Development Commands:**
```bash
cd trifecta-mobile
bun install
bun start              # interactive menu
bun run ios            # iOS simulator
bun run android        # Android emulator
bun run web            # web browser
bun run typecheck      # type check
bun run lint           # lint code
```

**Key Architecture:**
- Single codebase runs on iOS, Android, and web via Expo
- File-based routing with Expo Router
- Platform-adaptive layouts (gesture drawer on mobile, sidebar on web)
- Streaming messages with ~30 fps updates
- Virtualized chat list with `@legendapp/list`
- iOS 26 Liquid Glass support via `expo-glass-effect`

**Important Patterns:**
- Use Tailwind CSS v4 via Uniwind for styling
- Platform-specific code: `Platform.OS` checks or platform-specific files
- Native UI components via `@expo/ui` (SwiftUI integration)
- Secure storage with `expo-secure-store`
- Keyboard-aware input with `react-native-keyboard-controller`

**Testing:**
- Requires custom Expo development build (NOT Expo Go)
- Use `bunx expo run:ios` or `bunx expo run:android` for device testing
- Web testing: `npx agent-browser`

### trifecta-www

**Location:** `trifecta-www/`

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Clerk, Supabase, Daytona

**Task Completion Requirements:**
- `npm run lint` must pass
- `npm run build` must succeed
- Manual testing for authentication and database changes

**Development Commands:**
```bash
cd trifecta-www
npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run lint           # lint code
npm run start          # start production server
```

**Key Architecture:**
- Next.js 16 App Router (file-based routing)
- Clerk for authentication (`@clerk/nextjs`)
- Supabase for database (`@supabase/supabase-js`)
- Daytona for cloud sandbox environments
- Base UI components + shadcn-style primitives
- Dark mode with `next-themes`

**Important Patterns:**
- Use App Router conventions (app/ directory)
- Server components by default, client components with 'use client'
- Environment variables in `.env.local`
- Clerk middleware for route protection
- Supabase SSR helpers for server-side data fetching

**Deployment:**
- Pre-configured for Vercel via `vercel.json`
- Environment variables must be set in Vercel dashboard
- Run `vercel --prod` to deploy

## Cross-Component Work

### Shared Contracts

When working across components, check if shared contracts exist:
- `trifecta-desktop/packages/contracts` - Shared schemas for desktop ecosystem
- Consider creating shared packages if logic is duplicated across components

### API Integration

- Desktop server provides WebSocket API for clients
- Mobile and web clients connect to desktop server
- WWW site provides cloud dashboard and marketing
- Respect API boundaries and contract definitions

### Consistent Patterns

- TypeScript for type safety across all components
- Tailwind CSS for styling (v4 in desktop/mobile/www)
- Component composition patterns
- Error handling and loading states

## General Agent Guidelines

### Before Making Changes

1. **Understand the context** - Read existing code and patterns
2. **Check for shared logic** - Look for existing utilities before creating new ones
3. **Consider impact** - Will this affect other components or users?
4. **Test thoroughly** - Run all relevant checks before considering complete

### Code Quality

- **No code duplication** - Extract shared logic to modules/packages
- **Follow existing patterns** - Look at similar code in the codebase
- **Type safety** - Leverage TypeScript, avoid `any`
- **Clear naming** - Use descriptive names for functions, variables, files
- **Comments for complexity** - Explain non-obvious logic

### Testing

- **Run typecheck** - Catch type errors early
- **Run linter** - Follow code style guidelines
- **Run formatter** - Keep code consistently formatted
- **Manual testing** - Test UI changes on target platforms
- **Unit tests** - Add tests for new functionality when possible

### Common Pitfalls

- **Don't skip type checking** - TypeScript errors indicate real issues
- **Don't ignore linter warnings** - They often catch bugs
- **Don't mix concerns** - Keep UI, logic, and data separate
- **Don't hardcode values** - Use configuration and environment variables
- **Don't break existing functionality** - Test affected areas

### Performance Considerations

- **Avoid unnecessary re-renders** - Use React.memo, useMemo, useCallback appropriately
- **Optimize lists** - Use virtualization for long lists
- **Lazy load** - Code split and lazy load when appropriate
- **Bundle size** - Be mindful of adding dependencies
- **Network requests** - Minimize and optimize API calls

### Security Considerations

- **Never commit secrets** - Use environment variables
- **Validate inputs** - Don't trust user input
- **Handle errors gracefully** - Don't expose sensitive information
- **Use secure storage** - expo-secure-store, keychain, etc.
- **API keys** - Never hardcode, use environment variables

## File Navigation Tips

### Finding Code

- **Server logic:** `trifecta-desktop/apps/server/src/`
- **Web UI:** `trifecta-desktop/apps/web/src/`
- **Mobile app:** `trifecta-mobile/src/`
- **WWW site:** `trifecta-www/app/`
- **Shared utilities:** `trifecta-desktop/packages/shared/src/`
- **Contracts/schemas:** `trifecta-desktop/packages/contracts/src/`

### Configuration Files

- **Desktop:** `trifecta-desktop/package.json`, `trifecta-desktop/turbo.json`
- **Mobile:** `trifecta-mobile/package.json`, `trifecta-mobile/app.json`
- **WWW:** `trifecta-www/package.json`, `trifecta-www/next.config.js`

### Documentation

- **Desktop:** `trifecta-desktop/README.md`, `trifecta-desktop/AGENTS.md`
- **Mobile:** `trifecta-mobile/README.md`
- **WWW:** `trifecta-www/README.md`
- **Deploy:** `trifecta-desktop/DEPLOY.md`, `trifecta-desktop/REMOTE.md`

## Build and Deployment

### Desktop

```bash
cd trifecta-desktop
bun run build
# Outputs to dist/ in each package
```

### Mobile

```bash
cd trifecta-mobile
eas build --platform ios --profile production
eas build --platform android --profile production
```

### WWW

```bash
cd trifecta-www
npm run build
vercel --prod
```

## Reference Resources

### Desktop/Server
- Codex App Server: https://developers.openai.com/codex/sdk/#app-server
- Open-source Codex: https://github.com/openai/codex
- Codex-Monitor: https://github.com/Dimillian/CodexMonitor

### Mobile
- Expo docs: https://docs.expo.dev
- React Native docs: https://reactnative.dev
- Expo Router: https://docs.expo.dev/router/introduction

### WWW
- Next.js 16 docs: https://nextjs.org/docs
- Clerk docs: https://clerk.com/docs
- Supabase docs: https://supabase.com/docs

## When in Doubt

1. **Ask questions** - Open an issue or email info@belweave.com
2. **Look at similar code** - Find existing patterns in the codebase
3. **Start small** - Make incremental changes and test frequently
4. **Document decisions** - Add comments for non-obvious choices
5. **Communicate** - If unsure about approach, discuss before implementing

## Task Completion Checklist

Before marking a task as complete, verify:

- [ ] All type checking passes (`bun run typecheck` / `npm run typecheck`)
- [ ] All linting passes (`bun run lint` / `npm run lint`)
- [ ] All formatting passes (`bun run fmt` / `npm run fmt` if applicable)
- [ ] All tests pass (`bun run test` / `npm run test` if applicable)
- [ ] Build succeeds (`bun run build` / `npm run build`)
- [ ] Manual testing performed for UI changes
- [ ] No new warnings or errors introduced
- [ ] Code follows existing patterns and conventions
- [ ] Documentation updated if needed
- [ ] Sensitive data not committed

## Summary

This monorepo contains three distinct applications with different tech stacks but shared goals. When working across components, respect boundaries, follow existing patterns, and prioritize performance, reliability, and maintainability. Always run the appropriate checks before considering changes complete.
