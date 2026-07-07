-- Block archives: snapshots of a block's contents, written by recurring block
-- resets (kind 'auto') or on demand from the block context menu (kind 'manual').
-- Client keeps a rolling window of unpinned autos per block (MAX_AUTO_PER_BOX);
-- pinned rows are kept until the user deletes them.

CREATE TABLE IF NOT EXISTS public.block_archives (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      UUID         NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  box_id        TEXT         NOT NULL,                 -- client-generated Box.id inside boards.data
  user_id       UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  title         TEXT         NOT NULL DEFAULT '',
  period_start  TIMESTAMPTZ,                           -- span the snapshot covered (auto resets)
  period_end    TIMESTAMPTZ,
  kind          TEXT         NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto', 'manual')),
  pinned        BOOLEAN      NOT NULL DEFAULT FALSE,
  data          JSONB        NOT NULL,                 -- { items: BlockItem[] }
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS block_archives_board_box_idx
  ON public.block_archives (board_id, box_id, created_at DESC);

-- Two clients racing the same reset boundary write once: the second insert hits
-- this unique index and is treated as success by the client.
CREATE UNIQUE INDEX IF NOT EXISTS block_archives_auto_boundary_idx
  ON public.block_archives (box_id, period_end)
  WHERE kind = 'auto';

ALTER TABLE public.block_archives ENABLE ROW LEVEL SECURITY;

-- Access mirrors the parent board: the personal-board owner, or any member of
-- the server the board belongs to.
CREATE OR REPLACE FUNCTION public.can_access_board(p_board_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boards b
    WHERE b.id = p_board_id
      AND (
        b.user_id = auth.uid()
        OR (
          b.server_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.server_members m
            WHERE m.server_id = b.server_id AND m.user_id = auth.uid()
          )
        )
      )
  );
$$;

CREATE POLICY "board access read archives"
  ON public.block_archives FOR SELECT TO authenticated
  USING (public.can_access_board(board_id));

CREATE POLICY "board access insert archives"
  ON public.block_archives FOR INSERT TO authenticated
  WITH CHECK (public.can_access_board(board_id) AND user_id = auth.uid());

CREATE POLICY "board access update archives"
  ON public.block_archives FOR UPDATE TO authenticated
  USING (public.can_access_board(board_id));

CREATE POLICY "board access delete archives"
  ON public.block_archives FOR DELETE TO authenticated
  USING (public.can_access_board(board_id));
