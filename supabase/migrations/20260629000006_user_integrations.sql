-- Per-user third-party API keys, encrypted at rest via pgcrypto
create table if not exists user_integrations (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  provider    text        not null,  -- "tracker-gg", "github", "steam", etc.
  api_key     text        not null,  -- encrypted with pgcrypto if available
  meta        jsonb,                 -- provider-specific extra data
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, provider)
);

alter table user_integrations enable row level security;
create policy "owner_only" on user_integrations
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index user_integrations_user_provider on user_integrations (user_id, provider);
