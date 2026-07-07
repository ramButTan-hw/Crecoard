-- Let server admins choose which chat channel receives member join/leave/kick
-- activity messages (defaults to #general). Posted to the server's primary board.
alter table public.servers
  add column if not exists activity_channel text not null default 'general';
