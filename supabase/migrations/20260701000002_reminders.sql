-- Reminders: a user schedules a notification for a future time (e.g. "remind me
-- before this stream"). A scheduler polls due rows and delivers them; email is the
-- universal channel (no install). The delivery worker is /api/cron/reminders, run
-- via pg_cron (below) or any external cron.

create table if not exists public.reminders (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title      text        not null default '',
  body       text        not null default '',
  remind_at  timestamptz not null,
  channel    text        not null default 'email',   -- 'email' (push/native later)
  board_id   uuid,                                    -- optional context / deep link
  item_id    text,
  url        text,                                    -- optional link back to the board
  status     text        not null default 'pending', -- pending | sent | failed | canceled
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null default now()
);

-- The worker scans for due, still-pending rows.
create index if not exists reminders_due_idx
  on public.reminders (remind_at)
  where status = 'pending';

alter table public.reminders enable row level security;

-- Users manage only their own reminders. The worker reads/writes via the service
-- role (bypasses RLS), so no broad policy is needed for delivery.
create policy "own reminders read"   on public.reminders for select to authenticated using (user_id = auth.uid());
create policy "own reminders insert" on public.reminders for insert to authenticated with check (user_id = auth.uid());
create policy "own reminders update" on public.reminders for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own reminders delete" on public.reminders for delete to authenticated using (user_id = auth.uid());

-- ── Scheduling (pg_cron) ──────────────────────────────────────────────────────
-- Enable the delivery worker to run every minute. Requires the pg_cron and pg_net
-- extensions (Database → Extensions in Supabase) and a CRON_SECRET set both here
-- and in the app's environment. Fill in your deployed URL + secret, then run:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule(
--     'deliver-reminders',
--     '* * * * *',
--     $$
--       select net.http_post(
--         url     := 'https://YOUR_APP_URL/api/cron/reminders',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer YOUR_CRON_SECRET'
--         )
--       );
--     $$
--   );
--
-- (On Vercel you can instead add a cron in vercel.json hitting the same route.)
