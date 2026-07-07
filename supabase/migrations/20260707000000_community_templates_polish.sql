-- Community templates polish:
--   * per-user UNIQUE "uses" counting (was blindly incremented on every apply,
--     so one user re-adding a board spammed the counter)
--   * a screenshot gallery so authors can showcase a template richly, not just
--     a single cover image
--
-- NOTE: existing `uses` values are left as-is (there is no historical per-user
-- data to rebuild them from). From here on the counter only moves for a new
-- distinct signed-in user, and can never be inflated by repeats.

-- ── Screenshot gallery ──────────────────────────────────────────────────────────
-- Hero/cover stays in preview_url; these are extra showcase shots for the detail view.
ALTER TABLE public.community_boards
  ADD COLUMN IF NOT EXISTS preview_images TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.community_boards
  DROP CONSTRAINT IF EXISTS community_boards_preview_images_len;
ALTER TABLE public.community_boards
  ADD CONSTRAINT community_boards_preview_images_len
  CHECK (array_length(preview_images, 1) IS NULL OR array_length(preview_images, 1) <= 6);

-- ── Unique uses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_board_uses (
  board_id   UUID        NOT NULL REFERENCES public.community_boards(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (board_id, user_id)
);

ALTER TABLE public.community_board_uses ENABLE ROW LEVEL SECURITY;

-- Each user can read their own uses (drives the "Downloaded ✓" state in the UI)
DROP POLICY IF EXISTS "community_board_uses_select" ON public.community_board_uses;
CREATE POLICY "community_board_uses_select" ON public.community_board_uses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Inserts happen only via track_community_board_use() below.

-- Keep the denormalized uses counter in sync with distinct users
CREATE OR REPLACE FUNCTION public.sync_community_board_uses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_boards SET uses = uses + 1 WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_boards SET uses = GREATEST(0, uses - 1) WHERE id = OLD.board_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS community_board_uses_sync ON public.community_board_uses;
CREATE TRIGGER community_board_uses_sync
  AFTER INSERT OR DELETE ON public.community_board_uses
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_board_uses();

-- Record a use for the calling user (deduped). Returns the current uses count.
-- Guests may still apply templates, but are not counted (no stable identity).
CREATE OR REPLACE FUNCTION public.track_community_board_use(p_board_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_uses INT;
BEGIN
  IF v_user IS NOT NULL THEN
    INSERT INTO community_board_uses (board_id, user_id)
    VALUES (p_board_id, v_user)
    ON CONFLICT (board_id, user_id) DO NOTHING;
  END IF;
  SELECT uses INTO v_uses FROM community_boards WHERE id = p_board_id;
  RETURN COALESCE(v_uses, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.track_community_board_use(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.track_community_board_use(UUID) TO anon, authenticated;

-- The old blind incrementer is superseded; keep it defined but no longer called.
-- (Left in place so any in-flight client using it degrades gracefully.)

-- ── Category counts (drives the tab badges) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_category_counts()
RETURNS TABLE (category TEXT, n BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT category, COUNT(*) FROM community_boards GROUP BY category;
$$;

REVOKE ALL ON FUNCTION public.community_category_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.community_category_counts() TO anon, authenticated;

-- ── Star ratings ────────────────────────────────────────────────────────────────
-- Denormalized sum + count on the board; per-user rows keep it one-vote-per-user.
ALTER TABLE public.community_boards
  ADD COLUMN IF NOT EXISTS rating_sum   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.community_board_ratings (
  board_id   UUID        NOT NULL REFERENCES public.community_boards(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating     INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (board_id, user_id)
);

ALTER TABLE public.community_board_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_board_ratings_select" ON public.community_board_ratings;
CREATE POLICY "community_board_ratings_select" ON public.community_board_ratings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Writes only via rate_community_board().

CREATE OR REPLACE FUNCTION public.sync_community_board_ratings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_boards
      SET rating_sum = rating_sum + NEW.rating, rating_count = rating_count + 1
      WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.community_boards
      SET rating_sum = rating_sum - OLD.rating + NEW.rating
      WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_boards
      SET rating_sum = GREATEST(0, rating_sum - OLD.rating), rating_count = GREATEST(0, rating_count - 1)
      WHERE id = OLD.board_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS community_board_ratings_sync ON public.community_board_ratings;
CREATE TRIGGER community_board_ratings_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.community_board_ratings
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_board_ratings();

-- Upsert the caller's rating (1..5); returns the board's new sum + count.
CREATE OR REPLACE FUNCTION public.rate_community_board(p_board_id UUID, p_rating INT)
RETURNS TABLE (r_sum INT, r_count INT)
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
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating out of range';
  END IF;
  INSERT INTO community_board_ratings (board_id, user_id, rating)
  VALUES (p_board_id, v_user, p_rating)
  ON CONFLICT (board_id, user_id)
  DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW();
  RETURN QUERY SELECT b.rating_sum, b.rating_count FROM community_boards b WHERE b.id = p_board_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_community_board(UUID, INT) FROM public;
GRANT EXECUTE ON FUNCTION public.rate_community_board(UUID, INT) TO authenticated;
