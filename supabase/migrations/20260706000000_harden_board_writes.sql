-- Harden server-board writes.
--
-- Previously ANY server member could INSERT/UPDATE the board row directly, which
-- meant the kanban "members can edit cards" permission couldn't really be
-- enforced (a member could rewrite the whole board via the API, bypassing the
-- per-item toggle, and clobber the owner's other edits).
--
-- Now only owners/admins may write the board row directly. Members' sanctioned
-- edits (e.g. kanban cards when the owner enables it) go through validated
-- service-role API routes (/api/server-board/kanban), which bypass RLS after
-- checking membership + the per-item permission. SELECT is unchanged — members
-- still read the board they're viewing.

drop policy if exists "server members insert server boards" on public.boards;
drop policy if exists "server members update server boards" on public.boards;

create policy "server admins insert server boards"
  on public.boards for insert to authenticated
  with check (
    server_id is not null and
    exists (
      select 1 from public.server_members
      where server_members.server_id = boards.server_id
        and server_members.user_id = auth.uid()
        and server_members.role in ('owner', 'admin')
    )
  );

create policy "server admins update server boards"
  on public.boards for update to authenticated
  using (
    server_id is not null and
    exists (
      select 1 from public.server_members
      where server_members.server_id = boards.server_id
        and server_members.user_id = auth.uid()
        and server_members.role in ('owner', 'admin')
    )
  );
