-- Migration 0006: Releases table
-- Tracks the lifecycle of a build from beta-tested to dApp Store submitted.
-- Each release record is created by the publisher (via CLI, GitHub Action, or dashboard)
-- and progresses through a status machine ending in published or rejected.

-- ─── releases ───

CREATE TABLE releases (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                    UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  publisher_id              UUID NOT NULL REFERENCES publishers(id),
  -- Optional: the beta track that was tested before this release was cut.
  -- NULL if the publisher is doing a direct release without a beta track.
  beta_track_id             UUID REFERENCES beta_tracks(id) ON DELETE SET NULL,
  version_name              TEXT NOT NULL,
  version_code              INTEGER NOT NULL CHECK (version_code > 0),
  -- SHA-256 hex of the release APK (may differ from the beta APK if re-signed).
  apk_sha256                TEXT,
  -- R2 key of the release APK if uploaded directly (not required if promoting from beta).
  apk_r2_key                TEXT,
  release_notes             TEXT CHECK (char_length(release_notes) <= 2000),
  -- Status machine:
  --   draft            → publisher has initiated the release record
  --   check_pending    → APK check is running (CLI / Action)
  --   check_passed     → all pre-submission checks passed
  --   check_failed     → one or more checks failed; see check_results
  --   submitted        → publisher has submitted to the dApp Store portal
  --   in_review        → dApp Store team is reviewing
  --   published        → live in the dApp Store
  --   rejected         → rejected by the dApp Store; see rejection_reason
  status                    TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN (
                              'draft',
                              'check_pending',
                              'check_passed',
                              'check_failed',
                              'submitted',
                              'in_review',
                              'published',
                              'rejected'
                            )),
  -- JSONB blob of check results from `canopy check` or `@canopy/action-release`.
  -- Schema: { passed: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> }
  check_results             JSONB,
  -- Identifier returned by the dApp Store portal API on submission.
  -- Not yet confirmed — requires research during implementation.
  dapp_store_submission_id  TEXT,
  rejection_reason          TEXT,
  submitted_at              TIMESTAMPTZ,
  published_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: a given app cannot have two releases with the same version_code.
CREATE UNIQUE INDEX releases_app_version_code_unique
  ON releases (app_id, version_code);

CREATE TRIGGER releases_updated_at
  BEFORE UPDATE ON releases
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

-- ─── RLS policies ───

-- Publishers can read their own releases.
CREATE POLICY releases_select
  ON releases FOR SELECT
  USING (
    publisher_id = (
      SELECT id FROM publishers
      WHERE wallet_hash = current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_hash'
    )
  );

-- Publishers can insert releases for their own apps.
CREATE POLICY releases_insert
  ON releases FOR INSERT
  WITH CHECK (
    publisher_id = (
      SELECT id FROM publishers
      WHERE wallet_hash = current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_hash'
    )
    AND app_id IN (
      SELECT id FROM apps WHERE publisher_id = (
        SELECT id FROM publishers
        WHERE wallet_hash = current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_hash'
      )
    )
  );

-- Publishers can update their own releases (e.g. add release notes, cancel submission).
CREATE POLICY releases_update
  ON releases FOR UPDATE
  USING (
    publisher_id = (
      SELECT id FROM publishers
      WHERE wallet_hash = current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_hash'
    )
  );

-- ─── Index for common query patterns ───

CREATE INDEX releases_app_id_status ON releases (app_id, status);
CREATE INDEX releases_app_id_created_at ON releases (app_id, created_at DESC);
