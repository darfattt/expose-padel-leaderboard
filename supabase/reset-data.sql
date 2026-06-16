-- ===========================================================================
-- RESET UPLOADED DATA — run in the Supabase SQL editor before re-uploading.
-- ===========================================================================
-- DESTRUCTIVE: removes every player, event, match, match-player row, and cached
-- LLM report. Schema (tables, the player_career_stats view, RLS policies) is
-- left fully intact, so you can immediately re-upload scoresheets.
--
-- TRUNCATE ... CASCADE clears the FK-dependent tables in the right order in one
-- shot; RESTART IDENTITY is a harmless no-op here (ids are uuids, not serials).

truncate table
  match_players,
  matches,
  player_reports,
  events,
  players
restart identity cascade;

-- Sanity check — every count should be 0 after the truncate above.
select
  (select count(*) from players)       as players,
  (select count(*) from events)        as events,
  (select count(*) from matches)       as matches,
  (select count(*) from match_players) as match_players,
  (select count(*) from player_reports) as player_reports;

-- ---------------------------------------------------------------------------
-- OPTIONAL: surgical delete of a SINGLE event instead of a full wipe.
-- matches / match_players / player_reports cascade from events automatically;
-- players are left in place (they may belong to other events).
-- ---------------------------------------------------------------------------
-- delete from events where source_filename = '3H2C  Padel With BOBI 9 (Wali Kota Grand Wisata).pdf';
-- delete from events where content_hash = '<paste content_hash here>';
--
-- After deleting events, remove any players who no longer have any matches:
-- delete from players p
-- where not exists (select 1 from match_players mp where mp.player_id = p.id);
