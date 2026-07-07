-- Web Push for board chat: a trigger POSTs each new message's id to the app,
-- which re-reads everything with the service role and pushes to subscribers
-- (see apps/web/src/app/api/push/chat/route.ts). The payload carries only the
-- row id, so the endpoint never trusts webhook content.

-- Throttle ledger: at most one non-mention push per user per channel per window.
create table if not exists public.push_chat_log (
  user_id  uuid        not null,
  chat_key text        not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, chat_key)
);

alter table public.push_chat_log enable row level security;
-- Service role only — no client policies on purpose.

-- Webhook trigger via pg_net (present on hosted Supabase). Wrapped so local
-- setups without supabase_functions don't fail the migration.
do $$
begin
  execute $trg$
    create or replace trigger board_chat_push_webhook
      after insert on public.board_chat_messages
      for each row
      execute function supabase_functions.http_request(
        'https://crecoard.com/api/push/chat',
        'POST',
        '{"Content-Type":"application/json"}',
        '{}',
        '5000'
      );
  $trg$;
exception
  when undefined_function or invalid_schema_name then
    raise notice 'supabase_functions.http_request unavailable — skipping chat push webhook trigger (hosted Supabase has it).';
end $$;
