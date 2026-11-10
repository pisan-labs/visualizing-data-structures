-- Tests for migrations/0002_preferences.sql, on a throwaway database that has
-- tests/supabase-stub.sql, 0001 and 0002 loaded (supabase/README.md, "Testing the migrations").
-- Every check raises an exception when it fails, and psql stops at the first one (run with
-- -v ON_ERROR_STOP=1). The last line printed is "all preferences tests passed".
--
-- Users: A = 0000000a-..., B = 0000000b-...

\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('0000000a-0000-4000-8000-000000000000', 'a@example.com'),
  ('0000000b-0000-4000-8000-000000000000', 'b@example.com');

-- A makes her row; owner defaults to her, updated_at is set by the database.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.preferences (prefs, progress, last_release, updated_at) values (
  '{"theme":{"value":"dark","at":"2026-11-10T09:00:00.000Z"}}',
  '{"version":1,"pages":{}}',
  '2026-11-09-wave-8',
  '2000-01-01'
);
do $$ begin
  if (select count(*) from app_stepwise.preferences) <> 1 then
    raise exception 'A should see exactly her row';
  end if;
  if (select owner from app_stepwise.preferences) <> '0000000a-0000-4000-8000-000000000000' then
    raise exception 'owner should default to auth.uid()';
  end if;
  if (select updated_at < now() - interval '1 minute' from app_stepwise.preferences) then
    raise exception 'updated_at should be set by the database, not the caller';
  end if;
  if (select notify_new_pages from app_stepwise.preferences) then
    raise exception 'notify_new_pages should default to false';
  end if;
  -- One row per account.
  begin
    insert into app_stepwise.preferences (prefs) values ('{}');
    raise exception 'A made a second row';
  exception when unique_violation then null;
  end;
end $$;
commit;

-- B makes his; he sees, changes and deletes only his own.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000b-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.preferences (notify_new_pages) values (true);
do $$
declare n int;
begin
  if (select count(*) from app_stepwise.preferences) <> 1
     or exists (select from app_stepwise.preferences
                where owner = '0000000a-0000-4000-8000-000000000000') then
    raise exception 'B can see A''s row';
  end if;
  update app_stepwise.preferences set last_release = 'taken'
    where owner = '0000000a-0000-4000-8000-000000000000';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A''s row'; end if;
  delete from app_stepwise.preferences where owner = '0000000a-0000-4000-8000-000000000000';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A''s row'; end if;
  -- Not even an upsert reaches A's row: B cannot write a row in her name.
  begin
    insert into app_stepwise.preferences (owner, prefs)
      values ('0000000a-0000-4000-8000-000000000000', '{}')
      on conflict (owner) do update set prefs = excluded.prefs;
    raise exception 'B wrote a row in A''s name';
  exception when insufficient_privilege then null;
  end;
  begin
    update app_stepwise.preferences set owner = '0000000a-0000-4000-8000-000000000000';
    raise exception 'B moved his row to A';
  exception when insufficient_privilege or unique_violation then null;
  end;
end $$;
commit;

do $$ begin
  if (select last_release from app_stepwise.preferences
      where owner = '0000000a-0000-4000-8000-000000000000') <> '2026-11-09-wave-8'
     or (select count(*) from app_stepwise.preferences) <> 2 then
    raise exception 'B changed A''s row';
  end if;
end $$;

-- A writes back as the site does: only if updated_at is still what she read. updated_at moves
-- forward on every write, even two in one transaction, so a stale copy never wins.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
do $$
declare
  seen timestamptz;
  second timestamptz;
  n int;
begin
  select updated_at into seen from app_stepwise.preferences;
  update app_stepwise.preferences set last_release = '2026-11-10-features', updated_at = '2000-01-01'
    where updated_at = seen;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A could not write back her row'; end if;
  select updated_at into second from app_stepwise.preferences;
  if second <= seen then raise exception 'updated_at did not move forward: % then %', seen, second; end if;
  -- Another write in the same transaction (same now()) still moves it.
  update app_stepwise.preferences set notify_new_pages = true;
  if (select updated_at from app_stepwise.preferences) <= second then
    raise exception 'updated_at did not move on a second write in one transaction';
  end if;
  -- A copy read before those writes is refused.
  update app_stepwise.preferences set last_release = 'stale' where updated_at = seen;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a write from a stale copy went through'; end if;
end $$;
commit;

-- The check constraints refuse oversize and malformed rows.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
do $$
declare
  bad record;
begin
  for bad in
    select * from (values
      ('large prefs', jsonb_build_object('pad', repeat('x', 4096)), '{}'::jsonb, null::text),
      ('array prefs', '[]'::jsonb, '{}'::jsonb, null),
      ('large progress', '{}'::jsonb, jsonb_build_object('pad', repeat('x', 524288)), null),
      ('string progress', '{}'::jsonb, '"none"'::jsonb, null),
      ('bad release id', '{}'::jsonb, '{}'::jsonb, 'Wave 7'),
      ('empty release id', '{}'::jsonb, '{}'::jsonb, ''),
      ('long release id', '{}'::jsonb, '{}'::jsonb, repeat('a', 65))
    ) as t(what, prefs, progress, last_release)
  loop
    begin
      update app_stepwise.preferences
        set prefs = bad.prefs, progress = bad.progress, last_release = bad.last_release;
      raise exception 'accepted a row with %', bad.what;
    exception when check_violation then null;
    end;
  end loop;
  -- At the limits is fine.
  update app_stepwise.preferences set
    prefs = jsonb_build_object('p', repeat('x', 4096 - 9)),
    progress = jsonb_build_object('p', repeat('x', 524288 - 9)),
    last_release = repeat('a', 64);
  if (select octet_length(prefs::text) from app_stepwise.preferences) <> 4096
     or (select octet_length(progress::text) from app_stepwise.preferences) <> 524288 then
    raise exception 'setup: the at-the-limit rows are not exactly at the limit';
  end if;
  update app_stepwise.preferences set last_release = null;
end $$;
rollback;

-- Anonymous visitors: no grants on the table, and no way to delete anything.
do $$ begin
  if has_table_privilege('anon', 'app_stepwise.preferences', 'select')
     or has_table_privilege('anon', 'app_stepwise.preferences', 'insert')
     or has_table_privilege('anon', 'app_stepwise.preferences', 'update')
     or has_table_privilege('anon', 'app_stepwise.preferences', 'delete') then
    raise exception 'anon has a grant on the table';
  end if;
  if has_function_privilege('anon', 'app_stepwise.delete_my_data()', 'execute')
     or has_function_privilege('service_role', 'app_stepwise.delete_my_data()', 'execute') then
    raise exception 'anon or service_role may call delete_my_data';
  end if;
  if not has_function_privilege('authenticated', 'app_stepwise.delete_my_data()', 'execute') then
    raise exception 'authenticated must be able to call delete_my_data';
  end if;
  if exists (select from information_schema.routine_privileges
             where routine_schema = 'app_stepwise'
               and routine_name in ('delete_my_data', 'preferences_touch')
               and grantee = 'PUBLIC') then
    raise exception 'PUBLIC can still execute a function of this file';
  end if;
  if has_function_privilege('authenticated', 'app_stepwise.preferences_touch()', 'execute') then
    raise exception 'the trigger function should not be callable';
  end if;
end $$;

begin;
set local role anon;
do $$ begin
  begin
    perform 1 from app_stepwise.preferences;
    raise exception 'anon read the table';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into app_stepwise.preferences (prefs) values ('{}');
    raise exception 'anon inserted a row';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app_stepwise.delete_my_data();
    raise exception 'anon called delete_my_data';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- The platform's email job (service_role): reads every row, may turn notify_new_pages off, and
-- nothing else.
do $$ begin
  if not has_table_privilege('service_role', 'app_stepwise.preferences', 'select') then
    raise exception 'service_role should read the table';
  end if;
  if has_table_privilege('service_role', 'app_stepwise.preferences', 'insert')
     or has_table_privilege('service_role', 'app_stepwise.preferences', 'update')
     or has_table_privilege('service_role', 'app_stepwise.preferences', 'delete') then
    raise exception 'service_role has more than select on the table';
  end if;
  if not has_column_privilege('service_role', 'app_stepwise.preferences', 'notify_new_pages', 'update') then
    raise exception 'service_role should update notify_new_pages';
  end if;
  if has_column_privilege('service_role', 'app_stepwise.preferences', 'prefs', 'update')
     or has_column_privilege('service_role', 'app_stepwise.preferences', 'progress', 'update')
     or has_column_privilege('service_role', 'app_stepwise.preferences', 'last_release', 'update')
     or has_column_privilege('service_role', 'app_stepwise.preferences', 'owner', 'update') then
    raise exception 'service_role may update another column';
  end if;
  if has_table_privilege('service_role', 'app_stepwise.saved_examples', 'select') then
    raise exception 'service_role was given saved_examples';
  end if;
end $$;

begin;
set local role service_role;
do $$
declare
  before timestamptz;
  n int;
begin
  if (select count(*) from app_stepwise.preferences where notify_new_pages) <> 2 then
    raise exception 'service_role should see every row that asked for email';
  end if;
  select updated_at into before from app_stepwise.preferences
    where owner = '0000000b-0000-4000-8000-000000000000';
  update app_stepwise.preferences set notify_new_pages = false
    where owner = '0000000b-0000-4000-8000-000000000000';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'service_role could not unsubscribe B'; end if;
  -- The change moves updated_at, so the reader's next write back reads it first.
  if (select updated_at from app_stepwise.preferences
      where owner = '0000000b-0000-4000-8000-000000000000') <= before then
    raise exception 'unsubscribing did not move updated_at';
  end if;
  begin
    update app_stepwise.preferences set prefs = '{}';
    raise exception 'service_role changed prefs';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from app_stepwise.preferences;
    raise exception 'service_role deleted a row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into app_stepwise.preferences (owner) values ('0000000b-0000-4000-8000-000000000000');
    raise exception 'service_role inserted a row';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- delete_my_data: every app_stepwise table with an owner column, including ones added later.
-- Two stand-in lesson-list tables (made here, dropped below) check that, and that a table other
-- rows still refer to (saved_examples, referred to by list items) is deleted after them.
create table app_stepwise.test_lists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null
);
create table app_stepwise.test_list_items (
  list_id uuid not null references app_stepwise.test_lists (id),
  example_id uuid not null references app_stepwise.saved_examples (id),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (list_id, example_id)
);
alter table app_stepwise.test_lists enable row level security;
alter table app_stepwise.test_list_items enable row level security;
create policy "owners" on app_stepwise.test_lists for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "owners" on app_stepwise.test_list_items for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
grant select, insert, update, delete on app_stepwise.test_lists, app_stepwise.test_list_items
  to authenticated;

-- A and B each have examples, a list holding them, and preferences.
do $$
declare
  u uuid;
  l uuid;
begin
  foreach u in array array['0000000a-0000-4000-8000-000000000000',
                           '0000000b-0000-4000-8000-000000000000']::uuid[] loop
    insert into app_stepwise.saved_examples (owner, viz, title, example)
      select u, 'bst', 'n' || i, '{}' from generate_series(1, 2) as i;
    insert into app_stepwise.test_lists (owner, title) values (u, 'class') returning id into l;
    insert into app_stepwise.test_list_items (list_id, example_id, owner)
      select l, e.id, u from app_stepwise.saved_examples as e where e.owner = u;
  end loop;
end $$;

-- Not signed in (no sub claim): refused, nothing deleted.
begin;
set local role authenticated;
do $$ begin
  begin
    perform app_stepwise.delete_my_data();
    raise exception 'delete_my_data ran without a user';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
do $$
declare got jsonb;
begin
  got := app_stepwise.delete_my_data();
  if got <> '{"preferences": 1, "saved_examples": 2, "test_lists": 1, "test_list_items": 2}'::jsonb then
    raise exception 'delete_my_data deleted %', got;
  end if;
  if exists (select from app_stepwise.preferences)
     or exists (select from app_stepwise.saved_examples)
     or exists (select from app_stepwise.test_lists)
     or exists (select from app_stepwise.test_list_items) then
    raise exception 'A still has rows after delete_my_data';
  end if;
  -- Again: nothing left, nothing fails.
  got := app_stepwise.delete_my_data();
  if got <> '{"preferences": 0, "saved_examples": 0, "test_lists": 0, "test_list_items": 0}'::jsonb then
    raise exception 'a second delete_my_data deleted %', got;
  end if;
end $$;
commit;

do $$ begin
  if exists (select from app_stepwise.preferences where owner = '0000000a-0000-4000-8000-000000000000')
     or exists (select from app_stepwise.saved_examples where owner = '0000000a-0000-4000-8000-000000000000')
     or exists (select from app_stepwise.test_lists where owner = '0000000a-0000-4000-8000-000000000000') then
    raise exception 'A''s rows are back';
  end if;
  if (select count(*) from app_stepwise.preferences where owner = '0000000b-0000-4000-8000-000000000000') <> 1
     or (select count(*) from app_stepwise.saved_examples where owner = '0000000b-0000-4000-8000-000000000000') <> 2
     or (select count(*) from app_stepwise.test_lists where owner = '0000000b-0000-4000-8000-000000000000') <> 1
     or (select count(*) from app_stepwise.test_list_items where owner = '0000000b-0000-4000-8000-000000000000') <> 2 then
    raise exception 'delete_my_data touched B''s rows';
  end if;
end $$;

drop table app_stepwise.test_list_items;
drop table app_stepwise.test_lists;

-- Deleting an auth user deletes their preferences.
do $$ begin
  delete from auth.users where id = '0000000b-0000-4000-8000-000000000000';
  if exists (select from app_stepwise.preferences) then
    raise exception 'deleting the user left the preferences behind';
  end if;
end $$;

\echo all preferences tests passed
