-- Authors can edit and delete their own chat messages.

alter table public.board_chat_messages
  add column if not exists edited_at timestamptz;

drop policy if exists "board_chat_update_own" on public.board_chat_messages;
create policy "board_chat_update_own" on public.board_chat_messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "board_chat_delete_own" on public.board_chat_messages;
create policy "board_chat_delete_own" on public.board_chat_messages
  for delete to authenticated
  using (author_id = auth.uid());
