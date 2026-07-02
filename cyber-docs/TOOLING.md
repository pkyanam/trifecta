# Tooling Notes

Tools installed / available in this audit environment.

## Installed
- `bun` (already present) — used for `bun audit`, install, fmt/lint/typecheck/test
- `oxlint` / `oxfmt` — installed via trifecta-desktop workspace
- `vitest` — installed via workspace

## To install on demand (npx/brew)
- `npx osv-scanner@latest` — OSV lockfile scan
- `npx semgrep@latest --config=p/default --config=p/security-audit --config=p/nodejs` — SAST
- `gitleaks` — `brew install gitleaks` then `gitleaks detect --source .`

## Notes
- Do NOT start dev servers / Electron / Expo runtimes.
- Use `bun run test` (never `bun test`) for Vitest.
