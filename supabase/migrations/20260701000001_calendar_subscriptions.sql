-- Public ICS subscription feeds for a calendar item ("board → .ics"). A random,
-- unguessable token maps to a (board, item); the /api/calendar/[token] route reads
-- the board via the service role and returns text/calendar, so external calendar
-- apps (Google/Apple/Outlook) can subscribe without authenticating — the standard
-- "secret URL" model. Only board moderators can create/revoke tokens.

create table if not exists public.calendar_subscriptions (
  token      text        primary key
               default substring(replace(gen_random_uuid()::text, '-', ''), 1, 32),
  board_id   uuid        not null references public.boards(id) on delete cascade,
  item_id    text        not null,               -- BlockItem id of the calendar
  created_by uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One live feed per calendar item (regenerating replaces the old token).
create unique index if not exists calendar_subscriptions_board_item_idx
  on public.calendar_subscriptions (board_id, item_id);

alter table public.calendar_subscriptions enable row level security;

-- Only board moderators (personal owner, or server owner/admin) manage feeds.
-- Reuses can_moderate_board() from 20260630000012_contribution_moderation.sql.
-- The public feed route reads via the service role, so no anon SELECT policy exists.
create policy "moderator manages calendar subs" on public.calendar_subscriptions
  for all to authenticated
  using       (public.can_moderate_board(board_id))
  with check  (public.can_moderate_board(board_id) and created_by = auth.uid());
