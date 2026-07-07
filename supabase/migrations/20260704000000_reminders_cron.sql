-- Activate the reminder delivery worker.
--
-- Reminder rows are created by the app, but nothing delivers them until a
-- scheduler polls the worker at /api/cron/reminders. This schedules that poll
-- every 30s via pg_cron + pg_net (available on hosted Supabase). Without it,
-- reminders sit at status='pending' forever. (30s halves the worst-case delay
-- vs a 1-minute cron; the worker's atomic pending→sending claim makes any
-- overlap between runs safe.)
--
-- Wrapped defensively: local / self-hosted DBs without pg_cron, pg_net, or Vault
-- won't fail the migration — it just prints a notice and skips.
--
-- ── ONE-TIME SETUP (do this once, then this schedule works) ───────────────────
--   1. Enable the extensions in the Supabase dashboard (Database → Extensions):
--        pg_cron, pg_net   (or the CREATE EXTENSION calls below will do it if
--                            your role has permission)
--   2. Store the shared secret in Vault — it must equal CRON_SECRET in the app's
--      environment:
--        select vault.create_secret('YOUR_CRON_SECRET', 'cron_secret');
--   3. Set the same CRON_SECRET in the web app's env (Vercel / .env).
--   4. If your deployed URL is not https://crecoard.com, edit the url below.
-- ───────────────────────────────────────────────────────────────────────────────

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- Idempotent: drop any prior schedule so re-running this migration is safe.
  begin
    perform cron.unschedule('deliver-reminders');
  exception when others then
    null; -- wasn't scheduled yet
  end;

  perform cron.schedule(
    'deliver-reminders',
    '30 seconds', -- pg_cron sub-minute interval (1–59s allowed); halves worst-case latency
    $cron$
      select net.http_post(
        url     := 'https://crecoard.com/api/cron/reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization',
            'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        )
      );
    $cron$
  );

  raise notice 'Scheduled deliver-reminders (runs every minute). Ensure vault secret cron_secret and app CRON_SECRET match.';
exception
  when others then
    raise notice 'Reminder schedule skipped (pg_cron/pg_net/vault unavailable or insufficient privilege): %', sqlerrm;
end $$;
