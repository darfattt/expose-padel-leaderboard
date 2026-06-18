-- Merge two duplicate player records into one.
-- The DB stores only raw facts (matches); every rating/rank/archetype is
-- recomputed at read time, so after this runs the leaderboard heals itself.
--
-- DIRECTION (edit these two if the keep/remove choice is reversed):
--   KEEP   (canonical, survives): 05aea5e2-a94d-4a5e-a84b-a04fc5d74fd6  -- "S Y A F I K" (original)
--   REMOVE (duplicate, deleted) : 26a81882-8de0-417b-898c-4b63efb60925  -- "SYAFIK" (duplicate)
--
-- Run in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 0. SAFETY CHECK (run first, on its own). If this returns any rows, the two
--    records share a match — reassigning would put the same person on a court
--    twice. Resolve those rows by hand before running the merge below.
-- ---------------------------------------------------------------------------
select mp_keep.match_id
from match_players mp_keep
join match_players mp_dup
  on mp_dup.match_id = mp_keep.match_id
where mp_keep.player_id = '05aea5e2-a94d-4a5e-a84b-a04fc5d74fd6'
  and mp_dup.player_id  = '26a81882-8de0-417b-898c-4b63efb60925';

-- ---------------------------------------------------------------------------
-- THE MERGE (run as one block once the check above returns nothing)
-- ---------------------------------------------------------------------------
begin;

-- 1. Move every game the duplicate played onto the canonical player.
update match_players
set player_id = '05aea5e2-a94d-4a5e-a84b-a04fc5d74fd6'
where player_id = '26a81882-8de0-417b-898c-4b63efb60925';

-- 2. Backfill profile fields the canonical record is missing from the duplicate.
update players AS keep
set position          = coalesce(keep.position,          dup.position),
    racket_slug       = coalesce(keep.racket_slug,       dup.racket_slug),
    racket_name       = coalesce(keep.racket_name,       dup.racket_name),
    racket_brand      = coalesce(keep.racket_brand,      dup.racket_brand),
    racket_image      = coalesce(keep.racket_image,      dup.racket_image),
    reclub_url        = coalesce(keep.reclub_url,        dup.reclub_url),
    reclub_avatar_url = coalesce(keep.reclub_avatar_url, dup.reclub_avatar_url)
from players AS dup
where keep.id = '05aea5e2-a94d-4a5e-a84b-a04fc5d74fd6'
  and dup.id  = '26a81882-8de0-417b-898c-4b63efb60925';

-- 3. Drop cached LLM reports for both (they regenerate from merged stats).
delete from player_reports
where player_id in (
  '05aea5e2-a94d-4a5e-a84b-a04fc5d74fd6',
  '26a81882-8de0-417b-898c-4b63efb60925'
);

-- 4. Delete the duplicate row.
delete from players
where id = '26a81882-8de0-417b-898c-4b63efb60925';

commit;
