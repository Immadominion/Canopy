-- Migration 0005: Seeker gate + APK deletion tracking
--
-- 1. seeker_only: opt-in gate — track requires a Seeker Genesis Token to install
-- 2. apk_deleted_at: tracks whether the APK was deleted from R2 (idempotency for cleanup cron)

-- ─── seeker_only on beta_tracks ───────────────────────────────────────────────
-- Defaults false so existing tracks are unaffected.
ALTER TABLE beta_tracks
  ADD COLUMN seeker_only BOOLEAN NOT NULL DEFAULT false;

-- ─── apk_deleted_at on beta_tracks ────────────────────────────────────────────
-- NULL means the APK is still in R2.
-- Set to now() by the cleanup cron when the APK is deleted from R2.
ALTER TABLE beta_tracks
  ADD COLUMN apk_deleted_at TIMESTAMPTZ;

-- Index to quickly find expired tracks that still need R2 cleanup.
-- Partial index on the subset the cleanup query reads.
CREATE INDEX beta_tracks_pending_r2_cleanup_idx
  ON beta_tracks (id, r2_key)
  WHERE status = 'expired' AND apk_deleted_at IS NULL;

-- ─── Also fix the status CHECK constraint to align with 0004 migration ─────────
-- Migration 0004 already updated the constraint, but we add a belt-and-suspenders
-- comment to document the final expected states:
-- pending_scan | scan_in_progress | scan_passed | scan_failed | active | expired | revoked
-- No changes needed here — 0004 already updated the constraint.

-- ─── Updated timestamp trigger must already exist (from 0001) ─────────────────
-- No new trigger needed.
