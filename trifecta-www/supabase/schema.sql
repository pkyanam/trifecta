-- Run this in your Supabase project:
-- Dashboard -> SQL Editor -> New Query -> paste this -> Run

-- ── Sandboxes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sandboxes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL,
  name               TEXT NOT NULL,
  tier               TEXT NOT NULL DEFAULT 'launch',
  disk_gib           INTEGER NOT NULL DEFAULT 10,
  daytona_sandbox_id TEXT,
  status             TEXT NOT NULL DEFAULT 'creating',
  pairing_token      TEXT,
  volume_id          TEXT,
  trifecta_url       TEXT,
  terminal_url       TEXT,
  started_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS disk_gib INTEGER NOT NULL DEFAULT 10;

ALTER TABLE sandboxes
  ALTER COLUMN tier SET DEFAULT 'launch';

UPDATE sandboxes
SET tier = CASE tier
  WHEN 'starter' THEN 'launch'
  WHEN 'pro' THEN 'build'
  WHEN 'team' THEN 'max-cpu'
  ELSE tier
END
WHERE tier IN ('starter', 'pro', 'team');

CREATE INDEX IF NOT EXISTS sandboxes_user_id_idx ON sandboxes (user_id);
CREATE INDEX IF NOT EXISTS sandboxes_status_idx  ON sandboxes (status);

-- ── User roles ─────────────────────────────────────────────────────────────
-- role: 'admin' | 'guest'  (default guest — omitted rows are treated as guest)

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    TEXT PRIMARY KEY,
  role       TEXT NOT NULL DEFAULT 'guest'
                   CHECK (role IN ('admin', 'guest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- God mode admin:
-- INSERT INTO user_roles (user_id, role)
-- VALUES ('user_3E0JHKVeJ128gR8OAEeS8XpvgvN', 'admin')
-- ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- ── Cloud accounts / subscriptions ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cloud_accounts (
  user_id                    TEXT PRIMARY KEY,
  plan                       TEXT CHECK (plan IN ('free', 'starter', 'pro', 'team')),
  subscription_status        TEXT NOT NULL DEFAULT 'none'
                                   CHECK (subscription_status IN (
                                     'none',
                                     'incomplete',
                                     'incomplete_expired',
                                     'trialing',
                                     'active',
                                     'past_due',
                                     'canceled',
                                     'unpaid',
                                     'paused'
                                   )),
  stripe_customer_id         TEXT UNIQUE,
  stripe_subscription_id     TEXT UNIQUE,
  current_period_end         TIMESTAMPTZ,
  cancel_at_period_end       BOOLEAN NOT NULL DEFAULT false,
  runtime_credits_monthly    INTEGER NOT NULL DEFAULT 0,
  runtime_credits_used       REAL NOT NULL DEFAULT 0,
  running_sandbox_limit      INTEGER NOT NULL DEFAULT 0,
  stored_sandbox_limit       INTEGER NOT NULL DEFAULT 0,
  gpu_enabled                BOOLEAN NOT NULL DEFAULT false,
  idle_timeout_minutes       INTEGER NOT NULL DEFAULT 15,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS runtime_credits_used REAL NOT NULL DEFAULT 0;
ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER NOT NULL DEFAULT 15;

ALTER TABLE cloud_accounts
  DROP CONSTRAINT IF EXISTS cloud_accounts_plan_check;

ALTER TABLE cloud_accounts
  ADD CONSTRAINT cloud_accounts_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'team'));

CREATE INDEX IF NOT EXISTS cloud_accounts_customer_idx
  ON cloud_accounts (stripe_customer_id);

CREATE INDEX IF NOT EXISTS cloud_accounts_subscription_idx
  ON cloud_accounts (stripe_subscription_id);

-- Checkout sessions let the app recover the selected user/plan from Stripe
-- webhooks even when the account does not yet have a subscription.
CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  stripe_checkout_session_id TEXT PRIMARY KEY,
  user_id                    TEXT NOT NULL,
  plan                       TEXT NOT NULL CHECK (plan IN ('starter', 'pro', 'team')),
  stripe_customer_id         TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_checkout_sessions_user_id_idx
  ON billing_checkout_sessions (user_id);

-- ── Credit increment RPC ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_credits_used(p_user_id TEXT, p_credits REAL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cloud_accounts
  SET runtime_credits_used = runtime_credits_used + p_credits,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- ── auto-update updated_at ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON sandboxes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON sandboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_cloud_accounts_updated_at ON cloud_accounts;
CREATE TRIGGER set_cloud_accounts_updated_at
  BEFORE UPDATE ON cloud_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- TRIAD GATEWAY  (separate service: ~/projects/trifecta-cloud-ai)
-- Isolated in its own `triad` schema so it stays out of the Supabase auto REST
-- API and never collides with the tables above. The gateway also creates these
-- idempotently on boot; this block keeps them documented/managed here.
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS triad;

-- Subscribers (one row per founder-access account).
CREATE TABLE IF NOT EXISTS triad.accounts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  TEXT NOT NULL UNIQUE,
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'active',  -- active | past_due | canceled | waitlisted
  monthly_cap_usd        NUMERIC(12,6) NOT NULL DEFAULT 23.50,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API keys (only a sha256 hash + display prefix are stored; raw shown once).
CREATE TABLE IF NOT EXISTS triad.api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES triad.accounts(id) ON DELETE CASCADE,
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS triad_api_keys_account_idx ON triad.api_keys(account_id);

-- Usage allocation per billing cycle (the row the hard cap reads/updates).
CREATE TABLE IF NOT EXISTS triad.usage_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES triad.accounts(id) ON DELETE CASCADE,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  used_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, period_start)
);
CREATE INDEX IF NOT EXISTS triad_usage_periods_lookup_idx
  ON triad.usage_periods(account_id, period_start);

-- Append-only audit trail.
CREATE TABLE IF NOT EXISTS triad.request_logs (
  id            BIGSERIAL PRIMARY KEY,
  account_id    UUID NOT NULL REFERENCES triad.accounts(id) ON DELETE CASCADE,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  surface       TEXT NOT NULL,           -- openai | anthropic
  model         TEXT NOT NULL,
  provider      TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
  status        INTEGER NOT NULL,
  latency_ms    INTEGER,
  error         TEXT,                    -- full upstream error (server-side only)
  finish_reason TEXT,
  tool_calls    INTEGER NOT NULL DEFAULT 0,
  request_json  JSONB,                   -- full prompt (when AUDIT_PROMPTS on)
  response_json JSONB                    -- full completion + tool calls
);
CREATE INDEX IF NOT EXISTS triad_request_logs_account_ts_idx
  ON triad.request_logs(account_id, ts DESC);

-- Price + routing table. Unpriced/disabled models are refused (can't meter).
-- model_id = public alias clients send; upstream_model_id = Bedrock/Mantle id.
CREATE TABLE IF NOT EXISTS triad.model_prices (
  model_id          TEXT PRIMARY KEY,
  upstream_model_id TEXT,
  input_usd_per_1k  NUMERIC(12,8) NOT NULL,
  output_usd_per_1k NUMERIC(12,8) NOT NULL,
  cache_read_per_1k  NUMERIC(12,8),             -- ~0.1x input; null → no discount
  cache_write_per_1k NUMERIC(12,8),             -- ~1.25x input (first-turn write)
  supports_cache    BOOLEAN NOT NULL DEFAULT false,
  display_name      TEXT,
  region            TEXT,                       -- null → gateway default region
  protocol          TEXT NOT NULL DEFAULT 'converse',  -- converse | responses | gemini
  provider          TEXT NOT NULL DEFAULT 'bedrock',
  model_tier        TEXT NOT NULL DEFAULT 'standard',
  sponsored_daily_cap_usd NUMERIC,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-only credit-pool visibility; not a routing dependency.
CREATE TABLE IF NOT EXISTS triad.provider_budgets (
  provider     TEXT PRIMARY KEY,
  starting_usd NUMERIC NOT NULL,
  spent_usd    NUMERIC NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sponsored per-model daily cap counter.
CREATE TABLE IF NOT EXISTS triad.sponsored_daily_spend (
  account_id UUID NOT NULL REFERENCES triad.accounts(id) ON DELETE CASCADE,
  model_id   TEXT NOT NULL,
  day        DATE NOT NULL,
  spent_usd  NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, model_id, day)
);
