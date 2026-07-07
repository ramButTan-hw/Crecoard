-- Owner-moderation for viewer contributions (delete-any / pin / approve).
-- RLS on board_item_contributions only lets a viewer touch their OWN rows; these
-- security-definer RPCs let a board moderator act on anyone's contribution after
-- an ownership check, without opening a broad UPDATE/DELETE policy.

-- True when the caller may moderate the given board:
--   • personal board  → caller is boards.user_id
--   • server board    → caller is the server owner, or a member with role owner/admin
create or replace function public.can_moderate_board(p_board_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id
      and (
        b.user_id = auth.uid()
        or exists (
          select 1 from public.servers s
          where s.id = b.server_id and s.owner_id = auth.uid()
        )
        or exists (
          select 1 from public.server_members m
          where m.server_id = b.server_id
            and m.user_id = auth.uid()
            and m.role in ('owner', 'admin')
        )
      )
  );
$$;

revoke execute on function public.can_moderate_board(uuid) from public;
grant  execute on function public.can_moderate_board(uuid) to authenticated;

-- Delete a contribution: allowed for its author (matches RLS) OR a board moderator.
create or replace function public.delete_contribution(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_board uuid; v_author uuid;
begin
  select board_id, author_id into v_board, v_author
    from public.board_item_contributions where id = p_id;
  if v_board is null then return; end if; -- already gone
  if v_author = auth.uid() or public.can_moderate_board(v_board) then
    delete from public.board_item_contributions where id = p_id;
  else
    raise exception 'not authorized to delete this contribution';
  end if;
end;
$$;

revoke execute on function public.delete_contribution(uuid) from public;
grant  execute on function public.delete_contribution(uuid) to authenticated;

-- Pin/unpin a contribution — moderators only.
create or replace function public.set_contribution_pinned(p_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_board uuid;
begin
  select board_id into v_board from public.board_item_contributions where id = p_id;
  if v_board is null then return; end if;
  if not public.can_moderate_board(v_board) then
    raise exception 'not authorized to moderate this board';
  end if;
  update public.board_item_contributions set pinned = p_pinned where id = p_id;
end;
$$;

revoke execute on function public.set_contribution_pinned(uuid, boolean) from public;
grant  execute on function public.set_contribution_pinned(uuid, boolean) to authenticated;

-- Approve/unapprove a contribution (for moderated boxes) — moderators only.
create or replace function public.set_contribution_approved(p_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_board uuid;
begin
  select board_id into v_board from public.board_item_contributions where id = p_id;
  if v_board is null then return; end if;
  if not public.can_moderate_board(v_board) then
    raise exception 'not authorized to moderate this board';
  end if;
  update public.board_item_contributions set approved = p_approved where id = p_id;
end;
$$;

revoke execute on function public.set_contribution_approved(uuid, boolean) from public;
grant  execute on function public.set_contribution_approved(uuid, boolean) to authenticated;
