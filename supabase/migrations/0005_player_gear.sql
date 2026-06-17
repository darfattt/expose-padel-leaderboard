-- Player gear & playing position
-- Adds editable profile fields to players: their racket (chosen from the
-- Padelful catalogue) and on-court position. Writes go through the service-role
-- client, so no RLS update policy is needed (public_read already covers SELECT).

alter table players
  add column if not exists position text check (position in ('Right', 'Left', 'Both')),
  add column if not exists racket_slug text,
  add column if not exists racket_name text,
  add column if not exists racket_brand text,
  add column if not exists racket_image text;
