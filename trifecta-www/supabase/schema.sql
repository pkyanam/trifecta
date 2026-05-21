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
