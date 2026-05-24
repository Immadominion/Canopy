-- Migration 0001: Initial schema
-- Publishers, apps, beta tracks, testers, install events, API keys, SIWS nonces
-- Every table has RLS enabled — no exceptions.

-- ─── Extensions ───

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- query analytics

-- ─── Updated-at trigger function ───

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── publishers ───

CREATE TABLE publishers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address    TEXT NOT NULL UNIQUE,  -- base58 Solana address
  wallet_hash       TEXT NOT NULL UNIQUE,  -- SHA-256 hex, used for lookups
  kyc_verified      BOOLEAN NOT NULL DEFAULT false,
  kyc_verified_at   TIMESTAMPTZ,
  plan              TEXT NOT NULL DEFAULT 'free'
                    CHECK (plan IN ('free', 'pro', 'enterprise')),
  display_name      TEXT,
  website_url       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER publishers_updated_at
  BEFORE UPDATE ON publishers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;

-- Publishers can read their own row; service role can read all
CREATE POLICY "publishers_select_own" ON publishers
  FOR SELECT
  USING (auth.uid()::TEXT = id::TEXT);

CREATE POLICY "publishers_service_all" ON publishers
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── apps ───

CREATE TABLE apps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id        UUID NOT NULL REFERENCES publishers (id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  package_name        TEXT NOT NULL,          -- e.g. com.example.myapp
  description         TEXT,
  dapp_store_app_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (publisher_id, package_name)
);

CREATE INDEX apps_publisher_id_idx ON apps (publisher_id);

CREATE TRIGGER apps_updated_at
  BEFORE UPDATE ON apps
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apps_select_own" ON apps
  FOR SELECT
  USING (publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "apps_mutate_own" ON apps
  FOR ALL
  USING (publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "apps_service_all" ON apps
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── beta_tracks ───
-- Invariant 2: tester_cap cannot exceed 200 (enforced at DB level)
-- Invariant 3: expires_at NOT NULL (enforced at DB level)

CREATE TABLE beta_tracks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps (id) ON DELETE RESTRICT,
  publisher_id    UUID NOT NULL REFERENCES publishers (id) ON DELETE RESTRICT,
  version_name    TEXT NOT NULL,
  version_code    INTEGER NOT NULL,
  r2_key          TEXT NOT NULL UNIQUE,     -- internal R2 key — never expose
  apk_sha256      TEXT NOT NULL,            -- 64-char lowercase hex
  apk_size_bytes  BIGINT NOT NULL,
  tester_cap      INTEGER NOT NULL DEFAULT 200
                  CHECK (tester_cap > 0 AND tester_cap <= 200),  -- INVARIANT 2
  tester_count    INTEGER NOT NULL DEFAULT 0
                  CHECK (tester_count >= 0),
  status          TEXT NOT NULL DEFAULT 'pending_scan'
                  CHECK (status IN (
                    'pending_scan', 'scan_in_progress', 'scan_failed',
                    'active', 'expired', 'revoked'
                  )),
  release_notes   TEXT,
  arweave_tx_id   TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,     -- INVARIANT 3: never nullable
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Enforce: expires_at <= created_at + 30 days
  CONSTRAINT expires_at_max_30_days
    CHECK (expires_at <= created_at + INTERVAL '30 days'),

  -- Enforce: tester_count <= tester_cap
  CONSTRAINT tester_count_within_cap
    CHECK (tester_count <= tester_cap)
);

CREATE INDEX beta_tracks_app_id_idx ON beta_tracks (app_id);
CREATE INDEX beta_tracks_publisher_id_idx ON beta_tracks (publisher_id);
CREATE INDEX beta_tracks_status_expires_at_idx ON beta_tracks (status, expires_at);

CREATE TRIGGER beta_tracks_updated_at
  BEFORE UPDATE ON beta_tracks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE beta_tracks ENABLE ROW LEVEL SECURITY;

-- Publishers can only see their own tracks
CREATE POLICY "beta_tracks_select_own" ON beta_tracks
  FOR SELECT
  USING (publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "beta_tracks_mutate_own" ON beta_tracks
  FOR ALL
  USING (publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "beta_tracks_service_all" ON beta_tracks
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── beta_testers ───

CREATE TABLE beta_testers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id              UUID NOT NULL REFERENCES beta_tracks (id) ON DELETE CASCADE,
  wallet_hash           TEXT NOT NULL,  -- SHA-256 hex — NEVER plaintext wallet
  added_by_publisher_id UUID NOT NULL REFERENCES publishers (id),
  arweave_tx_id         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (track_id, wallet_hash)  -- prevent duplicate testers
);

CREATE INDEX beta_testers_track_id_idx ON beta_testers (track_id);
CREATE INDEX beta_testers_wallet_hash_idx ON beta_testers (wallet_hash);

ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beta_testers_select_own_publisher" ON beta_testers
  FOR SELECT
  USING (added_by_publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "beta_testers_mutate_own_publisher" ON beta_testers
  FOR ALL
  USING (added_by_publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "beta_testers_service_all" ON beta_testers
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── install_events ───

CREATE TABLE install_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id        UUID NOT NULL REFERENCES beta_tracks (id) ON DELETE CASCADE,
  wallet_hash     TEXT NOT NULL,
  action          TEXT NOT NULL
                  CHECK (action IN ('url_generated', 'download_started', 'install_confirmed')),
  arweave_tx_id   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX install_events_track_id_idx ON install_events (track_id);
CREATE INDEX install_events_wallet_hash_idx ON install_events (wallet_hash);
CREATE INDEX install_events_created_at_idx ON install_events (created_at);

ALTER TABLE install_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "install_events_select_publisher" ON install_events
  FOR SELECT
  USING (track_id IN (
    SELECT id FROM beta_tracks
    WHERE publisher_id IN (
      SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
    )
  ));

CREATE POLICY "install_events_service_all" ON install_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── api_keys ───

CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id    UUID NOT NULL REFERENCES publishers (id) ON DELETE CASCADE,
  app_id          UUID REFERENCES apps (id) ON DELETE CASCADE,  -- null = all apps
  key_prefix      TEXT NOT NULL,    -- first 12 chars (for display + KV lookup)
  key_hash        TEXT NOT NULL,    -- bcrypt hash — plaintext returned only once
  name            TEXT NOT NULL,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_publisher_id_idx ON api_keys (publisher_id);
CREATE INDEX api_keys_key_prefix_idx ON api_keys (key_prefix);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select_own" ON api_keys
  FOR SELECT
  USING (publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "api_keys_mutate_own" ON api_keys
  FOR ALL
  USING (publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "api_keys_service_all" ON api_keys
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── siws_nonces ───

CREATE TABLE siws_nonces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce       TEXT NOT NULL UNIQUE,   -- 64 hex chars
  used        BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX siws_nonces_nonce_idx ON siws_nonces (nonce) WHERE used = false;
CREATE INDEX siws_nonces_expires_at_idx ON siws_nonces (expires_at);

ALTER TABLE siws_nonces ENABLE ROW LEVEL SECURITY;

-- Nonces are service-role only
CREATE POLICY "siws_nonces_service_all" ON siws_nonces
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Tester count enforcement function ───
-- Called by the API to atomically increment tester_count and enforce the cap.

CREATE OR REPLACE FUNCTION increment_tester_count(p_track_id UUID)
RETURNS TABLE (new_count INTEGER, over_cap BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cap INTEGER;
  v_current INTEGER;
BEGIN
  -- Lock the row to prevent races
  SELECT tester_cap, tester_count
    INTO v_cap, v_current
    FROM beta_tracks
    WHERE id = p_track_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  IF v_current >= v_cap THEN
    RETURN QUERY SELECT v_current, TRUE;
    RETURN;
  END IF;

  UPDATE beta_tracks
    SET tester_count = tester_count + 1
    WHERE id = p_track_id;

  RETURN QUERY SELECT v_current + 1, FALSE;
END;
$$;
