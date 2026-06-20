-- ---------------------------------------------------------------------------
-- narratives: cached LLM blurbs that aren't tied to a single player.
--
-- player_reports is keyed by player_id (NOT NULL), which doesn't fit event-level
-- or field-level copy. This generic cache backs the Match Night recap quips,
-- the Power Rankings column, and Padel Wrapped season blurbs. Same philosophy as
-- player_reports: a row is served only while its input_hash matches the current
-- facts; otherwise it's regenerated.
--
--   kind     'event_recap' | 'power_rankings' | 'wrapped'
--   ref_id   what the narrative is about, encoded as text:
--              event_recap    -> event id
--              power_rankings -> "<clubId|all>:<period>"
--              wrapped        -> "<playerId>:<period>"
--   content  the generated payload (shape depends on kind)
-- ---------------------------------------------------------------------------
create table if not exists narratives (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ref_id text not null default '',
  content jsonb not null,
  model text,
  input_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists narratives_key on narratives(kind, ref_id);

-- RLS: public read, writes via service-role key only (which bypasses RLS).
alter table narratives enable row level security;
drop policy if exists "public_read" on narratives;
create policy "public_read" on narratives for select using (true);
