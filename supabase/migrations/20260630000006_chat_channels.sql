-- Make chat channels real. Messages now belong to a (board, channel) stream
-- instead of a single chat item, so multiple chat boxes pinned to the same
-- channel share one conversation (the "channels + contextual pins" model).
alter table public.board_chat_messages
  add column if not exists channel text not null default 'general';

create index if not exists board_chat_messages_channel_idx
  on public.board_chat_messages (board_id, channel, created_at);
