-- Migration 0019: Accurate active-user counts (DAU / WAU / MAU).
--
-- The summary endpoint previously SUMMED per-day `distinct_wallets` from the
-- analytics_daw_daily aggregate to produce WAU/MAU. Distinct counts are NOT
-- additive: a wallet active 5 days was counted 5×, massively inflating the
-- headline metric (a 30-day MAU could be many times the real number).
--
-- This RPC computes true COUNT(DISTINCT wallet_hash) over each rolling window
-- directly from the raw hypertable, with a mandatory 30-day lower bound so
-- TimescaleDB can prune chunks (matches the conventions in 0007_analytics_rpcs).

CREATE OR REPLACE FUNCTION get_active_wallet_counts(
  _app_id UUID,
  _now    TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  dau BIGINT,
  wau BIGINT,
  mau BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(DISTINCT wallet_hash) FILTER (WHERE timestamp >= _now - INTERVAL '1 day')   AS dau,
    COUNT(DISTINCT wallet_hash) FILTER (WHERE timestamp >= _now - INTERVAL '7 days')  AS wau,
    COUNT(DISTINCT wallet_hash) FILTER (WHERE timestamp >= _now - INTERVAL '30 days') AS mau
  FROM analytics_events
  WHERE app_id = _app_id
    AND timestamp >= _now - INTERVAL '30 days';
$$;
