-- Personal board sharing: an owner shares a board via a link, and any signed-in
-- user who opens that link becomes a collaborator who can open and edit it live.

-- ── Tables ────────────────────────────────────────────────────────────────────
create table if not exists public.board_collaborators (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id  uuid not null references auth.users(id)    on delete cascade,
  can_edit boolean not null default true,
  added_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.board_share_links (
  token      text primary key
               default substring(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  board_id   uuid not null references public.boards(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  can_edit   boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists board_share_links_board_idx
  on public.board_share_links(board_id);

alter table public.board_collaborators enable row level security;
alter table public.board_share_links   enable row level security;

-- ── Security-definer helpers (avoid RLS recursion in the boards policies) ──────
create or replace function public.is_board_collaborator(p_board_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.board_collaborators c
    where c.board_id = p_board_id and c.user_id = auth.uid()
  );
$$;

create or replace function public.is_board_editor(p_board_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.board_collaborators c
    where c.board_id = p_board_id and c.user_id = auth.uid() and c.can_edit
  );
$$;

revoke execute on function public.is_board_collaborator(uuid) from public;
revoke execute on function public.is_board_editor(uuid)       from public;
grant execute on function public.is_board_collaborator(uuid) to authenticated;
grant execute on function public.is_board_editor(uuid)       to authenticated;

-- ── RLS: collaborators ────────────────────────────────────────────────────────
create policy "see own or owned collaborator rows"
  on public.board_collaborators for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
  );

create policy "owner or self removes collaborator"
  on public.board_collaborators for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
  );

-- ── RLS: share links (owner-managed) ──────────────────────────────────────────
create policy "owner manages share links"
  on public.board_share_links for all to authenticated
  using       (exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
  with check  (exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()));

-- ── Extend boards RLS for collaborators ───────────────────────────────────────
create policy "collaborators read shared boards"
  on public.boards for select to authenticated
  using (public.is_board_collaborator(id));

create policy "editors update shared boards"
  on public.boards for update to authenticated
  using (public.is_board_editor(id));

-- Prevent a collaborator from hijacking ownership via a crafted update.
create or replace function public.boards_guard_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.user_id is distinct from old.user_id
      or new.server_id is distinct from old.server_id)
     and old.user_id is distinct from auth.uid() then
    raise exception 'cannot change board ownership';
  end if;
  return new;
end;
$$;

drop trigger if exists boards_guard_owner on public.boards;
create trigger boards_guard_owner before update on public.boards
  for each row execute function public.boards_guard_owner();

-- ── Create / fetch a share link for a board the caller owns ────────────────────
create or replace function public.create_board_share(p_board_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  select token into v_token from public.board_share_links where board_id = p_board_id;
  if v_token is null then
    insert into public.board_share_links (board_id, created_by)
      values (p_board_id, auth.uid())
      returning token into v_token;
  end if;
  return v_token;
end;
$$;

-- ── Redeem a share link: add caller as collaborator, return the board id ───────
create or replace function public.redeem_board_share(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link public.board_share_links;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_link from public.board_share_links where token = p_token;
  if not found then raise exception 'invalid share link'; end if;
  insert into public.board_collaborators (board_id, user_id, can_edit)
    values (v_link.board_id, v_uid, v_link.can_edit)
    on conflict (board_id, user_id) do nothing;
  return v_link.board_id;
end;
$$;

revoke execute on function public.create_board_share(uuid) from public;
revoke execute on function public.redeem_board_share(text) from public;
grant execute on function public.create_board_share(uuid) to authenticated;
grant execute on function public.redeem_board_share(text) to authenticated;
