-- dm_conversations: one row per ordered user pair (user_a < user_b by UUID)
-- The ordering constraint prevents duplicate conversations for the same pair.

CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT dm_conversations_ordered CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read own conversations"
  ON public.dm_conversations FOR SELECT TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid());

CREATE POLICY "participants create conversations"
  ON public.dm_conversations FOR INSERT TO authenticated
  WITH CHECK (user_a = auth.uid() OR user_b = auth.uid());

-- ── dm_messages ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID         NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  author_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         TEXT         NOT NULL DEFAULT '',
  gif_url         TEXT,
  image_url       TEXT,
  file_name       TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dm_messages_conversation_created
  ON public.dm_messages(conversation_id, created_at);

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read messages"
  ON public.dm_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_conversations dc
      WHERE dc.id = dm_messages.conversation_id
        AND (dc.user_a = auth.uid() OR dc.user_b = auth.uid())
    )
  );

CREATE POLICY "authors insert messages"
  ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Enable Supabase Realtime so new messages are pushed to subscribers instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
