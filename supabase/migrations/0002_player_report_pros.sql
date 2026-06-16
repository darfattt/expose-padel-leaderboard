-- Add pro-player comparisons to cached scouting reports.
-- Each row: [{ "name": "Agustín Tapia", "reason": "same point-a-minute scoring" }, ...]
alter table player_reports
  add column if not exists pro_comparisons jsonb not null default '[]'::jsonb;
