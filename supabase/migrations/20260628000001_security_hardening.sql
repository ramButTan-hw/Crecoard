-- Security hardening: revoke direct EXECUTE on trigger/security-definer functions
-- and lock down is_member_of_server to authenticated users only.

-- ── 1. Trigger functions: revoke EXECUTE from all user roles ──────────────────
-- Triggers are invoked by the DB engine, not by user code. Users have no reason
-- to call these directly; revoking EXECUTE closes that surface without breaking
-- anything — the triggers still fire normally on INSERT/UPDATE/DELETE.

REVOKE EXECUTE ON FUNCTION public.handle_new_user()             FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_server()           FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_server_member_count()  FROM PUBLIC, authenticated;

-- ── 2. is_member_of_server: anon cannot call, authenticated can ───────────────
-- This function is used by RLS policies on server_members. Anonymous users
-- should never be able to probe server membership data; revoking from PUBLIC
-- (the anon role) prevents that. Authenticated users still need EXECUTE so the
-- RLS policies can evaluate correctly.

-- Recreate with an explicit search_path to also silence the search-path warning.
-- The body is the same as the version manually created in the dashboard.
CREATE OR REPLACE FUNCTION public.is_member_of_server(server_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = server_uuid
      AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_member_of_server(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_member_of_server(uuid) TO authenticated;

-- ── 3. Scope server_members SELECT policy to authenticated only ───────────────
-- Adding TO authenticated means the anon role sees the policy as a deny-all
-- (no rows returned) rather than attempting to call is_member_of_server and
-- hitting a permission error.

DROP POLICY IF EXISTS "Members can view all members of shared servers" ON public.server_members;
CREATE POLICY "Members can view all members of shared servers"
  ON public.server_members FOR SELECT TO authenticated
  USING (public.is_member_of_server(server_id));

-- ── 4. Fix update_boards_updated_at search_path ───────────────────────────────
-- Low priority but included here: add SET search_path = '' to silence the
-- "Function Search Path Mutable" advisor warning.

CREATE OR REPLACE FUNCTION public.update_boards_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
