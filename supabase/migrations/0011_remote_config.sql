-- ─────────────────────────────────────────────────────────────────────────────
-- 0011: Remote Config
--
-- Remote Config lets publishers define key/value pairs that the SDK fetches
-- and evaluates at runtime, with optional condition overrides:
--   - Seeker-only flag
--   - App version range
--   - Percentage rollout (deterministic hash-based)
--   - On-chain cohort (minimum SKR balance tier, NFT collection)
--
-- Changes:
--   1. remote_configs       — key/value definitions per app
--   2. remote_config_history — append-only audit log of every change
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. remote_configs ────────────────────────────────────────────────────────

CREATE TABLE remote_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,

  -- The config key. Must be unique per app and URL-safe.
  key         TEXT NOT NULL CHECK (
                key ~ '^[a-zA-Z_][a-zA-Z0-9_\.]{0,98}$'
              ),

  -- Optional human description of what this config controls.
  description TEXT,

  -- The default value returned when no condition matches.
  -- Stored as JSONB so it can represent any scalar type: string, number, boolean, array.
  base_value  JSONB NOT NULL,

  -- Ordered array of condition objects. First match wins.
  -- Each element conforms to the RemoteConfigCondition type.
  --
  -- Condition schema:
  -- {
  --   "type": "seeker_only" | "app_version" | "percentage_rollout" | "on_chain_cohort",
  --   "override_value": <JSONB>,         -- value to return if this condition matches
  --   -- type-specific params:
  --   "percentage": 0-100,               -- for percentage_rollout
  --   "operator": "gte"|"lte"|"eq",      -- for app_version
  --   "version": "1.2.3",                -- for app_version
  --   "min_skr_tier": 1|2|3|4,           -- for on_chain_cohort
  --   "nft_collection": "<mint_address>" -- for on_chain_cohort (not yet confirmed)
  -- }
  conditions  JSONB NOT NULL DEFAULT '[]',

  enabled     BOOLEAN NOT NULL DEFAULT true,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (app_id, key)
);

CREATE INDEX remote_configs_app_id_idx ON remote_configs (app_id);

CREATE TRIGGER remote_configs_updated_at
  BEFORE UPDATE ON remote_configs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE remote_configs ENABLE ROW LEVEL SECURITY;

-- Publishers can manage configs for their own apps.
CREATE POLICY "remote_configs_publisher_all" ON remote_configs
  FOR ALL
  USING (
    app_id IN (
      SELECT a.id FROM apps a
      JOIN publishers p ON p.id = a.publisher_id
      WHERE p.id::TEXT = auth.uid()::TEXT
    )
  );

-- Org members (any role) can read configs for apps in their org.
CREATE POLICY "remote_configs_org_members_select" ON remote_configs
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

CREATE POLICY "remote_configs_service_all" ON remote_configs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 2. remote_config_history ─────────────────────────────────────────────────

CREATE TABLE remote_config_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id           UUID NOT NULL REFERENCES remote_configs (id) ON DELETE CASCADE,
  -- Full snapshot of values before the change (for rollback)
  previous_base_value JSONB NOT NULL,
  previous_conditions JSONB NOT NULL DEFAULT '[]',
  previous_enabled    BOOLEAN NOT NULL,
  -- Who made the change (null = API key / system)
  changed_by          UUID REFERENCES publishers (id) ON DELETE SET NULL,
  change_note         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX remote_config_history_config_id_idx ON remote_config_history (config_id, created_at DESC);

ALTER TABLE remote_config_history ENABLE ROW LEVEL SECURITY;

-- Same visibility as remote_configs
CREATE POLICY "remote_config_history_publisher_select" ON remote_config_history
  FOR SELECT
  USING (
    config_id IN (
      SELECT rc.id FROM remote_configs rc
      JOIN apps a ON a.id = rc.app_id
      JOIN publishers p ON p.id = a.publisher_id
      WHERE p.id::TEXT = auth.uid()::TEXT
    )
  );

CREATE POLICY "remote_config_history_service_all" ON remote_config_history
  FOR ALL
  USING (auth.role() = 'service_role');
