-- ─────────────────────────────────────────────────────────────────────────────
-- 0010: Organisation activity log + API key scopes
--
-- Changes:
--   1. org_activity_log   — immutable audit log per organisation
--   2. api_keys.org_id    — FK to organisations (backfill path)
--   3. api_keys.scopes    — TEXT[] with CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. org_activity_log ──────────────────────────────────────────────────────

CREATE TABLE org_activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- The org_member who performed the action (null = system/webhook)
  actor_id      UUID REFERENCES org_members (id) ON DELETE SET NULL,
  -- SCREAMING_SNAKE_CASE action verb, e.g. INVITE_SENT, API_KEY_CREATED
  action        TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  -- What kind of entity was affected: api_key | member | track | org | billing
  entity_type   TEXT NOT NULL CHECK (entity_type IN (
                  'api_key', 'member', 'beta_track', 'org', 'billing', 'release'
                )),
  -- UUID of the affected entity (nullable — org-level actions have no single entity)
  entity_id     UUID,
  -- Optional extra context (non-sensitive only — no secrets, no wallet addresses)
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the two main query patterns: latest events for an org, actor history
CREATE INDEX org_activity_log_org_id_idx     ON org_activity_log (org_id, created_at DESC);
CREATE INDEX org_activity_log_actor_id_idx   ON org_activity_log (actor_id);

ALTER TABLE org_activity_log ENABLE ROW LEVEL SECURITY;

-- Members of the org can read the activity log; only service_role can insert.
CREATE POLICY "org_activity_log_select_members" ON org_activity_log
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      JOIN publishers p ON p.id::TEXT = auth.uid()::TEXT
      WHERE om.publisher_id = p.id
        AND om.joined_at IS NOT NULL
    )
  );

CREATE POLICY "org_activity_log_service_all" ON org_activity_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 2. api_keys — add org_id + scopes ───────────────────────────────────────

-- org_id: ties an API key to an organisation (nullable for legacy publisher-only keys)
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS api_keys_org_id_idx ON api_keys (org_id);

-- scopes: controls what the key is allowed to do.
-- Valid scope values:
--   beta:read         read beta tracks and tester lists
--   beta:write        create/manage beta tracks (upload, invite, close)
--   analytics:read    read analytics events and aggregates
--   events:write      ingest analytics events (used by SDK / ingest worker)
--   crashes:write     ingest crash reports
--   releases:write    create and manage releases
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}'
    CHECK (
      scopes <@ ARRAY[
        'beta:read',
        'beta:write',
        'analytics:read',
        'events:write',
        'crashes:write',
        'releases:write'
      ]::TEXT[]
    );
