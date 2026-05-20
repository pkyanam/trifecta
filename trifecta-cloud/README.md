# Trifecta Cloud Dashboard

A powerful Next.js dashboard for managing Trifecta AI coding agent sandboxes, deployed at `dashboard.trifecta.belweave.com`.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Authentication | Clerk |
| Database | Supabase (PostgreSQL) |
| Compute | Daytona sandboxes |
| Deployment | Vercel |

## Features

- **Clerk auth** — secure sign-in/sign-up with Google, GitHub, email etc.
- **Sandbox management** — create, start, stop, and delete Daytona sandboxes
- **Embedded terminal** — browser-based terminal in every sandbox detail page
- **Pairing QR code** — prominent QR code + URL linking to `app.trifecta.belweave.com` (not the raw Daytona URL)
- **Tiered plans** — Starter, Pro, Team with configurable resources
- **Real-time status** — auto-refreshes sandbox status every 10 s

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create Supabase table

Open your [Supabase SQL Editor](https://supabase.com/dashboard) and run the contents of `supabase/schema.sql`.

### 3. Configure Clerk

```bash
npm install -g clerk
clerk auth login
clerk init
```

Copy the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` that are added to `.env.local`.

### 4. Set environment variables

Copy `.env.example` → `.env.local` and fill in:

```bash
DAYTONA_API_KEY=             # from app.daytona.io
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

### 5. Run locally

```bash
npm run dev
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm run snapshot:create` | Build & publish a new Daytona sandbox snapshot |
| `npm run sandbox:seed` | Create a test sandbox via the Daytona API |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DAYTONA_API_KEY` | ✅ | Daytona API key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret key |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Service role key (bypasses RLS) |
| `NEXT_PUBLIC_TRIFECTA_APP_URL` | optional | Override web app URL (default: `https://app.trifecta.belweave.com`) |
| `TRIFECTA_SNAPSHOT_NAME` | optional | Daytona snapshot name |
| `TRIFECTA_NPM_VERSION` | optional | `@belweave/trifecta` version |

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set custom domain
vercel domains add dashboard.trifecta.belweave.com
```

Add all environment variables in the Vercel project settings (Settings → Environment Variables).

## Cloudflare sandbox proxy (`sbx.belweave.com`)

Browser pairing needs a Worker in front of Daytona preview URLs (CORS + preview warning bypass).
Path-based routing keeps Universal SSL happy: `https://sbx.belweave.com/<sandbox-host>/...`

1. Deploy `cloudflare/sandbox-proxy-worker.js` to the `trifecta-sandbox-proxy` Worker.
2. Route: `sbx.belweave.com/*`
3. DNS: `sbx` → `AAAA` `100::` (Proxied)
4. Set `NEXT_PUBLIC_CF_PROXY_DOMAIN=sbx.belweave.com` on the dashboard (Vercel).

**WebSocket:** the Worker must return the upstream `fetch()` response directly for
`Upgrade: websocket` requests. Do not wrap WebSocket responses in `new Response(body, upstream)`
or the hosted app will pair over HTTP but stay stuck on "Connecting...".
