-- Player gender
-- Adds an editable gender field to players. It only drives which FIP ranking
-- (men's vs women's top-90) the "plays like" pro comparison is drawn from; it
-- has no effect on ratings. Writes go through the service-role client, so no RLS
-- update policy is needed (public_read already covers SELECT).

alter table players
  add column if not exists gender text check (gender in ('male', 'female'));
