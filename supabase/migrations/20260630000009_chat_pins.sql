-- Pinned chat messages: a message can be pinned within its (board, channel).
alter table public.board_chat_messages
  add column if not exists pinned    boolean     not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;

-- Index the pins for a channel, newest first (partial — only pinned rows).
create index if not exists board_chat_messages_pinned_idx
  on public.board_chat_messages (board_id, channel, pinned_at desc)
  where pinned;

-- Pin/unpin via a security-definer RPC so we don't have to open a broad UPDATE
-- policy on board_chat_messages (which would also let anyone edit content).
-- Mirrors the current loose model: any authenticated user can pin. A board
-- membership check can be layered in here later without touching the client.
create or replace function public.set_chat_message_pinned(p_message_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.board_chat_messages
     set pinned    = p_pinned,
         pinned_at = case when p_pinned then now()        else null end,
         pinned_by = case when p_pinned then auth.uid()   else null end
   where id = p_message_id;
end;
$$;

revoke execute on function public.set_chat_message_pinned(uuid, boolean) from public;
grant  execute on function public.set_chat_message_pinned(uuid, boolean) to authenticated;

-- board_chat_messages is already in the supabase_realtime publication (migration
-- 004), so UPDATE events for pin changes broadcast automatically. The new row
-- carries board_id, so the existing board_id Realtime filter still applies.
