-- Run this in your Supabase project:
-- Dashboard → SQL Editor → New Query → paste this → Run

-- ── Sandboxes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sandboxes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL,       -- Clerk userId
  name               TEXT NOT NULL,
  tier               TEXT NOT NULL DEFAULT 'starter',
  daytona_sandbox_id TEXT,
  status             TEXT NOT NULL DEFAULT 'creating',
  pairing_token      TEXT,
  volume_id          TEXT,
  trifecta_url       TEXT,
  terminal_url       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sandboxes_user_id_idx ON sandboxes (user_id);
CREATE INDEX IF NOT EXISTS sandboxes_status_idx  ON sandboxes (status);

-- ── User roles ─────────────────────────────────────────────────────────────
-- role: 'admin' | 'guest'  (default guest — omitted rows are treated as guest)

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    TEXT PRIMARY KEY,            -- Clerk userId
  role       TEXT NOT NULL DEFAULT 'guest'
                   CHECK (role IN ('admin', 'guest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
