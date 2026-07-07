-- boards: one row per board (personal owned boards OR server shared boards)
-- Full board state is stored as JSONB so the client-side Board type maps directly.

CREATE TABLE IF NOT EXISTS public.boards (
  id          UUID         PRIMARY KEY,          -- matches Board.id (generated client-side)
  user_id     UUID         REFERENCES auth.users(id) ON DELETE CASCADE,
  server_id   UUID         REFERENCES public.servers(id) ON DELETE CASCADE,
  data        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- exactly one of user_id / server_id must be non-null
  CONSTRAINT boards_exactly_one_owner CHECK (num_nonnulls(user_id, server_id) = 1)
);

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

-- ── Personal boards: only the owner can CRUD ────────────────────────────────

CREATE POLICY "users read own boards"
  ON public.boards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users insert own boards"
  ON public.boards FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own boards"
  ON public.boards FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users delete own boards"
  ON public.boards FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Server boards: any server member can CRUD ───────────────────────────────

CREATE POLICY "server members read server boards"
  ON public.boards FOR SELECT TO authenticated
  USING (
    server_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_members.server_id = boards.server_id
        AND server_members.user_id = auth.uid()
    )
  );

CREATE POLICY "server members insert server boards"
  ON public.boards FOR INSERT TO authenticated
  WITH CHECK (
    server_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_members.server_id = boards.server_id
        AND server_members.user_id = auth.uid()
    )
  );

CREATE POLICY "server members update server boards"
  ON public.boards FOR UPDATE TO authenticated
  USING (
    server_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_members.server_id = boards.server_id
        AND server_members.user_id = auth.uid()
    )
  );

-- ── updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_boards_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER boards_updated_at
  BEFORE UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.update_boards_updated_at();
