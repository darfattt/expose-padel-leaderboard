-- Seed known Reclub profile URLs for existing players.
-- Source meet: https://reclub.co/id/m/AUHGOB (Padel With BOBI 9, Grand Wisata, 11 Jun)
-- Matches on normalized_name (lower + trimmed + whitespace-collapsed; see
-- lib/normalize.ts -> normalizeName), so it's resilient to casing. Avatars are
-- left null: they resolve automatically from the profile page the next time the
-- player is shown (lib/reclub-avatar.ts), or when the URL is re-saved in the UI.
-- Run in the Supabase SQL editor after applying 0008_reclub_profile.sql.
-- Note: "Abay" was a confirmed participant without a Reclub profile, so no row.

update players set reclub_url = v.url, reclub_avatar_url = null
from (values
  ('sultan',           'https://reclub.co/id/players/@sultannh'),
  ('chandra erlangga', 'https://reclub.co/id/players/@chandra-erlangga-634'),
  ('zikri arbaa',      'https://reclub.co/id/players/@zikri-arbaa-867'),
  ('steven',           'https://reclub.co/id/players/@steven-51'),
  ('bayu hartaya',     'https://reclub.co/id/players/@bayu-hartaya-516'),
  ('poundra nur okky', 'https://reclub.co/id/players/@poundra-nur-okky-245'),
  ('yuris arvan',      'https://reclub.co/id/players/@yurisarvan'),
  ('indira',           'https://reclub.co/id/players/@indira-316'),
  ('rezaul',           'https://reclub.co/id/players/@rezaul-419'),
  ('faisal',           'https://reclub.co/id/players/@far2209'),
  ('bobi9',            'https://reclub.co/id/players/@bobi9-76'),
  ('bang econ',        'https://reclub.co/id/players/@bang-econ-740'),
  ('big t',            'https://reclub.co/id/players/@big-t-13'),
  ('fadzri',           'https://reclub.co/id/players/@fadzri-117'),
  ('riga',             'https://reclub.co/id/players/@luiskariga')
) as v(normalized_name, url)
where players.normalized_name = v.normalized_name;
