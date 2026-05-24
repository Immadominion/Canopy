-- Migration 0004: Add scan_passed status to beta_tracks
-- Separates "scan clean, awaiting publisher activation" from "active".
-- The malware scan workflow:
--   pending_scan → scan_in_progress → scan_passed (clean) | scan_failed (malicious)
--   scan_passed → active (publisher activates)

-- Drop and recreate the CHECK constraint with the new value.
ALTER TABLE beta_tracks
  DROP CONSTRAINT IF EXISTS beta_tracks_status_check;

ALTER TABLE beta_tracks
  ADD CONSTRAINT beta_tracks_status_check
  CHECK (status IN (
    'pending_scan',    -- uploaded, scan not yet started
    'scan_in_progress', -- scan running
    'scan_passed',     -- clean — awaiting publisher activation
    'scan_failed',     -- malware detected — cannot be activated
    'active',          -- publisher activated, testers can download
    'expired',         -- past expires_at
    'revoked'          -- manually revoked
  ));
