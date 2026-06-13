-- 0017: Cascade-delete an app and report its build binaries for R2 purge.
-- ─────────────────────────────────────────────────────────────────────────────
-- `beta_tracks.app_id` is ON DELETE RESTRICT (so a stray cascade can never
-- silently orphan testers / install events / Arweave records). Every other
-- table that references `apps` already cascades. This function performs the
-- deliberate, atomic "delete this whole app" operation: it gathers the R2
-- object keys for the app's build binaries (beta track APKs + any directly
-- uploaded release APKs) so the caller can purge them from R2 *after* the DB
-- transaction commits, then deletes the tracks (which cascades beta_testers +
-- install_events and NULLs releases.beta_track_id) and finally the app (which
-- cascades releases, remote_configs, analytics, experiments, cohorts).
--
-- Immutable Arweave fingerprint records (arweave_tx_id) are intentionally NOT
-- touched — they are content-addressed hashes, not binaries, and remain as the
-- permanent audit trail.
--
-- SECURITY: this is destructive and SECURITY DEFINER, so EXECUTE is locked to
-- service_role only. The API route performs the publisher-ownership check before
-- calling it via the service-role admin client; anon/authenticated callers must
-- never be able to invoke it directly through PostgREST.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_app_cascade(p_app_id UUID)
RETURNS TABLE (r2_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Collect R2 keys to purge BEFORE deleting (so they survive the cascade).
  --    Skip beta-track binaries already purged (apk_deleted_at set).
  RETURN QUERY
    SELECT bt.r2_key
      FROM beta_tracks bt
      WHERE bt.app_id = p_app_id
        AND bt.apk_deleted_at IS NULL
    UNION
    SELECT r.apk_r2_key
      FROM releases r
      WHERE r.app_id = p_app_id
        AND r.apk_r2_key IS NOT NULL;

  -- 2. Delete tracks first (app_id is RESTRICT). Cascades testers +
  --    install_events; SET NULL on releases.beta_track_id.
  DELETE FROM beta_tracks WHERE app_id = p_app_id;

  -- 3. Delete the app. Everything else cascades.
  DELETE FROM apps WHERE id = p_app_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_app_cascade(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_app_cascade(UUID) FROM anon;
REVOKE ALL ON FUNCTION delete_app_cascade(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION delete_app_cascade(UUID) TO service_role;
