-- server_audit_logs: immutable append-only record of board and server changes
-- Run in Supabase SQL Editor after 20260627000001_servers.sql

create table if not exists public.server_audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  server_id   uuid        not null references public.servers(id) on delete cascade,
  user_id     uuid        references auth.users(id) on delete set null,
  username    text        not null default 'Unknown',
  action      text        not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- Fast lookup: most-recent entries for a given server
create index if not exists server_audit_logs_server_created_idx
  on public.server_audit_logs(server_id, created_at desc);

alter table public.server_audit_logs enable row level security;

-- Any member of the server can read the log
create policy "Members can view audit log"
  on public.server_audit_logs for select using (
    exists (
      select 1 from public.server_members
      where server_id = server_audit_logs.server_id
        and user_id = auth.uid()
    )
  );

-- Members can append their own entries (role enforcement is done in app code)
create policy "Members can insert audit entries"
  on public.server_audit_logs for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.server_members
      where server_id = server_audit_logs.server_id
        and user_id = auth.uid()
    )
  );
