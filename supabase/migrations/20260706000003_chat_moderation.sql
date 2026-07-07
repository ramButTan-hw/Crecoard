-- Discord-style chat moderation: server owners/admins can delete ANY message in
-- their server's chat channels. Authors keep the existing self-delete policy — RLS
-- ORs permissive policies, so this is purely additive (author OR moderator).
--
-- board_chat_messages.board_id equals servers.board_id for a server board, so we
-- resolve the moderator's role through servers → server_members.
-- Run in the Supabase SQL Editor.

drop policy if exists "board_chat_delete_moderator" on public.board_chat_messages;
create policy "board_chat_delete_moderator" on public.board_chat_messages
  for delete to authenticated
  using (
    exists (
      select 1
      from public.servers s
      join public.server_members sm on sm.server_id = s.id
      where s.board_id = board_chat_messages.board_id
        and sm.user_id = auth.uid()
        and sm.role in ('owner', 'admin')
    )
  );
