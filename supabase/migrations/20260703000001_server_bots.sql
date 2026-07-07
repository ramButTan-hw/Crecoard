-- Board Bots: Discord-style server-side integrations.
-- A bot is registered per server by an owner/admin, gets a scoped token
-- (only its SHA-256 hash is stored; plaintext is shown exactly once at
-- creation), and acts through /api/bot/* REST routes — it never runs in
-- anyone's browser.

CREATE TABLE IF NOT EXISTS public.server_bots (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id    UUID        NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  avatar       TEXT,       -- single char/emoji or image URL, like member avatars
  token_hash   TEXT        NOT NULL UNIQUE,
  permissions  TEXT[]      NOT NULL DEFAULT '{}',
  created_by   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS server_bots_server ON public.server_bots (server_id);

ALTER TABLE public.server_bots ENABLE ROW LEVEL SECURITY;

-- Owners/admins of the server can see and remove its bots.
-- (Creation goes through the /api/bots route with the service role, because the
-- plaintext token must be generated and hashed server-side.)
CREATE POLICY "server_bots_select" ON public.server_bots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.server_members m
      WHERE m.server_id = server_bots.server_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "server_bots_delete" ON public.server_bots
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.server_members m
      WHERE m.server_id = server_bots.server_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- No INSERT/UPDATE policies: service-role only.
