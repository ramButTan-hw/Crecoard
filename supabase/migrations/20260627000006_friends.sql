-- Friend system: friendships between users.
-- status: 'pending' = request sent, 'accepted' = mutual friends

CREATE TABLE IF NOT EXISTS public.friendships (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_friend CHECK (requester_id != addressee_id)
);

-- One friendship row per pair regardless of direction
CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair
  ON public.friendships (
    LEAST(requester_id::text,  addressee_id::text),
    GREATEST(requester_id::text, addressee_id::text)
  );

CREATE INDEX IF NOT EXISTS friendships_addressee ON public.friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester ON public.friendships (requester_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Each user sees only their own friendships
CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Only the requester can create a friendship request
CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Either party can remove (unfriend / decline)
CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Only the addressee can accept (update status to 'accepted')
CREATE POLICY "friendships_update" ON public.friendships
  FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid())
  WITH CHECK (status = 'accepted');
