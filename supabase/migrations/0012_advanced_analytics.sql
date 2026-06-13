-- ─────────────────────────────────────────────────────────────────────────────
-- 0012: Advanced Analytics — Funnel definitions, webhook endpoints/deliveries
--       + SQL helper functions for funnel analysis and retention curves.
--
-- Changes:
--   1. funnel_definitions     — saved funnel queries (steps definition)
--   2. webhook_endpoints      — customer webhook receiver configs
--   3. webhook_deliveries     — delivery queue with retry state
--   4. RPC: get_funnel_counts — execute a funnel analysis
--   5. RPC: get_retention     — execute a retention curve query
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. funnel_definitions ────────────────────────────────────────────────────

CREATE TABLE funnel_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Array of step objects: [{ "event_name": "app_open", "label": "App Open" }, ...]
  steps       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX funnel_definitions_app_id_idx ON funnel_definitions (app_id);

CREATE TRIGGER funnel_definitions_updated_at
  BEFORE UPDATE ON funnel_definitions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE funnel_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "funnel_definitions_publisher_all" ON funnel_definitions
  FOR ALL
  USING (
    app_id IN (
      SELECT a.id FROM apps a
      JOIN publishers p ON p.id = a.publisher_id
      WHERE p.id::TEXT = auth.uid()::TEXT
    )
  );

CREATE POLICY "funnel_definitions_org_members_select" ON funnel_definitions
  FOR SELECT
  USING (
    app_id IN (
      SELECT a.id FROM apps a
      JOIN org_members om ON om.org_id = a.org_id
      JOIN publishers p ON p.id::TEXT = auth.uid()::TEXT
      WHERE om.publisher_id = p.id
        AND om.joined_at IS NOT NULL
    )
  );

CREATE POLICY "funnel_definitions_service_all" ON funnel_definitions
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 2. webhook_endpoints ─────────────────────────────────────────────────────

CREATE TABLE webhook_endpoints (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id         UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  url            TEXT NOT NULL CHECK (url LIKE 'https://%'),
  -- Plain-text signing secret. Never expose to client.
  -- Used to compute X-Canopy-Signature header on each delivery.
  signing_secret TEXT NOT NULL,
  -- Which event types to forward. Empty = all events.
  events         TEXT[] NOT NULL DEFAULT '{}',
  enabled        BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_endpoints_app_id_idx ON webhook_endpoints (app_id);

CREATE TRIGGER webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- Only service_role reads webhook secrets — dashboard shows masked URLs only
CREATE POLICY "webhook_endpoints_service_all" ON webhook_endpoints
  FOR ALL
  USING (auth.role() = 'service_role');

-- Publishers see their own endpoints (but signing_secret excluded by app)
CREATE POLICY "webhook_endpoints_publisher_select" ON webhook_endpoints
  FOR SELECT
  USING (
    app_id IN (
      SELECT a.id FROM apps a
      JOIN publishers p ON p.id = a.publisher_id
      WHERE p.id::TEXT = auth.uid()::TEXT
    )
  );

-- ─── 3. webhook_deliveries ────────────────────────────────────────────────────

CREATE TABLE webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id      UUID NOT NULL REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  -- When to next attempt delivery (exponential backoff: 30s, 2m, 10m, 30m, 2h)
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_http_status INTEGER,
  last_error       TEXT,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_deliveries_pending_idx ON webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX webhook_deliveries_endpoint_id_idx ON webhook_deliveries (endpoint_id, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_deliveries_service_all" ON webhook_deliveries
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "webhook_deliveries_publisher_select" ON webhook_deliveries
  FOR SELECT
  USING (
    endpoint_id IN (
      SELECT we.id FROM webhook_endpoints we
      JOIN apps a ON a.id = we.app_id
      JOIN publishers p ON p.id = a.publisher_id
      WHERE p.id::TEXT = auth.uid()::TEXT
    )
  );

-- ─── 4. RPC: get_funnel_counts ────────────────────────────────────────────────
-- Executes a 2-5 step funnel analysis.
-- Returns one row per step: step index, event name, and distinct wallet count.
-- Each step count represents wallets that completed all preceding steps in order.
--
-- Always filters by time range to avoid full hypertable scans.

CREATE OR REPLACE FUNCTION get_funnel_counts(
  _app_id   UUID,
  _steps    TEXT[],        -- ordered array of event names
  _since    TIMESTAMPTZ,
  _until    TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  step_index    INT,
  event_name    TEXT,
  wallet_count  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _step_count INT := array_length(_steps, 1);
  _i          INT;
BEGIN
  -- Validate inputs
  IF _step_count IS NULL OR _step_count < 2 OR _step_count > 5 THEN
    RAISE EXCEPTION 'Funnel requires 2–5 steps, got %', coalesce(_step_count::text, '0');
  END IF;

  -- Build a temp table of wallets completing each step in sequence
  CREATE TEMP TABLE _funnel_wallets_step (
    step_idx     INT,
    wallet_hash  TEXT,
    event_time   TIMESTAMPTZ
  ) ON COMMIT DROP;

  -- Step 0: all wallets that fired step 1 in the window
  INSERT INTO _funnel_wallets_step
  SELECT 0, wallet_hash, min(timestamp)
  FROM analytics_events
  WHERE app_id = _app_id
    AND name   = _steps[1]
    AND timestamp BETWEEN _since AND _until
  GROUP BY wallet_hash;

  -- Steps 1..N-1: wallets that also completed the next step after the previous one
  FOR _i IN 1 .. (_step_count - 1) LOOP
    INSERT INTO _funnel_wallets_step
    SELECT _i, e.wallet_hash, min(e.timestamp)
    FROM analytics_events e
    JOIN _funnel_wallets_step s ON s.wallet_hash = e.wallet_hash AND s.step_idx = _i - 1
    WHERE e.app_id = _app_id
      AND e.name   = _steps[_i + 1]
      AND e.timestamp   > s.event_time
      AND e.timestamp BETWEEN _since AND _until
    GROUP BY e.wallet_hash;
  END LOOP;

  -- Return counts per step
  FOR _i IN 0 .. (_step_count - 1) LOOP
    RETURN QUERY
    SELECT _i, _steps[_i + 1], count(DISTINCT wallet_hash)
    FROM _funnel_wallets_step
    WHERE step_idx = _i;
  END LOOP;
END;
$$;

-- ─── 5. RPC: get_retention ────────────────────────────────────────────────────
-- Returns a day-0 to day-N retention curve.
-- Cohort: all wallets first seen in the window.
-- Returns: day offset + count of wallets that returned that day.

CREATE OR REPLACE FUNCTION get_retention(
  _app_id     UUID,
  _since      TIMESTAMPTZ,
  _until      TIMESTAMPTZ DEFAULT now(),
  _max_days   INT         DEFAULT 30
)
RETURNS TABLE (
  day_offset   INT,
  wallet_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH cohort AS (
  -- Wallets first seen in the window (day 0 = first event in window)
  SELECT wallet_hash, date_trunc('day', min(timestamp)) AS cohort_day
  FROM analytics_events
  WHERE app_id = _app_id
    AND timestamp BETWEEN _since AND _until
  GROUP BY wallet_hash
),
activity AS (
  -- All active days for those wallets in the window
  SELECT DISTINCT e.wallet_hash, date_trunc('day', e.timestamp) AS active_day
  FROM analytics_events e
  JOIN cohort c ON c.wallet_hash = e.wallet_hash
  WHERE e.app_id = _app_id
    AND e.timestamp BETWEEN _since AND (_until + (_max_days || ' days')::INTERVAL)
),
retention_raw AS (
  SELECT
    (a.active_day::date - c.cohort_day::date) AS day_offset,
    count(DISTINCT a.wallet_hash)             AS wallet_count
  FROM activity a
  JOIN cohort c ON c.wallet_hash = a.wallet_hash
  WHERE (a.active_day - c.cohort_day) >= INTERVAL '0 days'
    AND (a.active_day - c.cohort_day) <= make_interval(days => _max_days)
  GROUP BY 1
)
SELECT day_offset, wallet_count
FROM retention_raw
ORDER BY day_offset;
$$;
