# Trifecta Cloud Sandbox — Deploy Guide

Deploy the Trifecta server to AWS EC2 and connect your iOS / Android apps.

---

## Architecture

```text
┌──────────────────┐                  ┌──────────────────────┐
│  iOS / Android   │  WebSocket       │  EC2 (t3.small+)     │
│  Trifecta App    │◄──────────────► │                      │
└──────────────────┘  ws://ip:3773   │  Docker container    │
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

Agent CLIs are baked into the Docker image via build args. Auth tokens
are bind-mounted from the host (or passed as env vars).

---

## Step 1 — Launch EC2 Instance

AWS Console → EC2 → Launch instance:

- **AMI:** Ubuntu Server 24.04 LTS (x86)
- **Instance type:** t3.small or t3.medium
- **Key pair:** create or select one
- **Security group:** allow TCP 22 (SSH) + TCP 3773 (Trifecta) from 0.0.0.0/0
- **Storage:** 15 GB gp3 minimum

---

## Step 2 — SSH In, Install Docker, Auth Codex

```bash
ssh -i your-key.pem ubuntu@<ec2-ip>

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

Install Node.js and Codex on the host (auth dir will be bind-mounted into the container):

```bash
# Install Node.js + npm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Codex CLI
npm install -g @openai/codex

# Authenticate
codex login
```

---

## Step 3 — Build Image on MacBook, Push to ECR

### Create ECR repository (one-time)

AWS Console → ECR → Create repository → name: `trifecta` → Create.

Note the URI: `<account-id>.dkr.ecr.<region>.amazonaws.com/trifecta`

### Build and push

```bash
cd ~/projects/trifecta

# Build for Linux x86 with Codex
docker build --platform=linux/amd64 \
  --build-arg INSTALL_CODEX=true \
  -t trifecta-server \
  ./trifecta-desktop

# Push to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker tag trifecta-server <account-id>.dkr.ecr.us-east-1.amazonaws.com/trifecta:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/trifecta:latest
```

---

## Step 4 — Pull and Run on EC2

**Preferred:** Attach an IAM role to the EC2 instance with the
`AmazonEC2ContainerRegistryReadOnly` policy (no credentials on disk).

**Alternative (quick):** Configure AWS credentials:

```bash
aws configure
# paste Access Key + Secret Key, region: us-east-1
```

Then login and run:

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Pull and run
docker pull <account-id>.dkr.ecr.us-east-1.amazonaws.com/trifecta:latest

docker run -d \
  --name trifecta \
  --restart unless-stopped \
  -p 3773:3773 \
  -v /opt/trifecta/data:/data \
  -v /home/ubuntu/.codex:/home/trifecta/.codex \
  -e TRIFECTA_HOST=0.0.0.0 \
  -e TRIFECTA_PORT=3773 \
  -e TRIFECTA_HOME=/data \
  -e CODEX_HOME=/home/trifecta/.codex \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/trifecta:latest
```

The `-v /home/ubuntu/.codex:/home/trifecta/.codex` mount gives the container
access to your host's Codex auth session (token from `codex login`).

---

## Step 5 — Verify

```bash
# Health check
curl http://localhost:3773/.well-known/t3/environment | jq .

# Get pairing URL
docker logs trifecta 2>&1 | grep "Pairing URL"
```

Expected health response:

```json
{
  "environmentId": "uuid-here",
  "label": "...",
  "platform": { "os": "linux", "arch": "x64" },
  "serverVersion": "0.0.23",
  "capabilities": { "repositoryIdentity": true }
}
```

---

## Step 6 — Connect Mobile App

1. Open Trifecta on iOS / Android
2. Add server: `http://<ec2-public-ip>:3773`
3. Open the pairing URL from the logs in your mobile browser
4. App pairs and shows connected providers

### Create a project (CLI)

The mobile app needs at least one project to create threads in:

```bash
docker exec -it trifecta mkdir -p /home/trifecta/test-project
docker exec -it trifecta bun /app/apps/server/dist/bin.mjs project add /home/trifecta/test-project --title "Test Project"
```

---

## Monitoring

```bash
docker logs -f trifecta
curl -s http://localhost:3773/.well-known/t3/environment | jq .
docker restart trifecta
```

---

## Troubleshooting

### "Codex not installed" in provider list

Rebuild with `--build-arg INSTALL_CODEX=true`.

### "no native root CA certificates found" in logs

The Codex CLI can't make TLS connections. Rebuild with latest Dockerfile
(has `ca-certificates` installed).

### Can't connect from mobile

- Security group must allow TCP 3773 from 0.0.0.0/0
- Verify: `curl http://<ec2-public-ip>:3773/.well-known/t3/environment`
- Check binding: `docker logs trifecta | head -5`

### Disk full

```bash
docker system prune -af --volumes
df -h /
```

---

## Cleanup

```bash
docker stop trifecta && docker rm trifecta
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
| `CODEX_HOME` | — | Codex auth/config directory |
| `OPENAI_API_KEY` | — | Codex API key (alternative to `codex login`) |
