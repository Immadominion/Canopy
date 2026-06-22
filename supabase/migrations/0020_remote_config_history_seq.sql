-- Migration 0020: Deterministic remote-config rollback ordering.
--
-- Rollback selected the latest history row by `created_at DESC` only. With a
-- random UUID primary key and `created_at` defaulting to now() (transaction-
-- start time), two writes in the same instant (the dashboard "save then undo"
-- flow, or two rapid PUTs) tie on `created_at`, and the tiebreak is the random
-- UUID — so rollback could restore the WRONG snapshot. Add a monotonic identity
-- column and order by it instead.

ALTER TABLE remote_config_history
  ADD COLUMN IF NOT EXISTS seq BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE INDEX IF NOT EXISTS remote_config_history_config_seq_idx
  ON remote_config_history (config_id, seq DESC);
