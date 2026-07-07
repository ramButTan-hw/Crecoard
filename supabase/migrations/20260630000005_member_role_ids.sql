-- Per-member custom role assignments. The role *definitions* live client-side
-- for now, but which roles a member holds must be shared (the board permission
-- system reads each viewer's role_ids). The existing "Owners and admins can
-- change roles" UPDATE policy on server_members already governs writes here.
alter table public.server_members
  add column if not exists role_ids text[] not null default '{}';
