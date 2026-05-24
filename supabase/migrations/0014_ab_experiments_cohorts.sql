-- ─────────────────────────────────────────────────────────────────────────────
-- 0014: A/B Experiments + Custom On-chain Cohort Builder
--
-- Changes:
--   1. experiments            — A/B test definitions per app
--   2. experiment_variants    — named variants with config overrides per weight
--   3. cohort_definitions     — reusable named on-chain cohort criteria
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. experiments ──────────────────────────────────────────────────────────
-- Each experiment is linked to an app and optionally to a remote_config key.
-- The assignment to a variant is deterministic: hash(wallet_hash || experiment_id)
-- mod total_weight. This means no assignment storage is needed — results are
-- correlated by querying analytics_events where properties->>'ab_experiment_id'
-- equals the experiment id.

CREATE TABLE experiments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID        NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  -- Human-readable name — shown in dashboard and included in analytics events.
  name              TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Optional description / hypothesis for the team.
  description       TEXT        CHECK (description IS NULL OR char_length(description) <= 1000),
  -- Percentage of eligible traffic to include in the experiment (0–100).
  -- Users outside this percentage always receive the base remote-config value.
  traffic_percentage INT        NOT NULL DEFAULT 100 CHECK (traffic_percentage BETWEEN 1 AND 100),
  -- draft → active → concluded (terminal)
  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'active', 'concluded')),
  -- Optional link to the remote_config key this experiment modifies.
  -- When set, the resolved variant value is returned for that config key.
  remote_config_id  UUID        REFERENCES remote_configs (id) ON DELETE SET NULL,
  started_at        TIMESTAMPTZ,
  concluded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX experiments_app_id_idx ON experiments (app_id);
CREATE INDEX experiments_status_idx ON experiments (status);

SELECT trigger_set_updated_at('experiments');

ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiments_publisher_all" ON experiments
  FOR ALL
  USING (
    app_id IN (
      SELECT a.id FROM apps a
      JOIN publishers p ON p.id = a.publisher_id
      WHERE p.id::TEXT = auth.uid()::TEXT
    )
  );

CREATE POLICY "experiments_org_members_select" ON experiments
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

CREATE POLICY "experiments_service_all" ON experiments
  FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 2. experiment_variants ──────────────────────────────────────────────────
-- Each variant defines a name, relative weight, and an optional config value
-- override. The control variant typically has no override (null config_value).
-- Weights are relative integers; a fair 50/50 split would be weight=1 each.
-- Assignment: deterministic_bucket(wallet_hash, experiment_id, total_weight)

CREATE TABLE experiment_variants (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID  NOT NULL REFERENCES experiments (id) ON DELETE CASCADE,
  name            TEXT  NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- Relative weight for traffic split. Default 1 (equal split across variants).
  weight          INT   NOT NULL DEFAULT 1 CHECK (weight >= 1),
  -- JSON value to return for the linked remote_config key when this variant is
  -- assigned. NULL means "use the base remote_config value" (control).
  config_value    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX experiment_variants_experiment_id_idx ON experiment_variants (experiment_id);

ALTER TABLE experiment_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiment_variants_publisher_all" ON experiment_variants
  FOR ALL
  USING (
    experiment_id IN (
      SELECT e.id FROM experiments e
      JOIN apps a ON a.id = e.app_id
      JOIN publishers p ON p.id = a.publisher_id
      WHERE p.id::TEXT = auth.uid()::TEXT
    )
  );

CREATE POLICY "experiment_variants_org_members_select" ON experiment_variants
  FOR SELECT
  USING (
    experiment_id IN (
      SELECT e.id FROM experiments e
      JOIN apps a ON a.id = e.app_id
      JOIN org_members om ON om.org_id = a.org_id
      JOIN publishers p ON p.id::TEXT = auth.uid()::TEXT
      WHERE om.publisher_id = p.id
        AND om.joined_at IS NOT NULL
    )
  );

CREATE POLICY "experiment_variants_service_all" ON experiment_variants
  FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 3. cohort_definitions ───────────────────────────────────────────────────
-- A named, reusable set of on-chain criteria that define a user cohort.
-- Criteria are stored as a JSONB object with the following shape:
--
--   {
--     "operator": "and" | "or",          -- combine conditions (default: "and")
--     "conditions": [
--       { "type": "seeker_only" },
--       { "type": "has_genesis_token" },
--       { "type": "skr_balance_tier", "min_tier": "low" | "medium" | "high" },
--       { "type": "nft_collection",
--         "collection_mint": "<base58 mint address>",
--         "min_count": 1 }              -- wallet must hold >= min_count NFTs
--     ]
--   }
--
-- Supported condition types:
--   seeker_only      — wallet holds a Seeker Genesis Token (matches is_seeker)
--   has_genesis_token — wallet holds any Solana Mobile Genesis Token
--   skr_balance_tier — wallet holds SKR above a balance tier
--   nft_collection   — wallet holds >= min_count NFTs from a given collection
--                      (evaluated on-device by SDK via Helius DAS API,
--                       or server-side during SIWS install gate checks)
--
-- Cohort definitions can be referenced by:
--   1. remote_configs.conditions (on_chain_cohort type with cohort_id)
--   2. Analytics dashboard filters (post-hoc segmentation of stored events)
--   3. Beta track gate checks (evaluated server-side at SIWS time)

CREATE TABLE cohort_definitions (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id    UUID  NOT NULL REFERENCES publishers (id) ON DELETE CASCADE,
  -- Optional app scope — NULL means usable across all publisher apps.
  app_id          UUID  REFERENCES apps (id) ON DELETE CASCADE,
  name            TEXT  NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description     TEXT  CHECK (description IS NULL OR char_length(description) <= 500),
  criteria        JSONB NOT NULL DEFAULT '{"operator":"and","conditions":[]}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cohort_definitions_publisher_id_idx ON cohort_definitions (publisher_id);
CREATE INDEX cohort_definitions_app_id_idx       ON cohort_definitions (app_id);

SELECT trigger_set_updated_at('cohort_definitions');

ALTER TABLE cohort_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cohort_definitions_publisher_all" ON cohort_definitions
  FOR ALL
  USING (
    publisher_id::TEXT = auth.uid()::TEXT
  );

CREATE POLICY "cohort_definitions_org_members_select" ON cohort_definitions
  FOR SELECT
  USING (
    publisher_id IN (
      SELECT om.publisher_id
      FROM org_members om
      JOIN publishers p ON p.id::TEXT = auth.uid()::TEXT
      WHERE om.publisher_id = p.id
        AND om.joined_at IS NOT NULL
    )
  );

CREATE POLICY "cohort_definitions_service_all" ON cohort_definitions
  FOR ALL
  USING (auth.role() = 'service_role');
