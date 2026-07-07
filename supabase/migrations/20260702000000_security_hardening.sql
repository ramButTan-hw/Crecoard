-- Security hardening pass — addresses the Supabase database-linter findings:
--   0024 rls_policy_always_true            → file_bank_files scoped policies
--   0025 public_bucket_allows_listing      → drop broad SELECT on storage.objects
--   0028/0029 *_security_definer_function_executable
--       → trigger functions: no EXECUTE for API roles at all
--       → session RPCs: authenticated only (re-asserted idempotently)
--       → anon keeps exactly get_invite + username_available (pre-login flows)
-- (auth_leaked_password_protection is a Dashboard toggle — no SQL equivalent.)

-- ── Helper: resolve a client board id (may carry a ":live" suffix) to uuid ────

create or replace function public.board_uuid_of(p_board_id text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when p_board_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(:live)?$'
      then substring(p_board_id from 1 for 36)::uuid
    else null
  end
$$;

revoke execute on function public.board_uuid_of(text) from public, anon;
grant  execute on function public.board_uuid_of(text) to authenticated;

-- ── Helper: can the caller access (view/contribute to) this board? ───────────
-- Owner, personal-board collaborator, or member of the owning server.

create or replace function public.can_access_board(p_board_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards b
    where b.id = public.board_uuid_of(p_board_id)
      and (
        b.user_id = auth.uid()
        or exists (
          select 1 from public.board_collaborators c
          where c.board_id = b.id and c.user_id = auth.uid()
        )
        or exists (
          select 1 from public.server_members m
          where m.server_id = b.server_id and m.user_id = auth.uid()
        )
      )
  );
$$;

revoke execute on function public.can_access_board(text) from public, anon;
grant  execute on function public.can_access_board(text) to authenticated;

-- ── 0024: file_bank_files — scope to boards the caller can actually access ──

drop policy if exists "file_bank_read"   on public.file_bank_files;
drop policy if exists "file_bank_insert" on public.file_bank_files;
drop policy if exists "file_bank_delete" on public.file_bank_files;

create policy "file_bank_read" on public.file_bank_files
  for select to authenticated
  using (public.can_access_board(board_id));

create policy "file_bank_insert" on public.file_bank_files
  for insert to authenticated
  with check (public.can_access_board(board_id));

-- Board owner / server owner+admin may clean up entries
create policy "file_bank_delete" on public.file_bank_files
  for delete to authenticated
  using (public.can_moderate_board(public.board_uuid_of(board_id)));

-- ── 0025: public bucket listing — drop the broad SELECT policy ──────────────
-- The app only ever fetches objects through their public URLs
-- (/storage/v1/object/public/…), which needs NO policy on a public bucket.
-- The SELECT policy only enabled list()/search(), i.e. enumerating every
-- user's uploads. Nothing in the client calls list() on this bucket.

drop policy if exists "uploads_read" on storage.objects;

-- ── 0028/0029: trigger functions must not be callable via /rest/v1/rpc ───────
-- Triggers execute as the table owner; they need no EXECUTE grant for API roles.

revoke execute on function public.boards_guard_owner()         from public, anon, authenticated;
revoke execute on function public.handle_new_server()          from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.update_server_member_count() from public, anon, authenticated;

-- ── 0028/0029: session RPCs — authenticated only ─────────────────────────────
-- Several of these were already revoked in earlier migrations; this re-asserts
-- the full set idempotently in case an environment missed one.

revoke execute on function public.can_moderate_board(uuid)                    from public, anon;
revoke execute on function public.create_board_share(uuid)                    from public, anon;
revoke execute on function public.delete_contribution(uuid)                   from public, anon;
revoke execute on function public.is_board_collaborator(uuid)                 from public, anon;
revoke execute on function public.is_board_editor(uuid)                       from public, anon;
revoke execute on function public.is_member_of_server(uuid)                   from public, anon;
revoke execute on function public.redeem_board_share(text)                    from public, anon;
revoke execute on function public.redeem_invite(text)                         from public, anon;
revoke execute on function public.reset_board_share(uuid)                     from public, anon;
revoke execute on function public.set_board_share(uuid, boolean)              from public, anon;
revoke execute on function public.set_chat_message_pinned(uuid, boolean)      from public, anon;
revoke execute on function public.set_collaborator_can_edit(uuid, uuid, boolean) from public, anon;
revoke execute on function public.set_contribution_approved(uuid, boolean)    from public, anon;
revoke execute on function public.set_contribution_pinned(uuid, boolean)      from public, anon;
revoke execute on function public.set_username(text)                          from public, anon;

grant execute on function public.can_moderate_board(uuid)                     to authenticated;
grant execute on function public.create_board_share(uuid)                     to authenticated;
grant execute on function public.delete_contribution(uuid)                    to authenticated;
grant execute on function public.is_board_collaborator(uuid)                  to authenticated;
grant execute on function public.is_board_editor(uuid)                        to authenticated;
grant execute on function public.is_member_of_server(uuid)                    to authenticated;
grant execute on function public.redeem_board_share(text)                     to authenticated;
grant execute on function public.redeem_invite(text)                          to authenticated;
grant execute on function public.reset_board_share(uuid)                      to authenticated;
grant execute on function public.set_board_share(uuid, boolean)               to authenticated;
grant execute on function public.set_chat_message_pinned(uuid, boolean)       to authenticated;
grant execute on function public.set_collaborator_can_edit(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_contribution_approved(uuid, boolean)     to authenticated;
grant execute on function public.set_contribution_pinned(uuid, boolean)       to authenticated;
grant execute on function public.set_username(text)                           to authenticated;

-- Pre-login flows keep anon access deliberately:
--   get_invite         → invite-link preview page before sign-in
--   username_available → signup form check
revoke execute on function public.get_invite(text)         from public;
revoke execute on function public.username_available(text) from public;
grant  execute on function public.get_invite(text)         to anon, authenticated;
grant  execute on function public.username_available(text) to anon, authenticated;
