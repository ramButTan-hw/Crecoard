-- profiles table: extends auth.users with display data
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

create table if not exists public.profiles (
  id             uuid        primary key references auth.users(id) on delete cascade,
  display_name   text        not null default 'Anonymous',
  avatar_url     text,
  banner_url     text,
  color          text        not null default '#d59ee8',
  pronouns       text,
  status         text,
  status_emoji   text,
  favorite_board_id text,
  profile_board  jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row when a new user signs up (OAuth or email)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, color)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'Anonymous'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    '#d59ee8'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop and recreate so re-running this file is safe
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
