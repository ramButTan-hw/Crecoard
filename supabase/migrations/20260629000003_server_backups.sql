-- server_backups: up to 3 named manual backup slots per server board.
-- Slot is 1-3; UNIQUE(server_id, slot) enforces the 3-slot limit.
-- Use UPSERT with onConflict:"server_id,slot" to overwrite an existing slot.

CREATE TABLE IF NOT EXISTS public.server_backups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id    uuid        NOT NULL,
  slot         integer     NOT NULL CHECK (slot BETWEEN 1 AND 3),
  label        text,
  snapshot     jsonb       NOT NULL,
  created_by   uuid,
  creator_name text        NOT NULL DEFAULT 'Unknown',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, slot)
);

ALTER TABLE public.server_backups ENABLE ROW LEVEL SECURITY;

-- Any server member can read backups
CREATE POLICY "server_backups_select" ON public.server_backups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_members.server_id = server_backups.server_id
        AND server_members.user_id   = auth.uid()
    )
  );

-- Owners and admins can create / overwrite backup slots
CREATE POLICY "server_backups_insert" ON public.server_backups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_members.server_id = server_backups.server_id
        AND server_members.user_id   = auth.uid()
        AND server_members.role      IN ('owner', 'admin')
    )
  );

CREATE POLICY "server_backups_update" ON public.server_backups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_members.server_id = server_backups.server_id
        AND server_members.user_id   = auth.uid()
        AND server_members.role      IN ('owner', 'admin')
    )
  );

-- Only owners can delete backup slots
CREATE POLICY "server_backups_delete" ON public.server_backups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_members.server_id = server_backups.server_id
        AND server_members.user_id   = auth.uid()
        AND server_members.role      = 'owner'
    )
  );
