-- Local-development seed (runs automatically after `supabase db reset`).
-- Creates two confirmed test accounts so multi-user flows (chat, members,
-- permissions) can be tested locally:
--
--   test@crecoard.local  / password123   (user 1)
--   test2@crecoard.local / password123   (user 2 — no shared memberships)
--
-- The on_auth_user_created trigger creates the matching profiles rows.
-- Boards/servers are intentionally NOT seeded — create them through the UI.

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-4111-8111-111111111111', 'test@crecoard.local',  'Test User'),
      ('22222222-2222-4222-8222-222222222222', 'test2@crecoard.local', 'Test User Two')
    ) as t(id, email, full_name)
  loop
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
      u.id::uuid,
      'authenticated',
      'authenticated',
      u.email,
      crypt('password123', gen_salt('bf')),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', u.full_name),
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
      u.id::uuid,
      u.id,
      u.id::uuid,
      'email',
      jsonb_build_object(
        'sub', u.id,
        'email', u.email,
        'email_verified', true
      ),
      now(),
      now(),
      now()
    )
    on conflict (id) do nothing;
  end loop;
end $$;
