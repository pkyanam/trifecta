# ── Trifecta Cloud Sandbox ──────────────────────────────────────────
# Headless coding-agent server optimized for EC2 / cloud deployment.
#
# Build:
#   docker build -t trifecta-server ./trifecta-desktop
#
# Run (local test):
#   docker run -p 3773:3773 -v trifecta-data:/data trifecta-server
#
# Run (EC2, full flags):
#   docker run -d \
#     --name trifecta \
#     -p 3773:3773 \
#     -v /opt/trifecta/data:/data \
#     -e TRIFECTA_PORT=3773 \
#     -e TRIFECTA_HOST=0.0.0.0 \
#     -e TRIFECTA_HOME=/data \
#     -e TRIFECTA_LOG_LEVEL=Info \
#     trifecta-server
# ─────────────────────────────────────────────────────────────────────

FROM oven/bun:1.3.11 AS builder
WORKDIR /app

# Build deps for node-pty native module
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# ── Install dependencies ─────────────────────────────────────────────
# Copy only package manifests first for layer caching
COPY package.json bun.lock ./
COPY patches/ patches/
COPY turbo.json ./

# Workspace package.json files (Bun needs them for workspace resolution)
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/marketing/package.json apps/marketing/
COPY apps/desktop/package.json apps/desktop/
COPY packages/contracts/package.json packages/contracts/
COPY packages/shared/package.json packages/shared/
COPY packages/tailscale/package.json packages/tailscale/
COPY packages/effect-acp/package.json packages/effect-acp/
COPY packages/effect-codex-app-server/package.json packages/effect-codex-app-server/
COPY packages/client-runtime/package.json packages/client-runtime/
COPY packages/ssh/package.json packages/ssh/
COPY oxlint-plugin-trifecta/package.json oxlint-plugin-trifecta/
COPY scripts/package.json scripts/

RUN bun install --frozen-lockfile

# ── Build server ─────────────────────────────────────────────────────
COPY . .

# Build only the t3 server + its transitive dependencies
RUN bun run build --filter=t3

# ── Runtime stage ────────────────────────────────────────────────────
FROM oven/bun:1.3.11-slim
WORKDIR /app

# Only runtime deps — no build tools needed at runtime
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Server expects a client/ directory for the web UI at runtime.
# In headless mode the web UI is optional, but the server still probes for it.
# Copy the built web assets so the server can serve the full UI if desired.
COPY --from=builder /app/apps/server/dist/client ./apps/server/dist/client

# ── Runtime configuration ────────────────────────────────────────────
ENV TRIFECTA_HOST=0.0.0.0
ENV TRIFECTA_PORT=3773
ENV TRIFECTA_HOME=/data
ENV TRIFECTA_MODE=web
ENV TRIFECTA_NO_BROWSER=true
ENV TRIFECTA_LOG_LEVEL=Info
ENV TRIFECTA_TAILSCALE_SERVE=false
ENV NODE_ENV=production

# Create persistent data directory and unprivileged user
RUN mkdir -p /data && \
    useradd --system --no-create-home --shell /sbin/nologin trifecta && \
    chown -R trifecta:trifecta /data /app

USER trifecta

EXPOSE 3773

# ── Entrypoint ───────────────────────────────────────────────────────
# Uses `bun` to match the runtime engine. `serve` subcommand starts
# in headless mode — no browser open, prints pairing URL to stdout.
ENTRYPOINT ["bun", "apps/server/dist/bin.mjs", "serve"]

# --------------------------------------------------------------------
# All settings are controllable via environment variables at runtime:
#   TRIFECTA_HOST     — bind interface (default: 0.0.0.0)
#   TRIFECTA_PORT     — HTTP/WS port     (default: 3773)
#   TRIFECTA_HOME     — data directory   (default: /data)
#   TRIFECTA_LOG_LEVEL— Debug|Info|Warning|Error
# --------------------------------------------------------------------
