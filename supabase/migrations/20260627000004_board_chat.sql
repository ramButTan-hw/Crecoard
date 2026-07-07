-- Board chat messages — persisted per chat item (BlockItem with type="chat")
-- Messages are NOT stored in the board JSONB blob; this table is the source of truth.

CREATE TABLE IF NOT EXISTS public.board_chat_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       TEXT         NOT NULL,   -- nanoid() of the BlockItem
  board_id      UUID         NOT NULL,
  author_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name   TEXT         NOT NULL DEFAULT '',
  author_avatar TEXT         NOT NULL DEFAULT '',
  content       TEXT         NOT NULL DEFAULT '',
  gif_url       TEXT,
  image_url     TEXT,
  file_name     TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS board_chat_messages_item_created
  ON public.board_chat_messages (item_id, created_at);

ALTER TABLE public.board_chat_messages ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read messages.
-- A tighter policy joining through boards + server_members can be added later
-- once board access control is fully formalised.
CREATE POLICY "board_chat_read" ON public.board_chat_messages
  FOR SELECT TO authenticated USING (true);

-- Authors can only insert their own messages
CREATE POLICY "board_chat_insert" ON public.board_chat_messages
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.board_chat_messages;
