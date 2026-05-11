# ── Trifecta Cloud Sandbox ──────────────────────────────────────────
# Headless coding-agent server optimized for EC2 / cloud deployment.
#
# Build (minimal — no agents bundled):
#   docker build -t trifecta-server ./trifecta-desktop
#
# Build (with agent CLIs):
#   docker build --build-arg INSTALL_CLAUDE=true -t trifecta-server ./trifecta-desktop
#
# Run (EC2):
#   docker run -d --name trifecta --restart unless-stopped \
#     -p 3773:3773 -v /opt/trifecta/data:/data \
#     -e TRIFECTA_PORT=3773 -e TRIFECTA_HOST=0.0.0.0 -e TRIFECTA_HOME=/data \
#     trifecta-server
# ─────────────────────────────────────────────────────────────────────

FROM oven/bun:1.3.11 AS builder
WORKDIR /app

# Build deps for node-pty native module
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# ── Install + Build (single RUN to minimize disk usage) ──────────────
COPY package.json bun.lock ./
COPY patches/ patches/
COPY turbo.json ./

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

COPY . .

RUN bun install --frozen-lockfile && \
    bun run build --filter=t3 && \
    # Keep only what the runtime needs, drop everything else
    rm -rf apps/web apps/marketing apps/desktop packages scripts oxlint-plugin-trifecta && \
    rm -rf .turbo tsconfig.base.json turbo.json patches

# ── Runtime stage ────────────────────────────────────────────────────
FROM oven/bun:1.3.11
WORKDIR /app

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/apps/server/dist/client ./apps/server/dist/client

# ── Agent CLIs (opt-in via build args) ────────────────────────────────
ARG INSTALL_CODEX=false
ARG INSTALL_CLAUDE=false
ARG INSTALL_OPENCODE=false
ARG INSTALL_CURSOR=false

RUN if [ "$INSTALL_CODEX" = "true" ]; then bun add -g @openai/codex; fi && \
    if [ "$INSTALL_CLAUDE" = "true" ]; then bun add -g @anthropic-ai/claude-code; fi && \
    if [ "$INSTALL_OPENCODE" = "true" ]; then \
      bun add -g opencode-ai 2>/dev/null || curl -fsSL https://opencode.ai/install | bash; \
    fi && \
    if [ "$INSTALL_CURSOR" = "true" ]; then curl -fsSL https://cursor.com/install | bash; fi && \
    rm -rf /tmp/* /root/.bun/install/cache

# ── Runtime configuration ────────────────────────────────────────────
ENV TRIFECTA_HOST=0.0.0.0
ENV TRIFECTA_PORT=3773
ENV TRIFECTA_HOME=/data
ENV TRIFECTA_MODE=web
ENV TRIFECTA_NO_BROWSER=true
ENV TRIFECTA_LOG_LEVEL=Info
ENV TRIFECTA_TAILSCALE_SERVE=false
ENV NODE_ENV=production

RUN mkdir -p /data && \
    useradd --system --create-home --shell /bin/bash trifecta && \
    mkdir -p /home/trifecta/.codex /home/trifecta/.claude /home/trifecta/.config/opencode && \
    chown -R trifecta:trifecta /data /app /home/trifecta

USER trifecta
WORKDIR /home/trifecta

EXPOSE 3773
ENTRYPOINT ["bun", "/app/apps/server/dist/bin.mjs", "serve"]
