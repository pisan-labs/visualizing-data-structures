-- A stand-in for the parts of Supabase the StepWise migration relies on (local tests only).
-- Run once on a fresh database:  psql -h localhost -p 54329 -U postgres -d <db> -f supabase-stub.sql
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
-- Supabase's auth.uid(): the "sub" claim of the request's JWT, or null.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- To act as a user in a test:
--   begin; set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
--   ... ; rollback;
-- As an anonymous visitor: begin; set local role anon; ... ; rollback;
