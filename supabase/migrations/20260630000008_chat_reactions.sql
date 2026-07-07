-- Emoji reactions on board chat messages.
-- One row per (message, user, emoji); grouping/counts are derived on the client.
create table if not exists public.board_chat_reactions (
  message_id uuid        not null references public.board_chat_messages(id) on delete cascade,
  board_id   uuid        not null,   -- denormalised so Realtime can filter by board
  user_id    uuid        not null references auth.users(id) on delete cascade,
  emoji      text        not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists board_chat_reactions_message_idx
  on public.board_chat_reactions (message_id);

alter table public.board_chat_reactions enable row level security;

-- Mirrors board_chat_messages: anyone authenticated can read; you may only
-- add or remove your own reactions.
create policy "board_chat_reactions_read" on public.board_chat_reactions
  for select to authenticated using (true);

create policy "board_chat_reactions_insert" on public.board_chat_reactions
  for insert to authenticated with check (user_id = auth.uid());

create policy "board_chat_reactions_delete" on public.board_chat_reactions
  for delete to authenticated using (user_id = auth.uid());

-- REPLICA IDENTITY FULL so DELETE events carry the full old row (board_id,
-- message_id, user_id, emoji) — needed for the Realtime board filter and for
-- removing the right chip on the client.
alter table public.board_chat_reactions replica identity full;

alter publication supabase_realtime add table public.board_chat_reactions;
