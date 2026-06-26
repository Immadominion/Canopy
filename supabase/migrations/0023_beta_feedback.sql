-- 0023_beta_feedback.sql
-- In-app tester feedback (the TestFlight "feedback" equivalent).
--
-- A tester on a build's allowlist can send written feedback — optionally with a
-- screenshot stored privately in R2 — tied to their wallet hash and the build
-- they're on. Publishers read + triage it from the dashboard. Purely additive:
-- touches no existing table, column, or function.

CREATE TABLE beta_feedback (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id          UUID NOT NULL REFERENCES beta_tracks(id) ON DELETE CASCADE,
    -- SHA-256 hex of the tester's wallet — never plaintext (matches beta_testers).
    wallet_hash       TEXT NOT NULL,
    message           TEXT NOT NULL,
    -- R2 object key for an optional screenshot (private; served via a signed route).
    screenshot_key    TEXT,
    -- The build's versionCode the tester was on, for context.
    app_version_code  INTEGER,
    status            TEXT NOT NULL DEFAULT 'open',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT beta_feedback_message_len_chk CHECK (char_length(message) BETWEEN 1 AND 2000),
    CONSTRAINT beta_feedback_status_chk CHECK (status IN ('open', 'resolved', 'archived'))
);

CREATE INDEX beta_feedback_track_id_idx ON beta_feedback (track_id);
CREATE INDEX beta_feedback_track_created_idx ON beta_feedback (track_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — defense-in-depth. Routes run as service_role; these are the backstop.
-- ---------------------------------------------------------------------------
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY beta_feedback_service_all ON beta_feedback
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- A publisher may read feedback left on their own tracks.
CREATE POLICY beta_feedback_select_own ON beta_feedback
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM beta_tracks t
        WHERE t.id = beta_feedback.track_id AND t.publisher_id = auth.uid()
    ));
