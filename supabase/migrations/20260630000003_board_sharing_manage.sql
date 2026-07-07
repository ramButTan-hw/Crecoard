-- Share management: set link permission (view vs edit) and rotate the link.

-- Set the share-link permission and sync it to existing collaborators, so
-- flipping a board to "view only" downgrades everyone already on it.
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
  update public.board_collaborators set can_edit = p_can_edit where board_id = p_board_id;
  return v_token;
end;
$$;

-- Rotate the link: invalidate the old token and issue a new one (same
-- permission). Existing collaborators keep their access; the old URL stops
-- letting new people in.
create or replace function public.reset_board_share(p_board_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_can_edit boolean; v_token text;
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  select can_edit into v_can_edit from public.board_share_links where board_id = p_board_id;
  delete from public.board_share_links where board_id = p_board_id;
  insert into public.board_share_links (board_id, created_by, can_edit)
    values (p_board_id, auth.uid(), coalesce(v_can_edit, true)) returning token into v_token;
  return v_token;
end;
$$;

revoke execute on function public.set_board_share(uuid, boolean) from public;
revoke execute on function public.reset_board_share(uuid)        from public;
grant execute on function public.set_board_share(uuid, boolean) to authenticated;
grant execute on function public.reset_board_share(uuid)        to authenticated;
