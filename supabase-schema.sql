-- =====================================================================
-- CubeDuel — Row Level Security (RLS) policies
-- =====================================================================
-- Context: the Supabase anon key ships in the frontend bundle
-- (duel/js/config.js) by design — that's how every Supabase browser app
-- works. That alone is NOT a security bug. The security bug is running
-- with RLS disabled, or with permissive `USING (true)` policies, which
-- would let anyone with that public key read/write every room's data.
--
-- Run this once against your Supabase project (SQL Editor) after the
-- base tables (rooms, players, scrambles, solves, messages) exist.
-- Adjust table/column names if yours differ.
-- =====================================================================

-- 1) Enable RLS on every table CubeDuel touches from the browser.
ALTER TABLE rooms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE players    ENABLE ROW LEVEL SECURITY;
ALTER TABLE solves     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrambles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages   ENABLE ROW LEVEL SECURITY;

-- 2) Rooms: anyone (anonymous, authenticated) can read a room by code to
--    join it, and can create a room. Only the creator can delete it.
--    Avoid `USING (true)` for write/delete — scope it to auth.uid().
DROP POLICY IF EXISTS rooms_select_all   ON rooms;
DROP POLICY IF EXISTS rooms_insert_auth  ON rooms;
DROP POLICY IF EXISTS rooms_delete_owner ON rooms;

CREATE POLICY rooms_select_all
  ON rooms FOR SELECT
  USING (true); -- room codes are the "invite link" — read is intentionally open

CREATE POLICY rooms_insert_auth
  ON rooms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY rooms_delete_owner
  ON rooms FOR DELETE
  USING (created_by = auth.uid());

-- 3) Players: anyone in the room can see the roster (needed for the
--    battle table / presence). A player can only insert/update/delete
--    their OWN row (id must equal their auth uid).
DROP POLICY IF EXISTS players_select_all    ON players;
DROP POLICY IF EXISTS players_insert_self   ON players;
DROP POLICY IF EXISTS players_delete_self   ON players;

CREATE POLICY players_select_all
  ON players FOR SELECT
  USING (true);

CREATE POLICY players_insert_self
  ON players FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY players_delete_self
  ON players FOR DELETE
  USING (id = auth.uid());

-- 4) Scrambles: readable by anyone in the room; only insertable by an
--    authenticated user (the client that first reaches a new round
--    number wins, and addScramble()'s unique constraint on
--    (room_id, solve_number) handles the race — see api.js).
DROP POLICY IF EXISTS scrambles_select_all  ON scrambles;
DROP POLICY IF EXISTS scrambles_insert_auth ON scrambles;

CREATE POLICY scrambles_select_all
  ON scrambles FOR SELECT
  USING (true);

CREATE POLICY scrambles_insert_auth
  ON scrambles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5) Solves: readable by anyone in the room (that's the point of the
--    battle log); a player may only insert/update/delete their OWN
--    solves.
DROP POLICY IF EXISTS solves_select_all   ON solves;
DROP POLICY IF EXISTS solves_insert_self  ON solves;
DROP POLICY IF EXISTS solves_update_self  ON solves;
DROP POLICY IF EXISTS solves_delete_self  ON solves;

CREATE POLICY solves_select_all
  ON solves FOR SELECT
  USING (true);

CREATE POLICY solves_insert_self
  ON solves FOR INSERT
  WITH CHECK (player_id = auth.uid());

CREATE POLICY solves_update_self
  ON solves FOR UPDATE
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE POLICY solves_delete_self
  ON solves FOR DELETE
  USING (player_id = auth.uid());

-- 6) Messages (chat): readable by anyone in the room; a player may only
--    insert/delete their OWN messages.
DROP POLICY IF EXISTS messages_select_all  ON messages;
DROP POLICY IF EXISTS messages_insert_self ON messages;
DROP POLICY IF EXISTS messages_delete_self ON messages;

CREATE POLICY messages_select_all
  ON messages FOR SELECT
  USING (true);

CREATE POLICY messages_insert_self
  ON messages FOR INSERT
  WITH CHECK (player_id = auth.uid());

CREATE POLICY messages_delete_self
  ON messages FOR DELETE
  USING (player_id = auth.uid());

-- 7) Make sure Anonymous Sign-Ins are enabled:
--    Supabase Dashboard -> Authentication -> Providers -> Anonymous.
--    Without this, SB.ensureAuth() in duel/js/supabase.js fails and the
--    whole Online Battle feature is unreachable (see bug 1.6 / the
--    preflight checks added in duel/js/room.js).

-- 8) Sanity check after applying: confirm RLS is actually on.
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('rooms','players','solves','scrambles','messages');
