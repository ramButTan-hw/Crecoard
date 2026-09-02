-- One-off rotation of ALL webhook tokens.
--
-- Run this AFTER applying 20260901000000_lock_down_webhook_tables.sql if you
-- believe tokens may already have been stolen (the old open policies let any
-- anon client read every token; assume compromised if your anon key was ever
-- in untrusted hands — it is public by design).
--
-- What it does:
--   1. Replaces every webhook_tokens.token with a fresh 32-hex token
--      (same shape the UI generates: crypto.randomUUID() minus dashes).
--   2. Mirrors each new token into boards.data->'webhookToken' so the
--      ServerSettings → Webhooks UI shows the correct URL again.
--
-- Caveats:
--   • Every live bot/integration stops working until its owner opens
--     ServerSettings → Webhooks and copies the new URL (or regenerates).
--   • A client that has the board open while you run this can clobber the
--     boards.data copy with the stale token on its next autosave (the table
--     copy — the one the API authenticates against — is unaffected). Run
--     during a quiet window, or ask users to refresh afterwards.
--
-- Run via the Supabase SQL editor or:
--   psql "$DATABASE_URL" -f scripts/rotate-webhook-tokens.sql

begin;

with rotated as (
  update webhook_tokens
  set token = replace(gen_random_uuid()::text, '-', '')
  returning board_id, token
)
update boards b
set data = jsonb_set(b.data, '{webhookToken}', to_jsonb(r.token))
from rotated r
where b.id = r.board_id::uuid;

commit;

-- Verify:
--   select board_id, left(token, 6) || '…' as token_preview from webhook_tokens;
--   select id, data->>'webhookToken' from boards where data ? 'webhookToken';
