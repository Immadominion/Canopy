-- 0015: Publisher verification status + manual access-request flow
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 of the publisher gate: SIWS proves wallet control; a human (the
-- founder) approves access out-of-band via Telegram. Approval flips
-- verification_status -> 'approved' AND kyc_verified -> true (the latter keeps
-- requireVerifiedPublisher working unchanged). Even approved publishers remain
-- bound by the hard caps (200 testers, 30-day expiry) so a wrongly-approved
-- account can never become a distribution channel.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── publishers.verification_status ───
ALTER TABLE publishers
  ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'approved', 'rejected', 'banned'));

-- Any publisher already KYC-verified is treated as approved.
UPDATE publishers SET verification_status = 'approved' WHERE kyc_verified = true;

-- ─── access_requests ───
-- One row per "please let me in" submission. Bound to a publisher (wallet).
CREATE TABLE access_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id     UUID NOT NULL REFERENCES publishers (id) ON DELETE CASCADE,
  wallet_hash      TEXT NOT NULL,                 -- denormalized for logging/lookup
  display_name     TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  project_summary  TEXT NOT NULL CHECK (char_length(project_summary) BETWEEN 1 AND 2000),
  contact_telegram TEXT CHECK (contact_telegram IS NULL OR char_length(contact_telegram) <= 64),
  code             TEXT NOT NULL UNIQUE,          -- short human code shown to user + founder
  onchain_app_nft  BOOLEAN,                       -- on-chain App-NFT snapshot at request time (null = unknown)
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at       TIMESTAMPTZ,
  decided_by       TEXT,                          -- 'wallet:<hash>' or 'telegram:<chat_id>'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX access_requests_publisher_id_idx ON access_requests (publisher_id);
CREATE INDEX access_requests_status_idx ON access_requests (status, created_at DESC);

-- At most one OPEN (pending) request per publisher — blocks spam + races.
CREATE UNIQUE INDEX access_requests_one_pending_per_publisher
  ON access_requests (publisher_id) WHERE status = 'pending';

CREATE TRIGGER access_requests_updated_at
  BEFORE UPDATE ON access_requests
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Publishers can read their own requests; all writes go through the service role.
CREATE POLICY "access_requests_select_own" ON access_requests
  FOR SELECT
  USING (publisher_id IN (
    SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT
  ));

CREATE POLICY "access_requests_service_all" ON access_requests
  FOR ALL
  USING (auth.role() = 'service_role');
