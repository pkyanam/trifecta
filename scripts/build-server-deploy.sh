#!/bin/bash
# Build script for headless server deployment
# Usage: ./scripts/build-server-deploy.sh
# Output: server/ directory ready for rsync/scp to Ubuntu server

set -e

echo "Building Trifecta server for deployment..."

# Get the project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
DESKTOP_DIR="$PROJECT_ROOT/trifecta-desktop"

cd "$DESKTOP_DIR"

# Build the server package
echo "Building server package..."
bun run --filter=@belweave/trifecta build

# Clean and create deployment directory
echo "Preparing deployment directory..."
rm -rf "$SERVER_DIR"
mkdir -p "$SERVER_DIR"

# Copy the built server files
echo "Copying server files..."
cp -r "$DESKTOP_DIR/apps/server/dist" "$SERVER_DIR/dist"

# Copy package.json and update it for production
echo "Preparing package.json..."
node -e "
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync('$DESKTOP_DIR/apps/server/package.json', 'utf8'));
const rootPkg = JSON.parse(fs.readFileSync('$DESKTOP_DIR/package.json', 'utf8'));
const catalog = rootPkg.workspaces?.catalog || {};

// Resolve catalog: references to actual versions
function resolveCatalog(deps) {
  const resolved = {};
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === 'string' && spec.startsWith('catalog:')) {
      const catalogKey = spec.slice('catalog:'.length).trim();
      const lookupKey = catalogKey.length > 0 ? catalogKey : name;
      const version = catalog[lookupKey];
      if (!version) {
        throw new Error('Missing catalog entry for: ' + name);
      }
      resolved[name] = version;
    } else {
      resolved[name] = spec;
    }
  }
  return resolved;
}

// Create a minimal package.json for deployment
const deployPkg = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  bin: pkg.bin,
  files: pkg.files,
  engines: pkg.engines,
  dependencies: resolveCatalog(pkg.dependencies)
};

fs.writeFileSync('$SERVER_DIR/package.json', JSON.stringify(deployPkg, null, 2));
console.log('Resolved catalog dependencies');
"

# Create a startup script
cat > "$SERVER_DIR/start.sh" << 'EOF'
#!/bin/bash
# Trifecta Server Startup Script
# Usage: ./start.sh [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default configuration
export BELWEAVE_MODE="${BELWEAVE_MODE:-server}"
export BELWEAVE_HOST="${BELWEAVE_HOST:-0.0.0.0}"
export BELWEAVE_PORT="${BELWEAVE_PORT:-3773}"

# Optional: Set these for your setup
# export BELWEAVE_PUBLIC_URL="https://trifecta.yourdomain.com"
# export BELWEAVE_REVIEW_PAIRING_TOKEN="your-review-token"

echo "Starting Trifecta Server..."
echo "Mode: $BELWEAVE_MODE"
echo "Host: $BELWEAVE_HOST"
echo "Port: $BELWEAVE_PORT"
if [ -n "$BELWEAVE_PUBLIC_URL" ]; then
  echo "Public URL: $BELWEAVE_PUBLIC_URL"
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed or not in PATH"
  exit 1
fi

# Start the server
exec node "$SCRIPT_DIR/dist/bin.mjs" "$@"
EOF

chmod +x "$SERVER_DIR/start.sh"

# Create systemd service file template
cat > "$SERVER_DIR/trifecta.service" << 'EOF'
[Unit]
Description=Trifecta Server
After=network.target

[Service]
Type=simple
User=trifecta
WorkingDirectory=/opt/trifecta
Environment="BELWEAVE_MODE=server"
Environment="BELWEAVE_HOST=0.0.0.0"
Environment="BELWEAVE_PORT=3773"
# Optional: For Cloudflare tunnel or reverse proxy
# Environment="BELWEAVE_PUBLIC_URL=https://trifecta.yourdomain.com"
# Optional: Pre-configured pairing token for App Store review
# Environment="BELWEAVE_REVIEW_PAIRING_TOKEN=review-token-12345"
ExecStart=/opt/trifecta/start.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=trifecta

[Install]
WantedBy=multi-user.target
EOF

# Create README for deployment
cat > "$SERVER_DIR/README.md" << 'EOF'
# Trifecta Server Deployment

This folder contains the built Trifecta server ready for deployment.

## Quick Start

```bash
# 1. Copy to your server
rsync -avz --delete ./server/ user@your-server:/opt/trifecta/

# 2. On the server, install dependencies
cd /opt/trifecta
npm install --production

# 3. Start the server
./start.sh
```

## Configuration

Set environment variables to configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `BELWEAVE_MODE` | `server` | Runtime mode (server binds to 0.0.0.0) |
| `BELWEAVE_HOST` | `0.0.0.0` | Bind address |
| `BELWEAVE_PORT` | `3773` | Server port |
| `BELWEAVE_PUBLIC_URL` | - | Public URL for reverse proxy setups |
| `BELWEAVE_REVIEW_PAIRING_TOKEN` | - | Pre-configured pairing token |

## Systemd Service

```bash
# Copy service file
sudo cp trifecta.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable trifecta
sudo systemctl start trifecta

# Check status
sudo systemctl status trifecta
sudo journalctl -u trifecta -f
```

## Health Check

```bash
curl http://localhost:3773/api/health
```

## App Store Review Setup

For App Store review, set a fixed pairing token:

```bash
export BELWEAVE_REVIEW_PAIRING_TOKEN="review-token-12345"
./start.sh
```

The pairing URL will be printed on startup and will use the fixed token.
EOF

echo ""
echo "Build complete!"
echo ""
echo "Deployment folder: $SERVER_DIR"
echo ""
echo "To deploy to your Ubuntu server:"
echo "  rsync -avz --delete $SERVER_DIR/ user@your-server:/opt/trifecta/"
echo ""
echo "Then on the server:"
echo "  cd /opt/trifecta && bun install --production && ./start.sh"
echo ""
