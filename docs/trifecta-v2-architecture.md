# Trifecta v2 — AWS Cloud Sandbox Architecture

**Author:** Lara & Preetham  
**Date:** May 11, 2026  
**Status:** Design Proposal  

## Summary

Trifecta v2 moves from a single-container EC2 deployment to a two-tier AWS architecture:
- **Control Plane** (ECS Fargate) — the existing Effect-TS Trifecta server, unchanged provider SPI, handles auth, sessions, and WebSocket RPC
- **Sandbox Layer** (EC2 + Firecracker) — isolated microVMs per user session, with snapshot-based fast provisioning

The existing pairing flow (`app.trifecta.dev/pair?host=...&token=...`) works identically. The desktop "Add Environment" modal connects to the cloud backend the same way. No protocol changes needed.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     AWS us-east-1                        │
│                                                          │
│  ┌─ Public Subnet (10.0.1.0/24) ────────────────────┐  │
│  │  ALB (HTTPS :443, WSS)  │  CloudFront + S3       │  │
│  │  NAT Gateway (VM egress)                          │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│  ┌─ Control Plane Subnet (10.0.2.0/24) ────────────┐  │
│  │  Trifecta Server (ECS Fargate, Bun)              │  │
│  │  DynamoDB (sessions, users)  │  S3 (workspaces)  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│  ┌─ Sandbox Subnet (10.0.3.0/24, isolated) ────────┐  │
│  │  EC2 c6i.4xlarge → Sandbox Manager (Go)         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│  │  │  VM-1    │ │  VM-2    │ │  VM-3    │  ...    │  │
│  │  │ Alpine   │ │ Alpine   │ │ Alpine   │         │  │
│  │  │ codex    │ │ codex    │ │ codex    │         │  │
│  │  └──────────┘ └──────────┘ └──────────┘         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Trifecta Server (Control Plane)

**Runtime:** ECS Fargate (512 vCPU, 1GB RAM per task)  
**Stack:** Bun + Effect-TS (unchanged from v1)  
**Port:** 3773 (internal), exposed via ALB on :443  

Responsibilities:
- **Auth:** Pairing flow (`GET /.well-known/t3/environment` → `POST /api/auth/bootstrap/bearer` → WebSocket token)
- **WebSocket RPC:** Existing protocol — `Request`, `Chunk`, `Exit`, `Defect`, `Ping`, `Pong`, `Ack`
- **Provider SPI:** Registers provider drivers (`codex`, `claude`, `opencode`, `cursor`). The Firecracker provider is registered as a new driver kind.
- **Session management:** Tracks active sessions, routes turns to the correct VM
- **Workspace lifecycle:** Pulls workspace from S3, mounts to VM, pushes results back

**Changes from v1:**
- New `firecracker` provider driver (implements `ProviderDriver` SPI)
- S3-backed workspace persistence instead of local disk
- DynamoDB for session state (was SQLite)
- Environment variable: `TRIFECTA_SANDBOX_MANAGER_URL` → points to the sandbox manager

**Scaling:** ECS service auto-scaling (target: CPU 70%, min 1, max 10). Each task handles ~50 concurrent WebSocket connections.

### 2. Sandbox Manager (EC2 + Firecracker)

**Runtime:** EC2 c6i.4xlarge (16 vCPU, 32GB RAM) — supports nested virtualization (KVM)  
**Stack:** Go binary (single-file deploy, no dependencies)  

Responsibilities:
- **VM lifecycle:** Create, start, snapshot, restore, stop, destroy Firecracker VMs
- **Snapshot pool:** Pre-warm VMs with agent CLI + tools installed, snapshot to disk
- **Workspace injection:** Mount S3 workspace into VM via FUSE or pull-to-tmpfs
- **vsock proxy:** Routes exec commands from control plane to VM guest agents
- **Health monitoring:** VM health checks, OOM detection, forced cleanup

**VM Specs (per Firecracker microVM):**
| Parameter | Value |
|-----------|-------|
| Kernel | Linux 6.1 LTS (custom minimal config) |
| Rootfs | Alpine Linux ~80MB |
| RAM | 512MB–2GB (configurable per session type) |
| vCPUs | 1–2 |
| Disk | tmpfs (ephemeral, destroyed on stop) |
| Agent CLI | codex, claude, opencode (baked into rootfs) |
| Network | NAT-only via TAP device → host bridge → NAT GW |
| Control channel | vsock (host:port ↔ guest:port, no IP stack) |

**VM Provisioning Flow:**
```
1. Control plane → Sandbox Manager: POST /vms { userId, workspaceId, agentKind }
2. Manager checks snapshot pool for matching rootfs + agent version
3. If hit: Copy snapshot (CoW) → restore in ~30ms
   If miss: Cold boot kernel + rootfs → start agent → snapshot → hand off (~1.2s)
4. Manager injects workspace: S3 pull → VM tmpfs → chown
5. Manager returns: { vmId, vsockPort }
6. Control plane connects to vsock → starts agent session
7. On session end: Control plane → push workspace diff to S3 → destroy VM
```

**Snapshot Strategy:**
- Pre-warm pool: N VMs per agent type, already booted to agent-ready state
- Copy-on-write: Multiple VMs share base snapshot memory pages
- Cold boot fallback: ~1.2s for first VM of a new rootfs version
- Max density: ~20 VMs per c6i.4xlarge host (1.5GB RAM/VM avg)

### 3. Guest Agent (Inside Each Firecracker VM)

**Stack:** Single static Go binary (`trifecta-guest-agent`), runs as PID 1  

Responsibilities:
- Listens on vsock for exec commands
- Manages agent CLI process lifecycle (start, stdio streaming, kill)
- Reports health (heartbeat, memory, disk)
- Handles workspace file sync (push/pull from S3 via host proxy)

**vsock Protocol (length-prefixed JSON):**
```
[4 bytes BE: message length][JSON payload]
```

Request:
```json
{"type": "exec", "command": ["codex", "app-server"], "env": {"HOME": "/workspace"}, "workdir": "/workspace"}
```

Response (streamed):
```json
{"type": "stdout", "data": "{\"jsonrpc\":\"2.0\",...}"}
{"type": "stderr", "data": "..."}
{"type": "exit", "code": 0}
```

### 4. Web Client (S3 + CloudFront)

Unchanged from v1. Static React app served from S3, cached via CloudFront. The `hostedPairing.ts` logic already handles `?host=control.trifecta.dev&token=xxx` — no changes needed.

### 5. Mobile Clients (iOS/Android)

Unchanged. Connect via WebSocket to the ALB DNS or directly to the server if on the same Tailscale network. The pairing URL flow is identical.

---

## Networking

### VPC Design

| Subnet | CIDR | Purpose | Route Table |
|--------|------|---------|-------------|
| Public | 10.0.1.0/24 | ALB, NAT GW, CloudFront endpoints | 0.0.0.0/0 → IGW |
| Control | 10.0.2.0/24 | ECS Fargate tasks | 0.0.0.0/0 → NAT GW |
| Sandbox | 10.0.3.0/24 | EC2 sandbox hosts | 0.0.0.0/0 → NAT GW (no inbound from internet) |

### Security Groups

| SG | Inbound | Outbound |
|----|---------|----------|
| sg-alb | 0.0.0.0/0:443 | sg-trifecta:3773 |
| sg-trifecta | sg-alb:3773 | sg-sandbox:9090, DynamoDB, S3 |
| sg-sandbox | sg-trifecta:9090 | NAT GW (all), S3 VPC endpoint |

### Firecracker VM Networking
- Each VM gets a TAP device bridged to the host
- No IP routing between VMs — host iptables blocks cross-VM traffic
- Internet access via NAT (host → NAT GW). No inbound ports exposed.
- Control channel is vsock, not TCP — no network attack surface

---

## Provider SPI Integration

The Firecracker sandbox plugs into the existing `ProviderDriver` SPI:

```typescript
// New driver: firecrackerProvider.ts
export const firecrackerProviderDriver: ProviderDriver<FirecrackerConfig> = {
  driverKind: "firecracker",
  metadata: { displayName: "Firecracker Sandbox" },
  configSchema: FirecrackerConfigSchema,
  create: (input) =>
    Effect.gen(function* () {
      const managerClient = yield* SandboxManagerClient;  // REST client
      const fileSystem = yield* FileSystem.FileSystem;

      // Adapter: maps ProviderAdapterShape to vsock RPC
      const adapter = makeFirecrackerAdapter({ managerClient, ... });

      // Snapshot: reports VM health, agent status
      const snapshot = makeFirecrackerSnapshot({ managerClient, ... });

      // Text generation: forwards to agent inside VM
      const textGeneration = makeFirecrackerTextGeneration({ adapter });

      return { instanceId, driverKind, adapter, snapshot, textGeneration, ... };
    }),
};
```

This means the existing WebSocket RPC protocol, session management, and orchestration layer work without changes. The only new code is:
1. `firecrackerProvider.ts` — the driver
2. `sandbox-manager/` — the Go binary that runs on EC2
3. `trifecta-guest-agent/` — the Go binary inside each VM

---

## Cost Estimate

Monthly (steady-state, 10 concurrent users):

| Resource | Spec | Monthly |
|----------|------|---------|
| ECS Fargate | 0.5 vCPU, 1GB × 1 task | ~$12 |
| ALB | 1 LCU avg | ~$22 |
| EC2 c6i.4xlarge | On-demand, 1 instance | ~$500 |
| DynamoDB | On-demand, <1M req/mo | ~$5 |
| S3 | <10 GB, standard | ~$0.25 |
| CloudFront | <100 GB transfer | ~$5 |
| NAT Gateway | 1 gateway + data | ~$35 |
| **Total** | | **~$580/mo** |

Per-sandbox cost: ~$0.03/hr per VM (host cost / max VMs). A 1-hour coding session costs ~$0.03.

Optimizations:
- **Reserved Instances:** ~30% savings on EC2 ($350/mo vs $500)
- **Spot instances:** ~70% savings for sandbox hosts (if tolerant to interruption)
- **Scale to zero:** No sandbox hosts running when idle (cold start penalty: ~1.2s first boot)

---

## Implementation Plan

### Phase 1: Sandbox Manager + Guest Agent (Week 1-2)
- [ ] Go binary: `sandbox-manager` — Firecracker VM lifecycle
- [ ] Go binary: `trifecta-guest-agent` — vsock exec protocol
- [ ] Rootfs builder: Alpine + codex + git + build tools
- [ ] Local testing: Start VMs on MacBook (Linux VM needed for KVM)

### Phase 2: Provider Integration (Week 2-3)
- [ ] `firecrackerProvider.ts` — implements ProviderDriver SPI
- [ ] SandboxManagerClient — REST client for VM provisioning
- [ ] vsock proxy — routes control plane ↔ guest agent

### Phase 3: AWS Infrastructure (Week 3-4)
- [ ] Terraform/CF: VPC, subnets, security groups, ALB, ECS, EC2
- [ ] ECR repos for sandbox-manager and trifecta-guest-agent
- [ ] CI/CD: GitHub Actions → build → push → deploy
- [ ] IAM roles: ECS task role, EC2 instance profile

### Phase 4: Workspace & Session Integration (Week 4-5)
- [ ] S3 workspace push/pull in guest agent
- [ ] DynamoDB session state migration (from SQLite)
- [ ] End-to-end: Pair → Provision VM → Code → Push results

### Phase 5: Web Client & Polish (Week 5-6)
- [ ] Deploy static React app to S3 + CloudFront
- [ ] Update pairing URL to point to cloud backend
- [ ] Load testing, VM density tuning
- [ ] Snapshot pool warmup strategy

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Nested virt perf on c6i | Benchmark KVM overhead (<5% expected). Fallback: .metal instances |
| Cold boot latency (1.2s) | Snapshot pool eliminates after first VM. Acceptable for "Add Environment" flow |
| Codex auth inside VM | Bind-mount host ~/.codex or pass OPENAI_API_KEY as env var |
| VM density limits | Start conservative (10 VMs/host), scale up. Can add more hosts |
| Workspace sync latency | tmpfs in VM, diff-based push. S3 Transfer Acceleration if needed |
| Network isolation bugs | iptables rules tested with nmap. vsock eliminates most network surface |

---

## What's NOT in v2 (yet)

- **Multi-region** — single region, expand later
- **Payments/subscriptions** — free tier only, no billing integration
- **GPU sandboxes** — CPU-only VMs (Firecracker doesn't do GPU passthrough)
- **Persistent VMs** — all VMs ephemeral, state in S3
- **Custom VM images** — one standard rootfs per agent type
- **Auto-scaling sandbox hosts** — manual scaling initially
