-- Club admin passwords: let a club admin upload events for their own club
-- without the global super-admin password (UPLOAD_PASSWORD). The super-admin
-- password still works for every club.
-- Run in the Supabase SQL editor (or via `supabase db push`).

alter table clubs add column if not exists admin_password text;
