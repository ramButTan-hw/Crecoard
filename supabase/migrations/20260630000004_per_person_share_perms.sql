-- Per-person collaborator permissions. The link toggle now only sets the
-- default for NEW people; each existing collaborator is managed individually
-- (so the owner can re-permission someone who's offline).

-- set_board_share no longer force-syncs existing collaborators.
create or replace function public.set_board_share(p_board_id uuid, p_can_edit boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  select token into v_token from public.board_share_links where board_id = p_board_id;
  if v_token is null then
    insert into public.board_share_links (board_id, created_by, can_edit)
      values (p_board_id, auth.uid(), p_can_edit) returning token into v_token;
  else
    update public.board_share_links set can_edit = p_can_edit where board_id = p_board_id;
  end if;
  return v_token;
end;
$$;

-- Set one collaborator's permission (owner only) — works whether they're online or not.
create or replace function public.set_collaborator_can_edit(p_board_id uuid, p_user_id uuid, p_can_edit boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  update public.board_collaborators set can_edit = p_can_edit
    where board_id = p_board_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.set_collaborator_can_edit(uuid, uuid, boolean) from public;
grant execute on function public.set_collaborator_can_edit(uuid, uuid, boolean) to authenticated;
