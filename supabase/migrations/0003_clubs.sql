-- Clubs: scope events (and therefore leaderboards) to a venue/community.
-- Run in the Supabase SQL editor (or via `supabase db push`).

-- ---------------------------------------------------------------------------
-- clubs: one padel club / community
-- ---------------------------------------------------------------------------
create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Default club. Every existing event is backfilled to this one.
insert into clubs (name, slug)
values ('Expose Padel', 'expose-padel')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- events.club_id: which club an uploaded scoresheet belongs to
-- ---------------------------------------------------------------------------
alter table events add column if not exists club_id uuid references clubs(id);

update events
set club_id = (select id from clubs where slug = 'expose-padel')
where club_id is null;

create index if not exists events_club_idx on events(club_id);

-- ---------------------------------------------------------------------------
-- player_club_stats: same aggregates as player_career_stats, but grouped by
-- club so a club leaderboard can be computed. The global leaderboard keeps
-- using player_career_stats (aggregated across every club).
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
  coalesce(var_pop(mp.points::numeric), 0)        as score_variance
from players p
join match_players mp on mp.player_id = p.id
join matches m on m.id = mp.match_id
join events e on e.id = m.event_id
group by p.id, p.name, e.club_id;

-- ---------------------------------------------------------------------------
-- RLS: public read for clubs (writes still go through the service-role key)
-- ---------------------------------------------------------------------------
alter table clubs enable row level security;

do $$
begin
  drop policy if exists "public_read" on clubs;
  create policy "public_read" on clubs for select using (true);
end $$;
