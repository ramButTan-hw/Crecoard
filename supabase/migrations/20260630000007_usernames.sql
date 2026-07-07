-- Unique usernames (handles). The UUID stays the immutable internal id; this is
-- a separate, user-changeable unique handle (Discord-style).
alter table public.profiles add column if not exists username text;

-- Case-insensitive uniqueness; NULLs (users who haven't set one yet) are allowed.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- Live availability check (case-insensitive, ignores the caller's own handle).
create or replace function public.username_available(p_username text)
returns boolean language sql security definer set search_path = '' as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(p_username)) and id <> auth.uid()
  );
$$;

-- Set the caller's username with server-side validation + uniqueness.
create or replace function public.set_username(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_clean text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if v_clean !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid username'; end if;
  if exists (select 1 from public.profiles where lower(username) = v_clean and id <> auth.uid()) then
    raise exception 'username taken';
  end if;
  update public.profiles set username = v_clean, updated_at = now() where id = auth.uid();
  return v_clean;
end;
$$;

revoke execute on function public.username_available(text) from public;
revoke execute on function public.set_username(text)       from public;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.set_username(text)       to authenticated;
