-- Padel leaderboard schema
-- Run in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- players: stable identity across events, deduped by normalized_name
-- ---------------------------------------------------------------------------
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events: one uploaded scoresheet
-- ---------------------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  raw_title text,
  played_on date,
  location text,
  format text,
  num_courts int,
  num_players int,
  source_filename text,
  content_hash text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- matches: one doubles game (a court within a round)
-- ---------------------------------------------------------------------------
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  round int not null,
  court int not null,
  team1_score int not null,
  team2_score int not null,
  created_at timestamptz not null default now()
);
create index if not exists matches_event_idx on matches(event_id);

-- ---------------------------------------------------------------------------
-- match_players: 4 rows per match (team 1 x2, team 2 x2)
-- ---------------------------------------------------------------------------
create table if not exists match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team int not null check (team in (1, 2)),
  points int not null,        -- own team's score in this match
  conceded int not null,      -- opponent team's score
  won boolean not null,
  is_draw boolean not null default false
);
create index if not exists match_players_match_idx on match_players(match_id);
create index if not exists match_players_player_idx on match_players(player_id);

-- ---------------------------------------------------------------------------
-- player_reports: cached LLM scouting reports
-- ---------------------------------------------------------------------------
create table if not exists player_reports (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  scope text not null check (scope in ('event', 'career')),
  headline text,
  content text not null,
  tags text[] not null default '{}',
  model text,
  input_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists player_reports_key
  on player_reports(player_id, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid), scope);

-- ---------------------------------------------------------------------------
-- player_career_stats: aggregate per player across ALL events
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
  coalesce(var_pop(mp.points::numeric), 0)        as score_variance
from players p
left join match_players mp on mp.player_id = p.id
group by p.id, p.name;

-- ---------------------------------------------------------------------------
-- RLS: public read, writes via service-role key only
-- ---------------------------------------------------------------------------
alter table players enable row level security;
alter table events enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table player_reports enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','events','matches','match_players','player_reports']
  loop
    execute format('drop policy if exists "public_read" on %I', t);
    execute format('create policy "public_read" on %I for select using (true)', t);
  end loop;
end $$;
