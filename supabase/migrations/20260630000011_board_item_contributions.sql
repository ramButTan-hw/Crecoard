-- Viewer-contributed entries for a board item (suggestion box, guestbook, poll, …).
-- Mirrors board_chat_messages: contributions live here, NOT in the board JSONB.
create table if not exists public.board_item_contributions (
  id          uuid        primary key default gen_random_uuid(),
  board_id    uuid        not null,
  item_id     text        not null,                 -- BlockItem id (nanoid)
  author_id   uuid        not null references auth.users(id) on delete cascade,
  author_name text        not null default '',
  kind        text        not null default 'entry',
  content     text        not null default '',
  approved    boolean     not null default true,    -- moderated boxes flip default to false
  pinned      boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists board_item_contributions_item_idx
  on public.board_item_contributions (item_id, created_at);

alter table public.board_item_contributions enable row level security;

-- Read: any authenticated user (tighten to board access later).
create policy "contrib_read"   on public.board_item_contributions
  for select to authenticated using (true);
-- Insert / edit / delete only your OWN contribution (tier gating is enforced in the UI;
-- owner-moderation comes via a security-definer RPC once the board-ownership schema is wired).
create policy "contrib_insert" on public.board_item_contributions
  for insert to authenticated with check (author_id = auth.uid());
create policy "contrib_update_own" on public.board_item_contributions
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "contrib_delete_own" on public.board_item_contributions
  for delete to authenticated using (author_id = auth.uid());

alter publication supabase_realtime add table public.board_item_contributions;
