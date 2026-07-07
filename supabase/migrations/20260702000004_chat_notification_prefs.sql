-- Per-user, per-channel notification preferences for board chat.
-- Levels: 'all' (default — no row), 'mentions' (only @mentions), 'mute' (nothing).
-- Read client-side for toasts/pings/unread and server-side by /api/push/chat.

create table if not exists public.chat_notification_prefs (
  user_id  uuid        not null references auth.users(id) on delete cascade,
  chat_key text        not null, -- `${boardId}::${channel}`
  level    text        not null check (level in ('all', 'mentions', 'mute')),
  updated_at timestamptz not null default now(),
  primary key (user_id, chat_key)
);

alter table public.chat_notification_prefs enable row level security;

create policy "own chat prefs read"   on public.chat_notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "own chat prefs insert" on public.chat_notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "own chat prefs update" on public.chat_notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own chat prefs delete" on public.chat_notification_prefs for delete to authenticated using (user_id = auth.uid());
