-- servers, server_members, and server_invites tables
-- Run in Supabase SQL Editor after 20260627000000_profiles.sql

-- ─── servers ──────────────────────────────────────────────────────────────────

create table if not exists public.servers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  icon        text        not null default '🌐',
  description text        not null default '',
  owner_id    uuid        not null references auth.users(id),
  board_id    uuid        not null default gen_random_uuid(),
  is_public   boolean     not null default false,
  member_count integer    not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── server_members ───────────────────────────────────────────────────────────

create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id   uuid not null references auth.users(id)    on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

-- ─── server_invites ───────────────────────────────────────────────────────────

create table if not exists public.server_invites (
  id         uuid        primary key default gen_random_uuid(),
  server_id  uuid        not null references public.servers(id) on delete cascade,
  created_by uuid        not null references auth.users(id),
  code       text        not null unique
               default substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  expires_at timestamptz,
  max_uses   integer,
  uses_count integer     not null default 0,
  created_at timestamptz not null default now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Enable RLS on all three tables before creating policies

alter table public.servers       enable row level security;
alter table public.server_members enable row level security;
alter table public.server_invites enable row level security;

-- servers policies (server_members now exists)
create policy "Servers visible to members and public"
  on public.servers for select using (
    is_public = true
    or owner_id = auth.uid()
    or exists (
      select 1 from public.server_members
      where server_id = servers.id and user_id = auth.uid()
    )
  );

create policy "Authenticated users can create servers"
  on public.servers for insert with check (auth.uid() = owner_id);

create policy "Owners and admins can update server"
  on public.servers for update using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.server_members
      where server_id = servers.id and user_id = auth.uid() and role = 'admin'
    )
  );

create policy "Owners can delete server"
  on public.servers for delete using (owner_id = auth.uid());

-- server_members policies
create policy "Members can view all members of shared servers"
  on public.server_members for select using (
    server_id in (
      select server_id from public.server_members where user_id = auth.uid()
    )
  );

create policy "Users can join servers"
  on public.server_members for insert with check (auth.uid() = user_id);

create policy "Members can leave, admins can remove others"
  on public.server_members for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.server_members sm2
      where sm2.server_id = server_members.server_id
        and sm2.user_id = auth.uid()
        and sm2.role in ('owner', 'admin')
    )
  );

create policy "Owners and admins can change roles"
  on public.server_members for update using (
    exists (
      select 1 from public.server_members sm2
      where sm2.server_id = server_members.server_id
        and sm2.user_id = auth.uid()
        and sm2.role in ('owner', 'admin')
    )
  );

-- server_invites policies
create policy "Anyone can look up an invite by code"
  on public.server_invites for select using (true);

create policy "Members can create invites for their servers"
  on public.server_invites for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.server_members
      where server_id = server_invites.server_id and user_id = auth.uid()
    )
  );

create policy "Invite creator can delete invite"
  on public.server_invites for delete using (created_by = auth.uid());

-- ─── Triggers ────────────────────────────────────────────────────────────────

-- Auto-add owner as a server member when a new server is created
create or replace function public.handle_new_server()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.server_members (server_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_server_created on public.servers;
create trigger on_server_created
  after insert on public.servers
  for each row execute procedure public.handle_new_server();

-- Keep member_count in sync
create or replace function public.update_server_member_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    update public.servers set member_count = member_count + 1, updated_at = now()
    where id = NEW.server_id;
  elsif TG_OP = 'DELETE' then
    update public.servers set member_count = greatest(member_count - 1, 0), updated_at = now()
    where id = OLD.server_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_server_member_change on public.server_members;
create trigger on_server_member_change
  after insert or delete on public.server_members
  for each row execute procedure public.update_server_member_count();
