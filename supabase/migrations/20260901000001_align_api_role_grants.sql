-- Align API-role table grants with hosted Supabase behavior.
--
-- Hosted Supabase grants DML on public-schema tables to anon, authenticated
-- and service_role by default (RLS remains the enforcement layer). The local
-- CLI stack ships with no such default ACLs, so every table created by these
-- migrations ends up accessible only to postgres — all client queries and the
-- service-role API routes fail with "permission denied" when developing
-- against `supabase start`.
--
-- This migration is a no-op on hosted projects (the grants already exist
-- there) and makes local stacks behave identically. Functions are
-- intentionally NOT touched: their EXECUTE grants are managed explicitly by
-- earlier migrations (see 20260702000000_security_hardening.sql).

alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
