-- Local-development seed (runs automatically after `supabase db reset`).
-- Creates a confirmed test account so you can log straight in:
--
--   email:    test@crecoard.local
--   password: password123
--
-- The on_auth_user_created trigger creates the matching profiles row.
-- Boards/servers are intentionally NOT seeded — create them through the UI.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'test@crecoard.local',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Test User"}',
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- GoTrue requires a matching identity row for email+password sign-in.
-- (identities.email is a generated column — derived from identity_data.)
insert into auth.identities (
  id,
  provider_id,
  user_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'email',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'test@crecoard.local',
    'email_verified', true
  ),
  now(),
  now(),
  now()
)
on conflict (id) do nothing;
