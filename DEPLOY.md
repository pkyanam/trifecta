# Trifecta Cloud Sandbox — Deploy Guide

How to deploy the Trifecta server to AWS EC2 and connect your iOS / Android apps.

---

## Architecture

```
┌──────────────────┐                  ┌──────────────────────┐
│  iOS / Android   │  WebSocket       │  EC2 (t3.medium)     │
│  Trifecta App    │◄──────────────► │                      │
└──────────────────┘  wss://ip:3773  │  Docker container    │
                                     │  ┌────────────────┐  │
                                     │  │ Trifecta Server │  │
                                     │  │ (Bun / Node)    │  │
                                     │  └───────┬────────┘  │
                                     │          │ spawns     │
                                     │  ┌───────▼────────┐  │
                                     │  │ Codex / Claude  │  │
                                     │  │ OpenCode CLI    │  │
                                     │  └────────────────┘  │
                                     └──────────────────────┘
```

The server spawns agent CLIs as subprocesses. Each CLI must be installed
and authenticated.

---

## Step 1 — Launch EC2 Instance

```bash
# Ubuntu 24.04 LTS, t3.medium (2 vCPU, 4 GB RAM — plenty)
# ~$0.04/hr on-demand, ~$0.01/hr spot
aws ec2 run-instances \
  --image-id ami-0c7217cdde317cfec \
  --instance-type t3.medium \
  --key-name your-key \
  --security-group-ids sg-xxx \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=trifecta-sandbox}]'
```

### Security group — open these ports

| Port | Protocol | Purpose |
|---|---|---|
| 3773 | TCP | Trifecta HTTP + WebSocket |
| 22 | TCP | SSH (your IP only) |

For testing, allow `0.0.0.0/0` on 3773. Lock to your carrier IP once stable.

---

## Step 2 — SSH In, Install Docker

```bash
ssh -i your-key.pem ubuntu@<ec2-ip>

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

---

## Step 3 — Install Agent CLIs

Trifecta spawns each agent as a CLI subprocess. Install at least one.

### Codex (OpenAI)

```bash
# Install globally
npm install -g @openai/codex

# Authenticate (choose one)
codex login                          # ChatGPT / Pro / Team / Enterprise
# OR: export OPENAI_API_KEY="sk-..." # API key
```

### Claude Code (Anthropic)

```bash
npm install -g @anthropic-ai/claude-code

# Authenticate
claude login
# OR: export ANTHROPIC_API_KEY="sk-ant-..."
```

### OpenCode

```bash
# Option A: npm
npm install -g opencode-ai

# Option B: install script
curl -fsSL https://opencode.ai/install | bash

# Configure API keys in ~/.config/opencode/config.toml
```

### Cursor

```bash
curl -fsSL https://cursor.com/install | bash

# Authenticate
cursor login
```

> **Skip any you don't use.** The server gracefully handles missing CLIs —
> they show as "not installed" in the provider list.

Verify they're on PATH:

```bash
which codex claude opencode cursor
```

---

## Step 4 — Clone and Build

```bash
git clone https://github.com/pkyanam/trifecta.git
cd trifecta
```

Choose your build:

```bash
# Minimal — no agent CLIs bundled (mount them from host)
docker build -t trifecta-server ./trifecta-desktop

# With agent CLIs baked in (recommended for EC2)
docker build \
  --build-arg INSTALL_CODEX=true \
  --build-arg INSTALL_CLAUDE=true \
  --build-arg INSTALL_OPENCODE=true \
  -t trifecta-server ./trifecta-desktop
```

---

## Step 5 — Authenticate Agents (if using host-mounted auth)

If you installed CLIs on the host and want to mount auth into the container:

```bash
# After running `codex login` / `claude login` on the host,
# mount these directories so the container user can read them:

docker run -d \
  --name trifecta \
  --restart unless-stopped \
  -p 3773:3773 \
  -v /opt/trifecta/data:/data \
  -v /home/ubuntu/.codex:/home/trifecta/.codex:ro \
  -v /home/ubuntu/.claude:/home/trifecta/.claude:ro \
  -v /home/ubuntu/.config/opencode:/home/trifecta/.config/opencode:ro \
  -e TRIFECTA_HOST=0.0.0.0 \
  -e TRIFECTA_PORT=3773 \
  -e TRIFECTA_HOME=/data \
  trifecta-server
```

If you built CLIs into the image (Step 4, option 2), auth from inside:

```bash
# Shell into the container to authenticate
docker exec -it trifecta bash

# Then run:
codex login
claude login
# etc.
```

Or pass API keys as env vars:

```bash
docker run -d \
  --name trifecta \
  --restart unless-stopped \
  -p 3773:3773 \
  -v /opt/trifecta/data:/data \
  -e TRIFECTA_HOST=0.0.0.0 \
  -e TRIFECTA_PORT=3773 \
  -e TRIFECTA_HOME=/data \
  -e OPENAI_API_KEY="sk-..." \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  trifecta-server
```

---

## Step 6 — Verify

```bash
# Health check (public, no auth)
curl http://<ec2-ip>:3773/.well-known/t3/environment | jq .

# Check logs for pairing URL and provider status
docker logs trifecta
```

Expected output:

```json
{
  "environmentId": "uuid-here",
  "label": "ip-10-0-1-42",
  "platform": { "os": "linux", "arch": "x64" },
  "serverVersion": "0.0.23",
  "capabilities": { "repositoryIdentity": true }
}
```

---

## Step 7 — Connect Your Mobile App

1. Open Trifecta on iOS / Android
2. Tap **Add Server**
3. Enter the server URL:

```text
http://<ec2-ip>:3773
```

4. Follow the pairing flow — the server prints a one-time pairing URL on
   startup. Find it in the logs:

```bash
docker logs trifecta | grep pairing
```

5. Open the pairing URL in your mobile browser or scan the QR code from
   the server's web UI to complete pairing.

---

## Monitoring

```bash
# Live logs
docker logs -f trifecta

# Check health
curl -s http://localhost:3773/.well-known/t3/environment | jq .

# Restart
docker restart trifecta
```

---

## Troubleshooting

### "Codex is not installed" in provider list

The `codex` binary isn't on PATH inside the container. Either:
- Rebuild with `--build-arg INSTALL_CODEX=true`
- Bind-mount a host-installed binary: `-v /usr/local/bin/codex:/usr/local/bin/codex`

### "Codex is not authenticated"

Run `codex login` inside the container or set `OPENAI_API_KEY` env var.

### Can't connect from mobile

- Verify security group allows TCP 3773 from `0.0.0.0/0`
- Check the server bound to `0.0.0.0`: `docker logs trifecta | head -20`
- Try `curl http://<ec2-public-ip>:3773/.well-known/t3/environment` from your laptop

### Port already in use

```bash
sudo lsof -i :3773
# Kill the process or change TRIFECTA_PORT
```

---

## Cleanup

```bash
docker stop trifecta && docker rm trifecta
# Destroys all state (threads, tokens, settings)
sudo rm -rf /opt/trifecta/data
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TRIFECTA_HOST` | `0.0.0.0` | Interface to bind |
| `TRIFECTA_PORT` | `3773` | HTTP + WebSocket port |
| `TRIFECTA_HOME` | `/data` | Persistent data directory |
| `TRIFECTA_LOG_LEVEL` | `Info` | Debug, Info, Warning, Error |
| `TRIFECTA_MODE` | `web` | `web` (0.0.0.0) or `desktop` (127.0.0.1) |
| `OPENAI_API_KEY` | — | Codex API key (alternative to `codex login`) |
| `ANTHROPIC_API_KEY` | — | Claude API key (alternative to `claude login`) |
