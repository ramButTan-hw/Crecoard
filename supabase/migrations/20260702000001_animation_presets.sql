-- Animation preset library. Presets are authoring artifacts only: applying
-- one copies its spec JSON onto the item, so boards never read this table at
-- render time and deleting a preset can never break a board.

create table if not exists public.animation_presets (
  id          uuid         primary key default gen_random_uuid(),
  owner_id    uuid         not null references auth.users(id) on delete cascade,
  -- null = personal library entry; set = shared to that server's library
  server_id   uuid         references public.servers(id) on delete cascade,
  name        text         not null default 'Animation',
  spec        jsonb        not null,
  created_at  timestamptz  not null default now()
);

create index if not exists animation_presets_owner on public.animation_presets (owner_id, created_at desc);
create index if not exists animation_presets_server on public.animation_presets (server_id, created_at desc);

alter table public.animation_presets enable row level security;

-- Read: your own presets + any preset shared to a server you belong to.
create policy "anim_presets_read" on public.animation_presets
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (server_id is not null and public.is_member_of_server(server_id))
  );

-- Insert: only as yourself; sharing to a server requires membership.
create policy "anim_presets_insert" on public.animation_presets
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (server_id is null or public.is_member_of_server(server_id))
  );

-- Update: author only.
create policy "anim_presets_update" on public.animation_presets
  for update to authenticated
  using (owner_id = auth.uid());

-- Delete: author, or owner/admin of the server a preset is shared to.
create policy "anim_presets_delete" on public.animation_presets
  for delete to authenticated
  using (
    owner_id = auth.uid()
    or (
      server_id is not null and exists (
        select 1 from public.server_members m
        where m.server_id = animation_presets.server_id
          and m.user_id = auth.uid()
          and m.role in ('owner', 'admin')
      )
    )
  );
