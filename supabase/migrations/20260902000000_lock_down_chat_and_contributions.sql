-- Lock down board chat + item contributions.
--
-- All three tables shipped with `USING (true)` SELECT policies and INSERT
-- policies that only check authorship — never board access. Consequences:
--   • every authenticated account could read every board's chat, including
--     private personal boards (board_chat_messages, board_chat_reactions)
--   • every account could post into any board's chat channels — which also
--     fires the board_chat_push_webhook trigger per insert (cost amplification)
--   • every account could read unapproved contributions on moderated boxes
--     (defeating moderation), insert into any board, and self-approve/self-pin
--     their own entries via contrib_update_own
--
-- Access is now scoped with the same helpers used elsewhere
-- (can_access_board / can_moderate_board). Service-role API routes
-- (bot/chat, push/chat) bypass RLS and are unaffected. Realtime subscribers
-- are filtered by these policies too, which is the intended behaviour.

-- ── board_chat_messages ───────────────────────────────────────────────────────
-- board_chat_delete_moderator is kept as-is (already scoped to server
-- owner/admin via servers.board_id).

drop policy if exists "board_chat_read"       on public.board_chat_messages;
drop policy if exists "board_chat_insert"     on public.board_chat_messages;
drop policy if exists "board_chat_update_own" on public.board_chat_messages;
drop policy if exists "board_chat_delete_own" on public.board_chat_messages;

create policy "board_chat_read" on public.board_chat_messages
  for select to authenticated
  using (public.can_access_board(board_id::text));

create policy "board_chat_insert" on public.board_chat_messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_board(board_id::text));

create policy "board_chat_update_own" on public.board_chat_messages
  for update to authenticated
  using      (author_id = auth.uid() and public.can_access_board(board_id::text))
  with check (author_id = auth.uid() and public.can_access_board(board_id::text));

create policy "board_chat_delete_own" on public.board_chat_messages
  for delete to authenticated
  using (author_id = auth.uid() and public.can_access_board(board_id::text));

-- ── board_chat_reactions ──────────────────────────────────────────────────────
-- board_id is denormalised on the row (for Realtime filtering), so the same
-- helper applies directly.

drop policy if exists "board_chat_reactions_read"   on public.board_chat_reactions;
drop policy if exists "board_chat_reactions_insert" on public.board_chat_reactions;
drop policy if exists "board_chat_reactions_delete" on public.board_chat_reactions;

create policy "board_chat_reactions_read" on public.board_chat_reactions
  for select to authenticated
  using (public.can_access_board(board_id::text));

create policy "board_chat_reactions_insert" on public.board_chat_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_board(board_id::text));

create policy "board_chat_reactions_delete" on public.board_chat_reactions
  for delete to authenticated
  using (user_id = auth.uid() and public.can_access_board(board_id::text));

-- ── board_item_contributions ──────────────────────────────────────────────────
-- Readers see approved entries, their own pending entries, or everything if
-- they can moderate the board.

drop policy if exists "contrib_read"       on public.board_item_contributions;
drop policy if exists "contrib_insert"     on public.board_item_contributions;
drop policy if exists "contrib_update_own" on public.board_item_contributions;
drop policy if exists "contrib_delete_own" on public.board_item_contributions;

create policy "contrib_read" on public.board_item_contributions
  for select to authenticated
  using (
    public.can_access_board(board_id::text)
    and (approved or author_id = auth.uid() or public.can_moderate_board(board_id))
  );

create policy "contrib_insert" on public.board_item_contributions
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_board(board_id::text));

create policy "contrib_update_own" on public.board_item_contributions
  for update to authenticated
  using      (author_id = auth.uid() and public.can_access_board(board_id::text))
  with check (author_id = auth.uid() and public.can_access_board(board_id::text));

create policy "contrib_delete_own" on public.board_item_contributions
  for delete to authenticated
  using (author_id = auth.uid() and public.can_access_board(board_id::text));

-- RLS cannot restrict which columns an UPDATE touches, so block non-moderators
-- from flipping moderation fields (approved/pinned) on their own rows — the
-- sanctioned path for that is the set_contribution_approved /
-- set_contribution_pinned RPCs, which check can_moderate_board.
create or replace function public.contrib_guard_moderation_fields()
returns trigger language plpgsql as $$
begin
  if (new.approved is distinct from old.approved
      or new.pinned is distinct from old.pinned)
     and not public.can_moderate_board(old.board_id) then
    raise exception 'not authorized to change moderation state';
  end if;
  return new;
end;
$$;

revoke execute on function public.contrib_guard_moderation_fields() from public, anon, authenticated;

drop trigger if exists contrib_guard_moderation_fields on public.board_item_contributions;
create trigger contrib_guard_moderation_fields
  before update on public.board_item_contributions
  for each row execute function public.contrib_guard_moderation_fields();
