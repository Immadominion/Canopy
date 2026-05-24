-- Migration 0003: Stale nonce cleanup
-- Expired, unused nonces accumulate — clean them every 10 minutes.
-- This requires pg_cron extension (available on Supabase Pro+).
-- On free tier, the API prunes nonces inline before inserting new ones.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Delete expired nonces every 10 minutes
SELECT cron.schedule(
  'cleanup-expired-nonces',
  '*/10 * * * *',
  $$DELETE FROM siws_nonces WHERE expires_at < now()$$
);

-- Also delete expired beta tracks and update their status
-- Runs hourly — expired APKs must be actioned within 1 hour (Invariant 3)
SELECT cron.schedule(
  'expire-beta-tracks',
  '0 * * * *',
  $$
    UPDATE beta_tracks
      SET status = 'expired', updated_at = now()
      WHERE status = 'active'
        AND expires_at < now();
  $$
);
