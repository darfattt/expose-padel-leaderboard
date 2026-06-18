-- Reclub profile link + avatar
-- Lets a player link their public Reclub profile (e.g.
-- https://reclub.co/id/players/@darfat-41). The avatar URL
-- (https://assets.reclub.co/user-avatars/{id}.webp) is resolved from that
-- profile page server-side and cached here so the leaderboard/profile can show
-- a circle avatar without re-fetching Reclub on every render. Writes go through
-- the service-role client, so no RLS update policy is needed.
-- Run in the Supabase SQL editor (or via `supabase db push`).

alter table players
  add column if not exists reclub_url text,
  add column if not exists reclub_avatar_url text;
