-- Community marketplace: user-published templates.
-- kind: 'board' = whole board, 'box' = one block, 'item' = a single item (e.g. a custom widget).
-- board_data holds the same { backgroundColor?, boxes: TemplateBox[] } payload for all kinds.

CREATE TABLE IF NOT EXISTS public.community_boards (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT        NOT NULL DEFAULT 'board'
                            CHECK (kind IN ('board', 'box', 'item')),
  name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description   TEXT        NOT NULL DEFAULT '' CHECK (char_length(description) <= 280),
  category      TEXT        NOT NULL DEFAULT 'other'
                            CHECK (category IN ('productivity', 'fitness', 'adhd', 'gaming', 'creative', 'other')),
  tags          TEXT[]      NOT NULL DEFAULT '{}' CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 5),
  author_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name   TEXT        NOT NULL DEFAULT 'Anonymous',
  author_avatar TEXT,
  preview_url   TEXT,
  board_data    JSONB       NOT NULL CHECK (pg_column_size(board_data) <= 1048576), -- 1 MB cap (embedded images bloat fast)
  likes         INT         NOT NULL DEFAULT 0,
  uses          INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_boards_newest     ON public.community_boards (created_at DESC);
CREATE INDEX IF NOT EXISTS community_boards_category   ON public.community_boards (category, created_at DESC);
CREATE INDEX IF NOT EXISTS community_boards_most_liked ON public.community_boards (likes DESC);
CREATE INDEX IF NOT EXISTS community_boards_most_used  ON public.community_boards (uses DESC);

ALTER TABLE public.community_boards ENABLE ROW LEVEL SECURITY;

-- Public gallery: anyone (including guests) can browse
CREATE POLICY "community_boards_select" ON public.community_boards
  FOR SELECT TO anon, authenticated
  USING (true);

-- Publish only as yourself
CREATE POLICY "community_boards_insert" ON public.community_boards
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Unpublish only your own
CREATE POLICY "community_boards_delete" ON public.community_boards
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- No UPDATE policy: likes/uses counters change only through the functions below.

-- ── Likes ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_board_likes (
  board_id   UUID        NOT NULL REFERENCES public.community_boards(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (board_id, user_id)
);

ALTER TABLE public.community_board_likes ENABLE ROW LEVEL SECURITY;

-- Each user can read their own likes (drives the filled-heart state in the UI)
CREATE POLICY "community_board_likes_select" ON public.community_board_likes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Inserts/deletes happen only via toggle_community_board_like below.

-- Keep the denormalized likes counter in sync
CREATE OR REPLACE FUNCTION public.sync_community_board_likes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_boards SET likes = likes + 1 WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_boards SET likes = GREATEST(0, likes - 1) WHERE id = OLD.board_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS community_board_likes_sync ON public.community_board_likes;
CREATE TRIGGER community_board_likes_sync
  AFTER INSERT OR DELETE ON public.community_board_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_board_likes();

-- Toggle a like as the calling user; returns the new state
CREATE OR REPLACE FUNCTION public.toggle_community_board_like(p_board_id UUID)
RETURNS TABLE (liked BOOLEAN, likes INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM community_board_likes l WHERE l.board_id = p_board_id AND l.user_id = v_user) THEN
    DELETE FROM community_board_likes l WHERE l.board_id = p_board_id AND l.user_id = v_user;
    RETURN QUERY SELECT false, b.likes FROM community_boards b WHERE b.id = p_board_id;
  ELSE
    INSERT INTO community_board_likes (board_id, user_id) VALUES (p_board_id, v_user);
    RETURN QUERY SELECT true, b.likes FROM community_boards b WHERE b.id = p_board_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_community_board_like(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.toggle_community_board_like(UUID) TO authenticated;

-- ── Uses counter ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_community_board_uses(p_board_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.community_boards SET uses = uses + 1 WHERE id = p_board_id;
$$;

REVOKE ALL ON FUNCTION public.increment_community_board_uses(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_community_board_uses(UUID) TO anon, authenticated;
