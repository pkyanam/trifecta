# ── Trifecta Cloud Sandbox — Deploy Guide ───────────────────────────

How to deploy the Trifecta server to a cloud VM (EC2, Lambda, Hetzner,
etc.) and connect your iOS / Android apps.

## Quick Deploy (EC2)

### 1. Launch an EC2 instance

```bash
# t3.medium is plenty — the server runs on Node/Bun, no GPU needed.
# Estimated cost: ~$0.04/hr on-demand, ~$0.01/hr spot.
aws ec2 run-instances \
  --image-id ami-0c7217cdde317cfec \
  --instance-type t3.medium \
  --key-name your-key \
  --security-group-ids sg-xxx \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=trifecta-sandbox}]'
```

### 2. Security group — open port 3773

Make sure the instance's security group allows inbound TCP on port 3773
from your mobile carrier IP (or 0.0.0.0/0 for testing — lock it down later).

### 3. SSH in and install Docker

```bash
ssh -i your-key.pem ubuntu@<ec2-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

### 4. Clone and build

```bash
git clone https://github.com/pkyanam/trifecta.git
cd trifecta

# Build the image (Dockerfile is inside trifecta-desktop/)
docker build -t trifecta-server ./trifecta-desktop
```

### 5. Run

```bash
docker run -d \
  --name trifecta \
  --restart unless-stopped \
  -p 3773:3773 \
  -v /opt/trifecta/data:/data \
  -e TRIFECTA_HOST=0.0.0.0 \
  -e TRIFECTA_PORT=3773 \
  -e TRIFECTA_HOME=/data \
  -e TRIFECTA_LOG_LEVEL=Info \
  trifecta-server
```

### 6. Verify

```bash
# Health check (public, no auth)
curl http://<ec2-ip>:3773/.well-known/t3/environment

# Should return JSON with environmentId, platform, serverVersion, etc.
```

### 7. Connect your mobile app

Open Trifecta on iOS/Android, add a new server:

```text
Server URL: http://<ec2-ip>:3773
```

Follow the pairing flow (scan the URL from the server logs, or use the
pairing link printed on startup).

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TRIFECTA_HOST` | `0.0.0.0` | Interface to bind |
| `TRIFECTA_PORT` | `3773` | HTTP + WebSocket port |
| `TRIFECTA_HOME` | `/data` | Persistent data directory |
| `TRIFECTA_LOG_LEVEL` | `Info` | Debug, Info, Warning, Error |

---

## Monitoring

```bash
# Check logs
docker logs -f trifecta

# Check health
curl -s http://localhost:3773/.well-known/t3/environment | jq .

# Restart
docker restart trifecta
```

---

## Cleanup

```bash
docker stop trifecta && docker rm trifecta
# The bind-mounted host directory — destroys all state (threads, tokens, settings)
sudo rm -rf /opt/trifecta/data
```
