-- 0016: On-chain USDC billing (pay-to-extend).
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces the Stripe path for the Nigeria-based founder: customers pay USDC on
-- Solana; the server verifies the transaction on-chain and extends the org's
-- subscription period. No on-chain program, no recurring auto-pull — when
-- current_period_end lapses, enforcement falls back to the free plan until the
-- next payment. Each payment is recorded by its (unique) tx signature, which
-- makes applying a payment idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE billing_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  plan              TEXT NOT NULL CHECK (plan IN ('pro', 'enterprise')),
  interval          TEXT NOT NULL CHECK (interval IN ('monthly', 'annual')),
  amount_base_units BIGINT NOT NULL,          -- USDC, 6 decimals (29 USDC = 29000000)
  tx_signature      TEXT NOT NULL UNIQUE,     -- Solana tx signature; UNIQUE = idempotent
  payer_wallet      TEXT,                     -- best-effort, informational
  period_start      TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_payments_org_idx ON billing_payments (org_id, created_at DESC);

ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;

-- Org owners can read their own payment history; all writes go through service role.
CREATE POLICY "billing_payments_select_owner" ON billing_payments
  FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM organizations
      WHERE owner_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
    )
  );

CREATE POLICY "billing_payments_service_all" ON billing_payments
  FOR ALL
  USING (auth.role() = 'service_role');
