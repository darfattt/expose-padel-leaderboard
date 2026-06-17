-- Allow caching LLM "gossip column" summaries alongside scouting reports.
-- Reuses player_reports (summary in content, vibe in headline) under a new scope.
alter table player_reports
  drop constraint if exists player_reports_scope_check;
alter table player_reports
  add constraint player_reports_scope_check check (scope in ('event', 'career', 'gossip'));
