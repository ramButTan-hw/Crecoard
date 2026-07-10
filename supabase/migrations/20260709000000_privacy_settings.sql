-- Privacy settings enforcement (Settings → Privacy & Safety)
-- Publishes each user's privacy prefs to their profile so OTHER clients can
-- respect them, and enforces the important ones server-side with RLS so they
-- can't be bypassed by a modified client.

-- ── Profile privacy columns ──────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_dms_from        TEXT    NOT NULL DEFAULT 'everyone'
    CHECK (allow_dms_from IN ('everyone', 'friends', 'none')),
  ADD COLUMN IF NOT EXISTS allow_friend_requests BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Helpers (SECURITY DEFINER so they read regardless of the caller) ──────────

-- Are these two users accepted friends?
CREATE OR REPLACE FUNCTION public.are_friends(a UUID, b UUID)
  RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = a AND f.addressee_id = b)
        OR (f.requester_id = b AND f.addressee_id = a))
  );
$$;

-- May `sender` start a DM with `target`, per target's allow_dms_from?
CREATE OR REPLACE FUNCTION public.can_dm(sender UUID, target UUID)
  RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT CASE (SELECT allow_dms_from FROM public.profiles WHERE id = target)
    WHEN 'none'    THEN FALSE
    WHEN 'friends' THEN public.are_friends(sender, target)
    ELSE TRUE   -- 'everyone' or profile missing
  END;
$$;

-- ── DM conversation creation must respect the OTHER party's DM setting ────────
DROP POLICY IF EXISTS "participants create conversations" ON public.dm_conversations;
CREATE POLICY "participants create conversations"
  ON public.dm_conversations FOR INSERT TO authenticated
  WITH CHECK (
    (user_a = auth.uid() OR user_b = auth.uid())
    -- the creator must be allowed to DM the other participant
    AND public.can_dm(auth.uid(), CASE WHEN user_a = auth.uid() THEN user_b ELSE user_a END)
  );

-- ── Friend requests must respect the addressee's setting ─────────────────────
DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
CREATE POLICY "friendships_insert"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND COALESCE((SELECT allow_friend_requests FROM public.profiles WHERE id = addressee_id), TRUE)
  );
