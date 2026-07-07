-- Fix server-invite security.
--
-- Three problems in 20260627000001_servers.sql:
--   1. server_invites SELECT policy was `using (true)` → anyone (incl. anon)
--      could enumerate every invite code for every server.
--   2. server_members INSERT policy was `with check (auth.uid() = user_id)` →
--      any authenticated user could self-insert into ANY server without an
--      invite. The invite code was never actually required to join.
--   3. uses_count / expiry / max_uses were only enforced in client code, and
--      the client wrote a wrong uses_count value (the server member_count).
--
-- Fix: resolve and redeem invites through SECURITY DEFINER functions, and lock
-- down the underlying tables so the only ways to become a member are (a) the
-- new-server owner trigger or (b) redeeming a valid invite via redeem_invite().

-- ── 1. server_invites: drop the public read, scope to members/creator ─────────
drop policy if exists "Anyone can look up an invite by code" on public.server_invites;

create policy "Members can view their server's invites"
  on public.server_invites for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.server_members
      where server_id = server_invites.server_id and user_id = auth.uid()
    )
  );

-- ── 2. server_members: remove the unguarded self-join ─────────────────────────
-- Joining is now done only by redeem_invite() (SECURITY DEFINER, bypasses RLS)
-- or the on_server_created owner trigger. No direct client INSERT is allowed.
drop policy if exists "Users can join servers" on public.server_members;

-- ── 3. get_invite(code): preview a single invite, no enumeration ──────────────
create or replace function public.get_invite(invite_code text)
returns table (
  code               text,
  server_id          uuid,
  server_name        text,
  server_icon        text,
  server_description text,
  member_count       integer,
  is_public          boolean,
  expired            boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    i.code,
    i.server_id,
    s.name,
    s.icon,
    s.description,
    s.member_count,
    s.is_public,
    (i.expires_at is not null and i.expires_at < now())
      or (i.max_uses is not null and i.uses_count >= i.max_uses) as expired
  from public.server_invites i
  join public.servers s on s.id = i.server_id
  where i.code = invite_code
  limit 1;
$$;

-- ── 4. redeem_invite(code): validate the code and join the caller ─────────────
create or replace function public.redeem_invite(invite_code text)
returns uuid                       -- the server_id that was joined
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_invite public.server_invites;
begin
  -- Guests / unauthenticated callers cannot join.
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_invite from public.server_invites where code = invite_code;
  if not found then
    raise exception 'invalid invite';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  if v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses then
    raise exception 'invite limit reached';
  end if;

  -- Idempotent: already a member → just return the server id (don't bump uses).
  if exists (
    select 1 from public.server_members
    where server_id = v_invite.server_id and user_id = v_uid
  ) then
    return v_invite.server_id;
  end if;

  insert into public.server_members (server_id, user_id, role)
  values (v_invite.server_id, v_uid, 'member');

  update public.server_invites
    set uses_count = uses_count + 1
    where id = v_invite.id;

  return v_invite.server_id;
end;
$$;

-- ── 5. Grants ─────────────────────────────────────────────────────────────────
-- get_invite is previewable by logged-out visitors who hold the exact code.
-- redeem_invite requires a real authenticated session (blocks guests).
revoke all on function public.get_invite(text)    from public;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.get_invite(text)    to anon, authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
