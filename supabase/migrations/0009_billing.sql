-- 0009_billing.sql
-- Phase 4: Stripe subscription billing — adds subscription state to organisations.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── subscription state on organizations ─────────────────────────────────────
-- stripe_customer_id is already added in 0008 — add subscription columns.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_price_id          TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT
    CHECK (subscription_status IN (
      'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete',
      'incomplete_expired', 'paused'
    )),
  ADD COLUMN IF NOT EXISTS current_period_end       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false;

-- ─── usage_snapshots ─────────────────────────────────────────────────────────
-- Monthly metered-usage snapshots used for plan enforcement and billing display.

CREATE TABLE usage_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  events_ingested   BIGINT NOT NULL DEFAULT 0,
  beta_testers_peak INTEGER NOT NULL DEFAULT 0,
  crash_reports     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, period_start)
);

CREATE INDEX usage_snapshots_org_period_idx ON usage_snapshots (org_id, period_start DESC);

ALTER TABLE usage_snapshots ENABLE ROW LEVEL SECURITY;

-- Org members can read their own usage snapshots.
CREATE POLICY "usage_snapshots_select_member" ON usage_snapshots
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE publisher_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
        AND joined_at IS NOT NULL
    )
  );

-- Only service role writes usage snapshots.
CREATE POLICY "usage_snapshots_service_all" ON usage_snapshots
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
