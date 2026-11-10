-- Tests for migrations/0001_saved_examples.sql, on a throwaway database that has
-- tests/supabase-stub.sql and the migration loaded (supabase/README.md, "Testing the
-- migration"). Every check raises an exception when it fails, and psql stops at the first one
-- (run with -v ON_ERROR_STOP=1). The last line printed is "all saved_examples tests passed".
--
-- Users: A = 0000000a-..., B = 0000000b-..., C = 0000000c-... (C fills an account to the cap).

\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('0000000a-0000-4000-8000-000000000000', 'a@example.com'),
  ('0000000b-0000-4000-8000-000000000000', 'b@example.com'),
  ('0000000c-0000-4000-8000-000000000000', 'c@example.com');

-- A saves two examples (one shared), B saves one.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.saved_examples (id, viz, title, example, shared) values
  ('a0000000-0000-4000-8000-000000000001', 'stack-array', 'A private', '{"format":1,"viz":"stack-array","ops":[]}', false),
  ('a0000000-0000-4000-8000-000000000002', 'stack-array', 'A shared', '{"format":1,"viz":"stack-array","ops":[["push",1]]}', true);
do $$ begin
  if (select count(*) from app_stepwise.saved_examples) <> 2 then
    raise exception 'A should see exactly her 2 rows';
  end if;
  if exists (select from app_stepwise.saved_examples
             where owner <> '0000000a-0000-4000-8000-000000000000') then
    raise exception 'the owner column should default to auth.uid()';
  end if;
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000b-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.saved_examples (id, viz, title, example) values
  ('b0000000-0000-4000-8000-000000000001', 'bst', 'B private', '{"format":1,"viz":"bst","ops":[]}');
do $$
declare n int;
begin
  -- B sees only his own row: no policy lets anyone read another account's rows, shared or not.
  if (select count(*) from app_stepwise.saved_examples) <> 1 then
    raise exception 'B should see only his own row';
  end if;
  if exists (select from app_stepwise.saved_examples where title like 'A %') then
    raise exception 'B can read A''s rows';
  end if;
  -- B cannot change or delete A's rows: they are invisible to him, so nothing matches.
  update app_stepwise.saved_examples set title = 'taken' where id = 'a0000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A''s row'; end if;
  delete from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A''s row'; end if;
  -- B cannot add a row in A's name.
  begin
    insert into app_stepwise.saved_examples (owner, viz, title, example)
      values ('0000000a-0000-4000-8000-000000000000', 'bst', 'planted', '{}');
    raise exception 'B inserted a row owned by A';
  exception when insufficient_privilege then null;
  end;
  -- B cannot give his row to A.
  begin
    update app_stepwise.saved_examples set owner = '0000000a-0000-4000-8000-000000000000'
      where id = 'b0000000-0000-4000-8000-000000000001';
    raise exception 'B moved his row to A';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- A's rows are untouched by B's attempts.
do $$ begin
  if (select title from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000002') <> 'A shared'
     or not exists (select from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000001') then
    raise exception 'B changed A''s rows';
  end if;
end $$;

do $$ begin perform pg_sleep(0.02); end $$;

-- A renames, unshares and deletes her own rows; updated_at moves, created_at stays.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
do $$
declare n int;
declare before_created timestamptz;
begin
  select created_at into before_created from app_stepwise.saved_examples
    where id = 'a0000000-0000-4000-8000-000000000001';
  update app_stepwise.saved_examples set title = 'A renamed', created_at = '2000-01-01'
    where id = 'a0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A could not rename her row'; end if;
  if (select updated_at <= created_at or created_at <> before_created
      from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000001') then
    raise exception 'updated_at should move on update and created_at should stay';
  end if;
  delete from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A could not delete her row'; end if;
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
      ('long title', 'stack-array', repeat('t', 201), '', '{}'::jsonb),
      ('long notes', 'stack-array', 'ok', repeat('n', 2001), '{}'::jsonb),
      ('large example', 'stack-array', 'ok', '', jsonb_build_object('pad', repeat('x', 262144))),
      ('array example', 'stack-array', 'ok', '', '[]'::jsonb),
      ('bad viz id', 'Stack Array', 'ok', '', '{}'::jsonb),
      ('empty viz id', '', 'ok', '', '{}'::jsonb)
    ) as t(what, viz, title, notes, example)
  loop
    begin
      insert into app_stepwise.saved_examples (viz, title, notes, example)
        values (bad.viz, bad.title, bad.notes, bad.example);
      raise exception 'accepted a row with a %', bad.what;
    exception when check_violation then null;
    end;
  end loop;
  -- At the limits is fine.
  insert into app_stepwise.saved_examples (viz, title, notes, example)
    values ('stack-array', repeat('t', 200), repeat('n', 2000), '{"format":1}');
end $$;
rollback;

-- Anonymous visitors: no grants on the table at all, only the shared_example function.
do $$ begin
  if has_table_privilege('anon', 'app_stepwise.saved_examples', 'select')
     or has_table_privilege('anon', 'app_stepwise.saved_examples', 'insert')
     or has_table_privilege('anon', 'app_stepwise.saved_examples', 'update')
     or has_table_privilege('anon', 'app_stepwise.saved_examples', 'delete') then
    raise exception 'anon has a grant on the table';
  end if;
  if not has_schema_privilege('anon', 'app_stepwise', 'usage')
     or not has_schema_privilege('authenticated', 'app_stepwise', 'usage') then
    raise exception 'anon and authenticated need usage on the schema';
  end if;
  if not has_function_privilege('anon', 'app_stepwise.shared_example(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'app_stepwise.shared_example(uuid)', 'execute') then
    raise exception 'anon and authenticated must be able to call shared_example';
  end if;
  if exists (select from information_schema.routine_privileges
             where routine_schema = 'app_stepwise' and routine_name = 'shared_example'
               and grantee = 'PUBLIC') then
    raise exception 'PUBLIC can still execute shared_example';
  end if;
end $$;

begin;
set local role anon;
do $$
declare got jsonb;
begin
  begin
    perform 1 from app_stepwise.saved_examples;
    raise exception 'anon read the table';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into app_stepwise.saved_examples (viz, title, example) values ('bst', 'anon', '{}');
    raise exception 'anon inserted a row';
  exception when insufficient_privilege then null;
  end;
  -- A shared row: exactly the four columns.
  select to_jsonb(s) into got from app_stepwise.shared_example('a0000000-0000-4000-8000-000000000002') as s;
  if got is null then raise exception 'anon could not read a shared example'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(got) as k) <> array['example', 'notes', 'title', 'viz'] then
    raise exception 'shared_example returned other columns: %', got;
  end if;
  if got ->> 'title' <> 'A shared' or got -> 'example' -> 'ops' <> '[["push", 1]]'::jsonb then
    raise exception 'shared_example returned the wrong row: %', got;
  end if;
  -- Private and missing rows: nothing.
  if exists (select from app_stepwise.shared_example('b0000000-0000-4000-8000-000000000001')) then
    raise exception 'anon read a private example';
  end if;
  if exists (select from app_stepwise.shared_example('ffffffff-0000-4000-8000-000000000000')) then
    raise exception 'shared_example returned a row for a missing id';
  end if;
end $$;
rollback;

-- Signed in as someone else: the same through the function, and still nothing directly.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000b-0000-4000-8000-000000000000","role":"authenticated"}';
do $$ begin
  if (select count(*) from app_stepwise.shared_example('a0000000-0000-4000-8000-000000000002')) <> 1 then
    raise exception 'B could not read A''s shared example through the function';
  end if;
  if exists (select from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000002') then
    raise exception 'B read A''s shared row from the table';
  end if;
end $$;
rollback;

-- Once unshared, the link stops working.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
update app_stepwise.saved_examples set shared = false where id = 'a0000000-0000-4000-8000-000000000002';
commit;
begin;
set local role anon;
do $$ begin
  if exists (select from app_stepwise.shared_example('a0000000-0000-4000-8000-000000000002')) then
    raise exception 'an unshared example is still readable';
  end if;
end $$;
rollback;

-- An account holds at most 1000 examples.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000c-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.saved_examples (viz, title, example)
  select 'bst', 'n' || i, '{}' from generate_series(1, 1000) as i;
do $$ begin
  begin
    insert into app_stepwise.saved_examples (viz, title, example) values ('bst', 'one too many', '{}');
    raise exception 'the 1001st example was accepted';
  exception when raise_exception then
    if sqlerrm not like 'saved_examples_limit%' then raise; end if;
  end;
end $$;
commit;

-- Deleting an auth user deletes their rows.
do $$ begin
  if not exists (select from app_stepwise.saved_examples where owner = '0000000a-0000-4000-8000-000000000000') then
    raise exception 'setup: A should still have a row';
  end if;
  delete from auth.users where id = '0000000a-0000-4000-8000-000000000000';
  if exists (select from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000002')
     or exists (select from app_stepwise.saved_examples where owner is null) then
    raise exception 'deleting the user left her rows behind';
  end if;
  if (select count(*) from app_stepwise.saved_examples where owner = '0000000b-0000-4000-8000-000000000000') <> 1 then
    raise exception 'deleting A touched B''s rows';
  end if;
end $$;

\echo all saved_examples tests passed
