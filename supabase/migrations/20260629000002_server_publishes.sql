-- server_publishes: immutable snapshots of the server board, published by owners/admins
-- Run in Supabase SQL Editor after 20260629000001_audit_log.sql

create table if not exists public.server_publishes (
  id             uuid        primary key default gen_random_uuid(),
  server_id      uuid        not null references public.servers(id) on delete cascade,
  snapshot       jsonb       not null,
  message        text,
  published_by   uuid        references auth.users(id) on delete set null,
  publisher_name text        not null default 'Unknown',
  published_at   timestamptz not null default now()
);

-- Fast lookup: most-recent publish for a given server
create index if not exists server_publishes_server_published_idx
  on public.server_publishes(server_id, published_at desc);

alter table public.server_publishes enable row level security;

-- Any member of the server can read publishes (to view the live board)
create policy "Members can view publishes"
  on public.server_publishes for select using (
    exists (
      select 1 from public.server_members
      where server_id = server_publishes.server_id
        and user_id = auth.uid()
    )
  );

-- Only owners and admins can publish
create policy "Admins can insert publishes"
  on public.server_publishes for insert with check (
    exists (
      select 1 from public.server_members
      where server_id = server_publishes.server_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
