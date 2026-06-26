-- 0022_tester_groups.sql
-- Reusable Tester Groups (the TestFlight "groups" equivalent).
--
-- A named, publisher-scoped (optionally org-shared) set of tester wallet_hashes
-- that a publisher defines ONCE and attaches to any track. Attaching
-- MATERIALIZES the group's members into beta_testers through the existing
-- increment_tester_count CAS, so the 200-cap, every install/download gating
-- read, and /beta/mine remain byte-for-byte unchanged. This migration is purely
-- additive — it touches no existing table, column, function, or the live
-- add-tester path.

-- ---------------------------------------------------------------------------
-- tester_groups — the named, reusable audience.
--   publisher_id = hard owner (RESTRICT, never orphan).
--   org_id (nullable) = optional org-sharing; losing the org downgrades the
--   group to publisher-private (SET NULL) rather than deleting it.
-- ---------------------------------------------------------------------------
CREATE TABLE tester_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id    UUID NOT NULL REFERENCES publishers(id) ON DELETE RESTRICT,
    org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    member_count    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tester_groups_name_len_chk
        CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT tester_groups_desc_len_chk
        CHECK (description IS NULL OR char_length(description) <= 500),
    CONSTRAINT tester_groups_member_count_chk
        CHECK (member_count >= 0)
);

-- Case-insensitive unique name per owner, so the group picker is unambiguous.
CREATE UNIQUE INDEX tester_groups_publisher_name_uidx
    ON tester_groups (publisher_id, lower(name));
CREATE INDEX tester_groups_publisher_id_idx ON tester_groups (publisher_id);
CREATE INDEX tester_groups_org_id_idx ON tester_groups (org_id);

-- ---------------------------------------------------------------------------
-- tester_group_members — wallet_hashes in a group. Mirrors beta_testers:
-- SHA-256 hex only, never plaintext; one row per (group, wallet).
-- ---------------------------------------------------------------------------
CREATE TABLE tester_group_members (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id              UUID NOT NULL REFERENCES tester_groups(id) ON DELETE CASCADE,
    wallet_hash           TEXT NOT NULL,
    added_by_publisher_id UUID REFERENCES publishers(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tester_group_members_unique UNIQUE (group_id, wallet_hash)
);

CREATE INDEX tester_group_members_group_id_idx ON tester_group_members (group_id);
CREATE INDEX tester_group_members_wallet_hash_idx ON tester_group_members (wallet_hash);

-- ---------------------------------------------------------------------------
-- beta_track_group_links — provenance / attach audit ONLY. Gating never reads
-- this; it records which groups filled a track, how many rows each attach
-- inserted, and whether the attach hit the cap (partial fill).
-- ---------------------------------------------------------------------------
CREATE TABLE beta_track_group_links (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id                 UUID NOT NULL REFERENCES beta_tracks(id) ON DELETE CASCADE,
    group_id                 UUID NOT NULL REFERENCES tester_groups(id) ON DELETE CASCADE,
    attached_by_publisher_id UUID REFERENCES publishers(id) ON DELETE SET NULL,
    members_added            INTEGER NOT NULL DEFAULT 0,
    partial                  BOOLEAN NOT NULL DEFAULT false,
    attached_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT beta_track_group_links_unique UNIQUE (track_id, group_id)
);

CREATE INDEX beta_track_group_links_track_id_idx ON beta_track_group_links (track_id);
CREATE INDEX beta_track_group_links_group_id_idx ON beta_track_group_links (group_id);

-- ---------------------------------------------------------------------------
-- member_count maintenance — keep the denormalized counter honest on add/remove
-- so the UI never needs a count(*).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tg_tester_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE tester_groups
            SET member_count = member_count + 1, updated_at = now()
            WHERE id = NEW.group_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE tester_groups
            SET member_count = GREATEST(member_count - 1, 0), updated_at = now()
            WHERE id = OLD.group_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER tester_group_members_count_trg
    AFTER INSERT OR DELETE ON tester_group_members
    FOR EACH ROW EXECUTE FUNCTION tg_tester_group_member_count();

-- ---------------------------------------------------------------------------
-- apply_tester_group_to_track — the materialization seam. Expands a group's
-- members into beta_testers through the SAME increment_tester_count FOR-UPDATE
-- CAS the add-tester route uses, so the 200-cap is enforced identically and
-- group-apply gets zero special treatment. Deterministic oldest-first fill;
-- stops cleanly at the cap (partial fill); dedupes against the live allowlist
-- (covers a wallet already added manually OR via another group).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_tester_group_to_track(
    p_track_id           UUID,
    p_group_id           UUID,
    p_actor_publisher_id UUID
)
RETURNS TABLE (added INTEGER, already_present INTEGER, remaining_in_group INTEGER, over_cap BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member    RECORD;
    v_added     INTEGER := 0;
    v_already   INTEGER := 0;
    v_seen      INTEGER := 0;
    v_total     INTEGER := 0;
    v_over_cap  BOOLEAN := false;
    v_inc_count INTEGER;
    v_inc_over  BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM beta_tracks WHERE id = p_track_id) THEN
        RAISE EXCEPTION 'TRACK_NOT_FOUND';
    END IF;

    SELECT count(*) INTO v_total
        FROM tester_group_members WHERE group_id = p_group_id;

    FOR v_member IN
        SELECT wallet_hash
            FROM tester_group_members
            WHERE group_id = p_group_id
            ORDER BY created_at ASC, id ASC      -- deterministic oldest-first fill
    LOOP
        v_seen := v_seen + 1;

        -- Dedupe: already on this track's allowlist (manual add OR another group).
        IF EXISTS (
            SELECT 1 FROM beta_testers
            WHERE track_id = p_track_id AND wallet_hash = v_member.wallet_hash
        ) THEN
            v_already := v_already + 1;
            CONTINUE;
        END IF;

        -- Reserve a slot through the SAME 200-cap CAS the add-tester route uses.
        SELECT new_count, over_cap
            INTO v_inc_count, v_inc_over
            FROM increment_tester_count(p_track_id);

        IF v_inc_over THEN
            v_over_cap := true;
            EXIT;                                 -- cap hit; stop (partial fill)
        END IF;

        BEGIN
            INSERT INTO beta_testers (track_id, wallet_hash, added_by_publisher_id)
            VALUES (p_track_id, v_member.wallet_hash, p_actor_publisher_id);
            v_added := v_added + 1;
        EXCEPTION WHEN unique_violation THEN
            -- Raced with a concurrent add: release the reserved slot, count as present.
            PERFORM decrement_tester_count(p_track_id);
            v_already := v_already + 1;
        END;
    END LOOP;

    RETURN QUERY SELECT
        v_added,
        v_already,
        GREATEST(v_total - v_seen, 0),            -- members not reached (cap hit)
        v_over_cap;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS — defense-in-depth, mirrors the beta_* / cohort_definitions policies.
-- The API routes run as service_role (which bypasses RLS); these are the
-- backstop if a row is ever reached with an end-user JWT.
-- ---------------------------------------------------------------------------
ALTER TABLE tester_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tester_group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_track_group_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY tester_groups_select_own ON tester_groups
    FOR SELECT USING (auth.uid() = publisher_id);
CREATE POLICY tester_groups_mutate_own ON tester_groups
    FOR ALL USING (auth.uid() = publisher_id) WITH CHECK (auth.uid() = publisher_id);
CREATE POLICY tester_groups_service_all ON tester_groups
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tgm_select_own ON tester_group_members
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM tester_groups g
        WHERE g.id = tester_group_members.group_id AND g.publisher_id = auth.uid()));
CREATE POLICY tgm_mutate_own ON tester_group_members
    FOR ALL USING (EXISTS (
        SELECT 1 FROM tester_groups g
        WHERE g.id = tester_group_members.group_id AND g.publisher_id = auth.uid()))
    WITH CHECK (EXISTS (
        SELECT 1 FROM tester_groups g
        WHERE g.id = tester_group_members.group_id AND g.publisher_id = auth.uid()));
CREATE POLICY tgm_service_all ON tester_group_members
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY btgl_service_all ON beta_track_group_links
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
