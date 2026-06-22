-- Migration 0021: Compensating decrement for tester-slot reservation.
--
-- add-tester reserves a slot via increment_tester_count() (which commits) and
-- THEN inserts the beta_testers row. If that insert fails, the reserved slot was
-- never released, so `tester_count` drifts upward and the 200-tester cap trips
-- early (a track can hit "cap reached" with fewer than 200 real testers). This
-- lets the route release the slot on insert failure. GREATEST() floors at 0 so
-- the counter can never go negative.

CREATE OR REPLACE FUNCTION decrement_tester_count(p_track_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new INTEGER;
BEGIN
  UPDATE beta_tracks
    SET tester_count = GREATEST(tester_count - 1, 0)
    WHERE id = p_track_id
    RETURNING tester_count INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  RETURN v_new;
END;
$$;
