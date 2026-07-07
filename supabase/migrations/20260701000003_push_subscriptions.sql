-- Web Push subscriptions. Each installed browser/PWA registers a PushSubscription
-- (endpoint + keys); the reminder worker sends encrypted pushes to them via VAPID.
-- The worker reads/prunes rows via the service role; users manage only their own.

create table if not exists public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "own push subs read"   on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own push subs insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own push subs update" on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push subs delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
