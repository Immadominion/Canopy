-- ─────────────────────────────────────────────────────────────────────────────
-- 0007_analytics_rpcs.sql
-- Analytics RPC functions for dashboard computed queries.
--
-- These are called from the analytics dashboard page via supabase.rpc().
-- All functions query analytics_events (TimescaleDB hypertable) with a
-- mandatory time-range filter so TimescaleDB can prune chunks.
-- SECURITY INVOKER — RLS on analytics_events handles tenant isolation.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── get_top_events ──────────────────────────────────────────────────────────
-- Returns the top N event names by count for an app in a time window.
-- Percentage is calculated relative to the top-N subset total, not global total.

CREATE OR REPLACE FUNCTION get_top_events(
  _app_id UUID,
  _since   TIMESTAMPTZ,
  _limit   INT DEFAULT 10
)
RETURNS TABLE (
  event_name   TEXT,
  event_count  BIGINT,
  pct          NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT
      name                AS event_name,
      COUNT(*)::BIGINT    AS event_count
    FROM analytics_events
    WHERE app_id  = _app_id
      AND timestamp >= _since
    GROUP BY name
    ORDER BY event_count DESC
    LIMIT _limit
  ),
  total AS (
    SELECT COALESCE(SUM(event_count), 1) AS total_cnt
    FROM counts
  )
  SELECT
    c.event_name,
    c.event_count,
    ROUND(c.event_count * 100.0 / t.total_cnt, 1) AS pct
  FROM counts c, total t
  ORDER BY c.event_count DESC;
$$;


-- ─── get_mwa_funnel ──────────────────────────────────────────────────────────
-- Returns distinct wallet counts per MWA lifecycle step for a funnel chart.
-- Steps are returned in funnel order (connected → session → signed).

CREATE OR REPLACE FUNCTION get_mwa_funnel(
  _app_id UUID,
  _since   TIMESTAMPTZ
)
RETURNS TABLE (
  step          TEXT,
  wallet_count  BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    name                              AS step,
    COUNT(DISTINCT wallet_hash)::BIGINT AS wallet_count
  FROM analytics_events
  WHERE app_id    = _app_id
    AND timestamp >= _since
    AND name IN (
      'mwa_wallet_connected',
      'mwa_session_start',
      'mwa_transaction_signed'
    )
  GROUP BY name
  ORDER BY CASE name
    WHEN 'mwa_wallet_connected'   THEN 1
    WHEN 'mwa_session_start'      THEN 2
    WHEN 'mwa_transaction_signed' THEN 3
    ELSE 4
  END;
$$;


-- ─── get_skr_tiers ───────────────────────────────────────────────────────────
-- Returns distinct wallet counts per SKR balance tier for cohort analysis.
-- Tier order: high → medium → low → none.

CREATE OR REPLACE FUNCTION get_skr_tiers(
  _app_id UUID,
  _since   TIMESTAMPTZ
)
RETURNS TABLE (
  tier          TEXT,
  wallet_count  BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(skr_balance_tier, 'none') AS tier,
    COUNT(DISTINCT wallet_hash)::BIGINT  AS wallet_count
  FROM analytics_events
  WHERE app_id    = _app_id
    AND timestamp >= _since
  GROUP BY COALESCE(skr_balance_tier, 'none')
  ORDER BY CASE COALESCE(skr_balance_tier, 'none')
    WHEN 'high'   THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low'    THEN 3
    WHEN 'none'   THEN 4
    ELSE 5
  END;
$$;


-- ─── Permissions ─────────────────────────────────────────────────────────────
-- authenticated: used by dashboard sessions (respects RLS via SECURITY INVOKER)
-- service_role:  used by server-side admin client (bypasses RLS as normal)

GRANT EXECUTE ON FUNCTION get_top_events(UUID, TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_events(UUID, TIMESTAMPTZ, INT) TO service_role;

GRANT EXECUTE ON FUNCTION get_mwa_funnel(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mwa_funnel(UUID, TIMESTAMPTZ) TO service_role;

GRANT EXECUTE ON FUNCTION get_skr_tiers(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_skr_tiers(UUID, TIMESTAMPTZ) TO service_role;
