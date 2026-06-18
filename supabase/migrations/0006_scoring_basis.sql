-- Scoring basis per event + basis-normalized stats.
-- Events come in different point scales (a "first to 21" game vs a fixed-sum
-- "to 5" game like 3-2 / 5-0). The reliability gates and close-game threshold in
-- the rating layer are tuned for a ~21-point game, so we record each event's
-- basis and expose stats normalized onto a 21-point-equivalent scale alongside
-- the raw ones (see lib/scoring.ts). Run in the Supabase SQL editor or via
-- `supabase db push`.

-- ---------------------------------------------------------------------------
-- events.points_per_game: the most points one team can reach in a game
-- (21 for "to 21"; 5 for a fixed-sum "to 5"). Backfilled from existing matches,
-- mirroring the parser's detectPointsPerGame (lib/scoring.ts):
--   • fixed-sum: when every match's two scores sum to the same value, the basis
--     is that constant total (a shutout is N-0);
--   • first-to-N: otherwise the basis is the highest single-team score seen.
-- Events with no matches default to 21.
-- ---------------------------------------------------------------------------
alter table events add column if not exists points_per_game int;

update events e
set points_per_game = sub.basis
from (
  select
    m.event_id,
    case
      when count(distinct (m.team1_score + m.team2_score)) = 1
        then max(m.team1_score + m.team2_score)            -- constant sum → fixed-sum basis
      else greatest(max(m.team1_score), max(m.team2_score)) -- varying sums → first-to-N basis
    end as basis
  from matches m
  group by m.event_id
) sub
where e.id = sub.event_id and e.points_per_game is null;

update events set points_per_game = 21 where points_per_game is null;

-- ---------------------------------------------------------------------------
-- player_career_stats: raw aggregates (verbatim, for display) + norm_*
-- aggregates with each game scaled by 21 / points_per_game (for the rating
-- layer). Now joins matches/events to know each game's basis.
-- ---------------------------------------------------------------------------
create or replace view player_career_stats as
select
  p.id                                            as player_id,
  p.name                                          as name,
  count(mp.id)                                    as games,
  count(*) filter (where mp.won)                  as wins,
  count(*) filter (where not mp.won and not mp.is_draw) as losses,
  count(*) filter (where mp.is_draw)              as draws,
  coalesce(sum(mp.points), 0)                     as points_for,
  coalesce(sum(mp.conceded), 0)                   as points_against,
  coalesce(sum(mp.points) - sum(mp.conceded), 0)  as point_diff,
  count(*) filter (where abs(mp.points - mp.conceded) <= 3) as close_games,
  count(*) filter (where abs(mp.points - mp.conceded) <= 3 and mp.won) as close_wins,
  coalesce(var_pop(mp.points::numeric), 0)        as score_variance,
  -- normalized (21-point-equivalent) parallels
  coalesce(sum(mp.points    * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_points_for,
  coalesce(sum(mp.conceded  * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_points_against,
  coalesce(sum((mp.points - mp.conceded) * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_point_diff,
  count(*) filter (where abs((mp.points - mp.conceded) * 21.0 / coalesce(e.points_per_game, 21)) <= 3) as norm_close_games,
  count(*) filter (where abs((mp.points - mp.conceded) * 21.0 / coalesce(e.points_per_game, 21)) <= 3 and mp.won) as norm_close_wins,
  coalesce(var_pop(mp.points * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_score_variance
from players p
left join match_players mp on mp.player_id = p.id
left join matches m on m.id = mp.match_id
left join events e on e.id = m.event_id
group by p.id, p.name;

-- ---------------------------------------------------------------------------
-- player_club_stats: same, scoped per club.
-- ---------------------------------------------------------------------------
create or replace view player_club_stats as
select
  p.id                                            as player_id,
  p.name                                          as name,
  e.club_id                                       as club_id,
  count(mp.id)                                    as games,
  count(*) filter (where mp.won)                  as wins,
  count(*) filter (where not mp.won and not mp.is_draw) as losses,
  count(*) filter (where mp.is_draw)              as draws,
  coalesce(sum(mp.points), 0)                     as points_for,
  coalesce(sum(mp.conceded), 0)                   as points_against,
  coalesce(sum(mp.points) - sum(mp.conceded), 0)  as point_diff,
  count(*) filter (where abs(mp.points - mp.conceded) <= 3) as close_games,
  count(*) filter (where abs(mp.points - mp.conceded) <= 3 and mp.won) as close_wins,
  coalesce(var_pop(mp.points::numeric), 0)        as score_variance,
  coalesce(sum(mp.points    * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_points_for,
  coalesce(sum(mp.conceded  * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_points_against,
  coalesce(sum((mp.points - mp.conceded) * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_point_diff,
  count(*) filter (where abs((mp.points - mp.conceded) * 21.0 / coalesce(e.points_per_game, 21)) <= 3) as norm_close_games,
  count(*) filter (where abs((mp.points - mp.conceded) * 21.0 / coalesce(e.points_per_game, 21)) <= 3 and mp.won) as norm_close_wins,
  coalesce(var_pop(mp.points * 21.0 / coalesce(e.points_per_game, 21)), 0) as norm_score_variance
from players p
join match_players mp on mp.player_id = p.id
join matches m on m.id = mp.match_id
join events e on e.id = m.event_id
group by p.id, p.name, e.club_id;
