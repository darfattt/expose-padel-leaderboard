-- Seed known Reclub profile URLs for existing players.
-- Matches on normalized_name (lower + trimmed + whitespace-collapsed; see
-- lib/normalize.ts -> normalizeName), so it's resilient to casing. Avatars are
-- left null: they resolve automatically from the profile page the next time the
-- player is shown (lib/reclub-avatar.ts), or when the URL is re-saved in the UI.
-- Run in the Supabase SQL editor after applying 0008_reclub_profile.sql.

update players set reclub_url = v.url, reclub_avatar_url = null
from (values
  ('handrian',                     'https://reclub.co/id/players/@handrian-179'),
  ('faisal',                       'https://reclub.co/id/players/@far2209'),
  ('adhitia putra herawan',        'https://reclub.co/id/players/@apeha'),
  ('criz',                         'https://reclub.co/id/players/@478'),
  ('eggi',                         'https://reclub.co/id/players/@eggi-472'),
  ('taufik hidayat permana putra', 'https://reclub.co/id/players/@166'),
  ('fathan',                       'https://reclub.co/id/players/@mfathansugihb-771'),
  ('hilmi',                        'https://reclub.co/id/players/@nurjastore'),
  ('poundra nur okky',             'https://reclub.co/id/players/@poundra-nur-okky-245'),
  ('febriyoga bs',                 'https://reclub.co/id/players/@febriyoga-bs'),
  ('fadzri',                       'https://reclub.co/id/players/@fadzri-117'),
  ('pasya',                        'https://reclub.co/id/players/@rinaldypasya'),
  ('darfat',                       'https://reclub.co/id/players/@darfat-41'),
  ('raddy',                        'https://reclub.co/id/players/@rkarismansyah'),
  ('hendrian',                     'https://reclub.co/id/players/@hendrian-160'),
  ('s y a f i k',                  'https://reclub.co/id/players/@syafik-musyafako-333')
) as v(normalized_name, url)
where players.normalized_name = v.normalized_name;
