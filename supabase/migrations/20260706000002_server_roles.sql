-- Persist custom server roles in the database.
-- Previously roles lived ONLY in localStorage (ServersContext.saveRolesStorage), so
-- they never survived a reload/deploy/new device and other members never saw them —
-- which also broke role-based item permissions (roleIds reference role defs that only
-- existed in one browser). Store them as JSONB on the servers row.
--
-- Reads: covered by the existing "Servers visible to members and public" SELECT policy
-- (members now receive the roles array via select *).
-- Writes: covered by the existing "Owners and admins can update server" UPDATE policy.
-- Run in the Supabase SQL Editor.

alter table public.servers
  add column if not exists roles jsonb not null default '[]'::jsonb;
