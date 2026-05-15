#!/usr/bin/env bash
# Deploy Trifecta web app to Vercel
# Usage: ./scripts/deploy-web.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$REPO_DIR/apps/web/dist"

echo "==> Building web app..."
cd "$REPO_DIR"
bun run build --filter=@belweave/web

echo "==> Deploying to Vercel..."
cd "$DIST_DIR"
vercel --prod --yes

echo "==> Done! https://app.trifecta.belweave.ai"
