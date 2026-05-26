# Contributing to Trifecta

Thank you for your interest in contributing to Trifecta! This document provides guidelines and best practices for contributing to the project.

## Getting Started

### Questions?

If you have questions about contributing, please:
- Open an [Issue](https://github.com/pkyanam/trifecta/issues) with your question
- Email us at info@belweave.com

### Project Status

Trifecta is early-stage and moving fast. While we appreciate contributions, please understand that:
- We may not be able to review all contributions immediately
- Large PRs or scope-expanding features may be deferred
- We prioritize performance, reliability, and maintainability

## What We're Looking For

### High-Priority Contributions
- **Bug fixes** - Small, focused fixes for reported issues
- **Performance improvements** - Optimizations that don't compromise reliability
- **Reliability fixes** - Improvements to error handling, reconnection logic, or failure recovery
- **Documentation** - Clarifications, examples, or fixes to existing docs
- **Test coverage** - Additional tests for existing functionality

### Lower-Priority Contributions
- Large feature additions without prior discussion
- Opinionated rewrites of existing code
- UI/UX changes without clear before/after evidence
- Changes that expand product scope

## Contribution Workflow

### 1. Open an Issue First

For non-trivial changes, please open an issue first to discuss:
- What you want to change
- Why the change is needed
- How you plan to implement it

This helps avoid wasted effort if the change doesn't align with project priorities.

### 2. Fork and Branch

```bash
# Fork the repository
git clone https://github.com/YOUR_USERNAME/trifecta.git
cd trifecta

# Create a feature branch
git checkout -b feature/your-feature-name
```

### 3. Make Your Changes

Follow the guidelines below for code quality and testing.

### 4. Test Your Changes

Run the relevant checks for the component you're modifying:

**trifecta-desktop:**
```bash
cd trifecta-desktop
bun install
bun run fmt          # Format code
bun run lint         # Lint code
bun run typecheck    # Type check
bun run test         # Run tests (Vitest)
```

**trifecta-mobile:**
```bash
cd trifecta-mobile
bun install
bun run typecheck    # Type check
bun run lint         # Lint code
```

**trifecta-www:**
```bash
cd trifecta-www
npm install
npm run lint         # Lint code
npm run build        # Build to verify
```

### 5. Submit a Pull Request

- Provide a clear description of what changed and why
- Link to related issues
- Include screenshots/videos for UI changes
- Keep PRs small and focused

## Code Quality Standards

### Core Priorities

1. **Performance first** - Changes should not degrade performance
2. **Reliability first** - Behavior must be predictable under load and during failures
3. **Maintainability** - Avoid code duplication, extract shared logic when possible

### Best Practices

- **Keep it small** - Small, focused PRs are easier to review and merge
- **Explain the why** - Don't just describe what changed, explain why it's needed
- **No unrelated changes** - One PR per concern
- **Document complex logic** - Add comments for non-obvious code
- **Follow existing patterns** - Look at similar code in the codebase

### Component-Specific Guidelines

**trifecta-desktop:**
- Follow Effect-TS patterns for server-side code
- Keep `packages/contracts` schema-only (no runtime logic)
- Use explicit subpath exports in `packages/shared`
- Server owns orchestration, web owns UX
- See [trifecta-desktop/AGENTS.md](./trifecta-desktop/AGENTS.md) for detailed guidelines

**trifecta-mobile:**
- Follow Expo and React Native best practices
- Test on iOS, Android, and web when possible
- Use Tailwind CSS v4 conventions
- Maintain platform-adaptive layouts

**trifecta-www:**
- Follow Next.js 16 App Router conventions
- Use Tailwind CSS 4 and shadcn-style components
- Test authentication flows with Clerk
- Verify Supabase and Daytona integrations

## Testing

### Required Before PR

- All linting must pass
- All type checking must pass
- All relevant tests must pass
- Manual testing for UI changes

### Test Coverage

- Add tests for new functionality when possible
- Focus on critical paths and error cases
- Unit tests for pure functions
- Integration tests for component interactions

## Communication

### During Review

- Respond to review feedback promptly
- If you disagree with feedback, explain your reasoning
- Be open to alternative approaches
- Update PR description based on review discussions

### After Merge

- Monitor for any issues related to your changes
- Be prepared to fix bugs that emerge
- Help with documentation updates if needed

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (Copyright © Belweave. All rights reserved).

## Thank You

We appreciate every contribution, no matter how small. Your time and effort help make Trifecta better for everyone!
