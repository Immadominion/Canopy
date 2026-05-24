-- Migration 0002: Analytics events (TimescaleDB hypertable) and crash reports

-- ─── Prerequisite: TimescaleDB extension ───

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─── analytics_events ───
-- TimescaleDB hypertable partitioned by timestamp.
-- ALWAYS include a time-range filter in queries — never full table scan.

CREATE TABLE analytics_events (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  app_id              UUID NOT NULL,  -- denormalized for query performance
  name                TEXT NOT NULL,
  wallet_hash         TEXT NOT NULL,  -- SHA-256 hex — never plaintext
  session_id          TEXT,
  properties          JSONB,
  sdk_version         TEXT,
  app_version         TEXT,
  platform            TEXT,
  is_seeker           BOOLEAN,
  has_genesis_token   BOOLEAN,
  skr_balance_tier    TEXT
                      CHECK (skr_balance_tier IN ('none', 'low', 'medium', 'high')),
  timestamp           TIMESTAMPTZ NOT NULL,  -- partition key
  PRIMARY KEY (id, timestamp)
);

CREATE INDEX analytics_events_app_id_ts_idx
  ON analytics_events (app_id, timestamp DESC);

CREATE INDEX analytics_events_wallet_hash_idx
  ON analytics_events (wallet_hash, timestamp DESC);

CREATE INDEX analytics_events_name_idx
  ON analytics_events (name, timestamp DESC);

-- Convert to hypertable — partition by week
SELECT create_hypertable(
  'analytics_events',
  'timestamp',
  chunk_time_interval => INTERVAL '7 days'
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Only service role inserts events (via ingest worker)
CREATE POLICY "analytics_events_insert_service" ON analytics_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Publishers can query their own app's events
CREATE POLICY "analytics_events_select_own" ON analytics_events
  FOR SELECT
  USING (app_id IN (
    SELECT a.id FROM apps a
    INNER JOIN publishers p ON a.publisher_id = p.id
    WHERE auth.uid()::TEXT = p.id::TEXT
  ));

-- ─── Continuous aggregates for dashboard queries ───

-- Daily active wallets per app
CREATE MATERIALIZED VIEW analytics_daw_daily
WITH (timescaledb.continuous) AS
SELECT
  app_id,
  time_bucket('1 day', timestamp) AS bucket,
  COUNT(DISTINCT wallet_hash) AS distinct_wallets,
  COUNT(*) AS event_count
FROM analytics_events
GROUP BY app_id, time_bucket('1 day', timestamp)
WITH NO DATA;

-- Seeker vs non-Seeker breakdown per day
CREATE MATERIALIZED VIEW analytics_seeker_daily
WITH (timescaledb.continuous) AS
SELECT
  app_id,
  time_bucket('1 day', timestamp) AS bucket,
  COALESCE(is_seeker, false) AS is_seeker,
  COUNT(DISTINCT wallet_hash) AS distinct_wallets
FROM analytics_events
GROUP BY app_id, time_bucket('1 day', timestamp), COALESCE(is_seeker, false)
WITH NO DATA;

-- Add refresh policies (keep 90 days of continuous aggregates)
SELECT add_continuous_aggregate_policy('analytics_daw_daily',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_continuous_aggregate_policy('analytics_seeker_daily',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- Data retention: keep raw events for 90 days, aggregates for 2 years
SELECT add_retention_policy('analytics_events', INTERVAL '90 days');

-- ─── crash_reports ───

CREATE TABLE crash_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL,
  fingerprint       TEXT NOT NULL,    -- deduplication key
  error_message     TEXT NOT NULL,
  stack_trace       TEXT NOT NULL,
  wallet_hash       TEXT,             -- optional — crash may occur before wallet connect
  app_version       TEXT,
  sdk_version       TEXT,
  device_model      TEXT,
  android_version   TEXT,
  occurrence_count  INTEGER NOT NULL DEFAULT 1,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, fingerprint)
);

CREATE INDEX crash_reports_app_id_idx ON crash_reports (app_id);
CREATE INDEX crash_reports_fingerprint_idx ON crash_reports (app_id, fingerprint);
CREATE INDEX crash_reports_last_seen_idx ON crash_reports (app_id, last_seen_at DESC);
CREATE INDEX crash_reports_unresolved_idx ON crash_reports (app_id, last_seen_at DESC)
  WHERE resolved_at IS NULL;

CREATE TRIGGER crash_reports_updated_at
  BEFORE UPDATE ON crash_reports
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE crash_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crash_reports_select_own" ON crash_reports
  FOR SELECT
  USING (app_id IN (
    SELECT a.id FROM apps a
    INNER JOIN publishers p ON a.publisher_id = p.id
    WHERE auth.uid()::TEXT = p.id::TEXT
  ));

CREATE POLICY "crash_reports_service_all" ON crash_reports
  FOR ALL
  USING (auth.role() = 'service_role');
