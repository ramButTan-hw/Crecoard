-- Webhook tokens: maps a secret token to a board (and optionally a server)
create table if not exists webhook_tokens (
  token        text        primary key,
  board_id     text        not null,
  server_id    text,
  label        text,
  created_at   timestamptz default now()
);

-- Anyone can insert a token for their own board (no auth enforced server-side
-- for tokens — the token itself is the secret)
alter table webhook_tokens enable row level security;
create policy "webhook_tokens_insert" on webhook_tokens for insert with check (true);
create policy "webhook_tokens_select" on webhook_tokens for select using (true);
create policy "webhook_tokens_delete" on webhook_tokens for delete using (true);

-- Incoming webhook items: embed-card payloads pushed by external bots
create table if not exists webhook_items (
  id           uuid        primary key default gen_random_uuid(),
  board_id     text        not null,
  item_data    jsonb       not null,
  consumed_at  timestamptz,
  created_at   timestamptz default now()
);

create index webhook_items_board_id_idx on webhook_items (board_id, consumed_at);

-- Public insert (token is validated in the API route, not at DB level)
alter table webhook_items enable row level security;
create policy "webhook_items_insert" on webhook_items for insert with check (true);
create policy "webhook_items_select" on webhook_items for select using (true);
create policy "webhook_items_update" on webhook_items for update using (true);
