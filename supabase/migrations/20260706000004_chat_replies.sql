-- Discord-style replies for board chat. We denormalize the replied-to author +
-- text snippet onto the reply so the quoted preview survives even if the original
-- is later deleted. reply_to_id is TEXT (not a FK) so it tolerates optimistic ids
-- and deleted originals; it's only used for jump-to-original.
-- Run in the Supabase SQL Editor.

alter table public.board_chat_messages
  add column if not exists reply_to_id     text,
  add column if not exists reply_to_author text,
  add column if not exists reply_to_text   text;
