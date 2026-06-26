-- 0025_demo_tracks.sql
-- A "demo" track is publicly installable: any signed-in wallet sees it in the
-- tester app and can install it, bypassing the per-track allowlist. Opt-in per
-- track (default false), so the allowlist model is unchanged for every other
-- build. For showing Canopy to reviewers / running a public demo. The install
-- is still verified against the build fingerprint, so it stays a safe install.

ALTER TABLE beta_tracks ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX beta_tracks_is_demo_idx ON beta_tracks (is_demo) WHERE is_demo;
