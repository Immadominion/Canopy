-- ─────────────────────────────────────────────────────────────────────────────
-- 0013: NFT cohort analytics + session_id index + event-properties RPC
--
-- Changes:
--   1. analytics_nft_daily  — continuous aggregate for has_genesis_token breakdown
--   2. session_id index on analytics_events for session detail queries
--   3. RPC: get_nft_cohorts         — NFT holder vs non-holder wallet counts
--   4. RPC: get_event_properties    — top property keys for a given event name
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. analytics_nft_daily ──────────────────────────────────────────────────
-- Continuous aggregate: distinct wallets per day broken down by has_genesis_token.
-- Mirrors the pattern of analytics_seeker_daily (by is_seeker).

CREATE MATERIALIZED VIEW analytics_nft_daily
WITH (timescaledb.continuous) AS
SELECT
  app_id,
  time_bucket('1 day', timestamp)                          AS bucket,
  COALESCE(has_genesis_token, FALSE)                       AS has_genesis_token,
  COUNT(DISTINCT wallet_hash)::BIGINT                      AS distinct_wallets
FROM analytics_events
GROUP BY app_id, time_bucket('1 day', timestamp), COALESCE(has_genesis_token, FALSE)
WITH NO DATA;

-- Refresh policy: keep aggregate up to date in near-real-time
SELECT add_continuous_aggregate_policy(
  'analytics_nft_daily',
  start_offset  => INTERVAL '3 days',
  end_offset    => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);


-- ─── 2. session_id index ─────────────────────────────────────────────────────
-- Allows efficient filtering of analytics_events by session_id within a time
-- range (TimescaleDB prunes chunks via timestamp; session_id is then filtered).

CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx
  ON analytics_events (session_id, timestamp DESC);


-- ─── 3. get_nft_cohorts ──────────────────────────────────────────────────────
-- Returns distinct wallet counts split by has_genesis_token for a time window.
-- Used for the "NFT Collection Holders" cohort filter on the analytics dashboard.

CREATE OR REPLACE FUNCTION get_nft_cohorts(
  _app_id UUID,
  _since   TIMESTAMPTZ
)
RETURNS TABLE (
  has_genesis_token  BOOLEAN,
  distinct_wallets   BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(has_genesis_token, FALSE) AS has_genesis_token,
    COUNT(DISTINCT wallet_hash)::BIGINT AS distinct_wallets
  FROM analytics_events
  WHERE app_id    = _app_id
    AND timestamp >= _since
  GROUP BY COALESCE(has_genesis_token, FALSE)
  ORDER BY COALESCE(has_genesis_token, FALSE) DESC;  -- TRUE first
$$;


-- ─── 4. get_event_properties ─────────────────────────────────────────────────
-- For a specific event name, returns the top N most frequently appearing
-- property keys from the JSONB `properties` column, along with occurrence
-- count and up to 5 distinct sample values (as a JSONB array).
--
-- Used by the Event Properties Explorer dashboard page.
-- The time-range filter is mandatory — analytics_events is a hypertable.

CREATE OR REPLACE FUNCTION get_event_properties(
  _app_id      UUID,
  _event_name  TEXT,
  _since       TIMESTAMPTZ,
  _limit       INT DEFAULT 10
)
RETURNS TABLE (
  property_key     TEXT,
  occurrence_count BIGINT,
  sample_values    JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH raw_keys AS (
    -- Unnest all top-level JSONB keys from the properties column.
    -- Only includes events that have a non-null properties object.
    SELECT
      kv.key                    AS property_key,
      kv.value                  AS property_value
    FROM analytics_events ae,
         LATERAL jsonb_each(ae.properties) kv
    WHERE ae.app_id    = _app_id
      AND ae.name      = _event_name
      AND ae.timestamp >= _since
      AND ae.properties IS NOT NULL
  ),
  key_counts AS (
    SELECT
      property_key,
      COUNT(*)::BIGINT                                          AS occurrence_count,
      jsonb_agg(DISTINCT property_value) FILTER (
        WHERE property_value IS NOT NULL
      )                                                         AS all_values
    FROM raw_keys
    GROUP BY property_key
    ORDER BY occurrence_count DESC
    LIMIT _limit
  )
  SELECT
    property_key,
    occurrence_count,
    -- Trim sample_values to at most 5 entries to keep payloads small
    CASE
      WHEN jsonb_array_length(all_values) > 5
        THEN (
          SELECT jsonb_agg(v)
          FROM (
            SELECT v
            FROM jsonb_array_elements(all_values) AS t(v)
            LIMIT 5
          ) sq
        )
      ELSE all_values
    END AS sample_values
  FROM key_counts
  ORDER BY occurrence_count DESC;
$$;
