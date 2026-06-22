-- Migration 0018: Bind org invites to the invitee's wallet.
--
-- Org invites authenticate at accept time by wallet (SIWS), but were previously
-- looked up by token alone with NO recipient binding: a leaked invite link
-- (forwarded email, referrer, screenshot) let ANY wallet redeem it and join the
-- org with the invited role. Publishers are wallet-native and have no verified
-- email, so the only coherent recipient identity is the wallet. Bind each invite
-- to the invitee's wallet hash; the accept route enforces a match.
--
-- Nullable for backward compatibility with any pre-existing rows; the invite
-- creation route now always sets it, and accept rejects invites missing it.

ALTER TABLE org_invites
  ADD COLUMN IF NOT EXISTS invited_wallet_hash TEXT;

CREATE INDEX IF NOT EXISTS org_invites_wallet_hash_idx
  ON org_invites (invited_wallet_hash);
