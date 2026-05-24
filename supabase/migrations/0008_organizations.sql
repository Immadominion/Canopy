-- 0008_organizations.sql
-- Phase 4: Organisation model for team collaboration, invitations, and RBAC.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── organizations ───────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  owner_id            UUID NOT NULL REFERENCES publishers(id) ON DELETE RESTRICT,
  plan                TEXT NOT NULL DEFAULT 'free'
                      CHECK (plan IN ('free', 'pro', 'enterprise')),
  stripe_customer_id  TEXT UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Each publisher owns at most one organisation.
CREATE UNIQUE INDEX organizations_owner_idx ON organizations (owner_id);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Active members (joined_at IS NOT NULL) can read their org.
CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT
  USING (
    owner_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
    OR id IN (
      SELECT org_id FROM org_members
      WHERE publisher_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
        AND joined_at IS NOT NULL
    )
  );

-- Only the owner can update org settings.
CREATE POLICY "organizations_update_owner" ON organizations
  FOR UPDATE
  USING (
    owner_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
  );

-- Service role has unrestricted access.
CREATE POLICY "organizations_service_all" ON organizations
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ─── org_members ─────────────────────────────────────────────────────────────
-- Represents a publisher's membership in an organisation.
-- publisher_id is nullable while the invite is pending (email-only invite).

CREATE TABLE org_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  publisher_id    UUID REFERENCES publishers(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'viewer')),
  invited_email   TEXT,
  invited_by      UUID NOT NULL REFERENCES publishers(id),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at       TIMESTAMPTZ,                     -- NULL while invite is pending
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A publisher can only have one active membership per org.
  UNIQUE (org_id, publisher_id)
);

CREATE INDEX org_members_org_id_idx    ON org_members (org_id);
CREATE INDEX org_members_publisher_idx ON org_members (publisher_id);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Active members can see all membership rows in their org.
CREATE POLICY "org_members_select_member" ON org_members
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members om2
      WHERE om2.publisher_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
        AND om2.joined_at IS NOT NULL
    )
  );

-- Only owner/admin can invite new members.
CREATE POLICY "org_members_insert_admin" ON org_members
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members om2
      WHERE om2.publisher_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
        AND om2.role IN ('owner', 'admin')
        AND om2.joined_at IS NOT NULL
    )
  );

-- Owner/admin can remove members; the owner row cannot be deleted.
CREATE POLICY "org_members_delete_admin" ON org_members
  FOR DELETE
  USING (
    role <> 'owner'
    AND org_id IN (
      SELECT org_id FROM org_members om2
      WHERE om2.publisher_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
        AND om2.role IN ('owner', 'admin')
        AND om2.joined_at IS NOT NULL
    )
  );

-- Owner/admin can update roles; a member can update their own join status.
CREATE POLICY "org_members_update" ON org_members
  FOR UPDATE
  USING (
    publisher_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
    OR org_id IN (
      SELECT org_id FROM org_members om2
      WHERE om2.publisher_id = (SELECT id FROM publishers WHERE auth.uid()::TEXT = id::TEXT)
        AND om2.role IN ('owner', 'admin')
        AND om2.joined_at IS NOT NULL
    )
  );

-- Service role has unrestricted access.
CREATE POLICY "org_members_service_all" ON org_members
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ─── org_invites ─────────────────────────────────────────────────────────────
-- Pending email invitations. Token is a secure random string. Expires in 7 days.

CREATE TABLE org_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_email   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'developer', 'viewer')),
  token           TEXT NOT NULL UNIQUE,
  invited_by      UUID NOT NULL REFERENCES publishers(id),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate active invites for the same email in the same org.
  UNIQUE (org_id, invited_email)
);

CREATE INDEX org_invites_token_idx  ON org_invites (token);
CREATE INDEX org_invites_org_id_idx ON org_invites (org_id);
CREATE INDEX org_invites_email_idx  ON org_invites (invited_email);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

-- Invite management is server-side only; only service role touches this table.
CREATE POLICY "org_invites_service_all" ON org_invites
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ─── link apps to organisations ──────────────────────────────────────────────
-- Nullable FK — existing apps keep NULL; backfilled when publisher creates an org.
ALTER TABLE apps ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS apps_org_id_idx ON apps (org_id);
