-- Lock down the webhook tables.
--
-- 20260629000005 created webhook_tokens and webhook_items with
-- `using (true)` / `with check (true)` policies and NO `TO` clause, so the
-- policies applied to anon as well as authenticated: anyone holding the public
-- anon key could SELECT every board's webhook secret (the token is the sole
-- authenticator for POST /api/webhooks/[token]), mint tokens pointing at any
-- board, delete integrations, and read or tamper with every inbound item.
--
-- The only server-side access is the service role in
-- apps/web/src/app/api/webhooks/[token]/route.ts, which bypasses RLS — so
-- tightening these policies does not affect the webhook endpoint itself.
-- Client access is now scoped with the existing board-access helpers
-- (same pattern as the file_bank_files hardening in 20260702000000).

-- ── webhook_items ─────────────────────────────────────────────────────────────
-- Polled by board viewers (useWebhookItems reads + marks consumed); new rows
-- arrive only via the service-role API route, so no INSERT policy is created.

drop policy if exists "webhook_items_insert" on public.webhook_items;
drop policy if exists "webhook_items_select" on public.webhook_items;
drop policy if exists "webhook_items_update" on public.webhook_items;

create policy "webhook_items_read" on public.webhook_items
  for select to authenticated
  using (public.can_access_board(board_id));

create policy "webhook_items_consume" on public.webhook_items
  for update to authenticated
  using (public.can_access_board(board_id))
  with check (public.can_access_board(board_id));

-- ── webhook_tokens ────────────────────────────────────────────────────────────
-- Reading a token grants write access to the board, so token management is a
-- moderator action (board owner / server owner+admin) — matching the UI
-- surface in ServerSettings → Webhooks. board_uuid_of() tolerates the ":live"
-- suffix and returns NULL for non-uuid values, so legacy/malformed rows match
-- no policy instead of erroring.

drop policy if exists "webhook_tokens_insert" on public.webhook_tokens;
drop policy if exists "webhook_tokens_select" on public.webhook_tokens;
drop policy if exists "webhook_tokens_delete" on public.webhook_tokens;

create policy "webhook_tokens_read" on public.webhook_tokens
  for select to authenticated
  using (public.can_moderate_board(public.board_uuid_of(board_id)));

create policy "webhook_tokens_manage" on public.webhook_tokens
  for insert to authenticated
  with check (public.can_moderate_board(public.board_uuid_of(board_id)));

create policy "webhook_tokens_revoke" on public.webhook_tokens
  for delete to authenticated
  using (public.can_moderate_board(public.board_uuid_of(board_id)));
