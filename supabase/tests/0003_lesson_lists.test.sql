-- Tests for migrations/0003_lesson_lists.sql, on a throwaway database that has
-- tests/supabase-stub.sql, 0001 and 0003 loaded (supabase/README.md, "Testing the migrations").
-- Every check raises an exception when it fails, and psql stops at the first one (run with
-- -v ON_ERROR_STOP=1). The last line printed is "all lesson_lists tests passed".
--
-- Users: A = 0000000a-..., B = 0000000b-..., C = 0000000c-... (C fills an account to the caps).
-- A's examples: a...01 (private), a...02 (shared), a...03 (private). B's: b...01.
-- A's lists: 1a...01 (private), 1a...02 (shared). B's: 1b...01.

\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('0000000a-0000-4000-8000-000000000000', 'a@example.com'),
  ('0000000b-0000-4000-8000-000000000000', 'b@example.com'),
  ('0000000c-0000-4000-8000-000000000000', 'c@example.com');

-- Examples to put in lists.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.saved_examples (id, viz, title, notes, example, shared) values
  ('a0000000-0000-4000-8000-000000000001', 'stack-array', 'A one', 'first notes', '{"format":1,"viz":"stack-array","ops":[["push",1]]}', false),
  ('a0000000-0000-4000-8000-000000000002', 'bst', 'A two', '', '{"format":1,"viz":"bst","ops":[["insert",2]]}', true),
  ('a0000000-0000-4000-8000-000000000003', 'queue-array', 'A three', '', '{"format":1,"viz":"queue-array","ops":[]}', false);
commit;
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000b-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.saved_examples (id, viz, title, example) values
  ('b0000000-0000-4000-8000-000000000001', 'bst', 'B one', '{"format":1,"viz":"bst","ops":[]}');
commit;

-- A makes two lists and fills them; new items go at the end, whatever place is asked for.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.lesson_lists (id, title, notes, shared) values
  ('1a000000-0000-4000-8000-000000000001', 'Week 1', 'Stacks first', false),
  ('1a000000-0000-4000-8000-000000000002', 'Week 2', 'Shared with the class', true);
insert into app_stepwise.lesson_list_items (id, list_id, example_id, note) values
  ('1a100000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'start here');
insert into app_stepwise.lesson_list_items (id, list_id, example_id, note, position) values
  ('1a100000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '', 0);
insert into app_stepwise.lesson_list_items (id, list_id, example_id, position) values
  ('1a100000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 77);
-- The shared list: the shared example, then a private one, then the shared one again.
insert into app_stepwise.lesson_list_items (id, list_id, example_id, note) values
  ('1a200000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'tree first'),
  ('1a200000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'then the stack'),
  ('1a200000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'and the tree again');
do $$ begin
  if (select count(*) from app_stepwise.lesson_lists) <> 2 then
    raise exception 'A should see exactly her 2 lists';
  end if;
  if exists (select from app_stepwise.lesson_lists
             where owner <> '0000000a-0000-4000-8000-000000000000') then
    raise exception 'the owner column should default to auth.uid()';
  end if;
  if (select array_agg(position order by id) from app_stepwise.lesson_list_items
      where list_id = '1a000000-0000-4000-8000-000000000001') <> array[0, 1, 2] then
    raise exception 'new items should go at the end, in the order they were added: %',
      (select array_agg(position order by id) from app_stepwise.lesson_list_items
       where list_id = '1a000000-0000-4000-8000-000000000001');
  end if;
  if (select count(*) from app_stepwise.lesson_list_items) <> 6 then
    raise exception 'A should see her 6 items';
  end if;
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000b-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.lesson_lists (id, title) values ('1b000000-0000-4000-8000-000000000001', 'B list');
insert into app_stepwise.lesson_list_items (id, list_id, example_id) values
  ('1b100000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');
do $$
declare n int;
begin
  -- B sees only his own list and item, shared or not.
  if (select count(*) from app_stepwise.lesson_lists) <> 1
     or (select count(*) from app_stepwise.lesson_list_items) <> 1 then
    raise exception 'B should see only his own list and item';
  end if;
  if exists (select from app_stepwise.lesson_lists where title like 'Week%') then
    raise exception 'B can read A''s lists';
  end if;
  -- B cannot change or delete A's lists or items: they are invisible to him.
  update app_stepwise.lesson_lists set title = 'taken' where id = '1a000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B renamed A''s list'; end if;
  delete from app_stepwise.lesson_lists where id = '1a000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A''s list'; end if;
  update app_stepwise.lesson_list_items set note = 'taken' where id = '1a200000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B changed A''s item'; end if;
  delete from app_stepwise.lesson_list_items where id = '1a200000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A''s item'; end if;
  -- B cannot make a list in A's name, or give his list to A.
  begin
    insert into app_stepwise.lesson_lists (owner, title) values ('0000000a-0000-4000-8000-000000000000', 'planted');
    raise exception 'B made a list owned by A';
  exception when insufficient_privilege then null;
  end;
  begin
    update app_stepwise.lesson_lists set owner = '0000000a-0000-4000-8000-000000000000'
      where id = '1b000000-0000-4000-8000-000000000001';
    raise exception 'B moved his list to A';
  exception when insufficient_privilege then null;
  end;
  -- B cannot add to A's list, even his own example.
  begin
    insert into app_stepwise.lesson_list_items (list_id, example_id) values
      ('1a000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001');
    raise exception 'B added an item to A''s list';
  exception when insufficient_privilege then null;
  end;
  -- B cannot put A's examples in his own list, not even her shared one (its id is in its link).
  begin
    insert into app_stepwise.lesson_list_items (list_id, example_id) values
      ('1b000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
    raise exception 'B put A''s shared example in his list';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into app_stepwise.lesson_list_items (list_id, example_id) values
      ('1b000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'B put A''s private example in his list';
  exception when insufficient_privilege then null;
  end;
  -- An item never moves to another list or holds another example (no column privilege).
  begin
    update app_stepwise.lesson_list_items set list_id = '1a000000-0000-4000-8000-000000000002'
      where id = '1b100000-0000-4000-8000-000000000001';
    raise exception 'B moved his item into A''s list';
  exception when insufficient_privilege then null;
  end;
  begin
    update app_stepwise.lesson_list_items set example_id = 'a0000000-0000-4000-8000-000000000002'
      where id = '1b100000-0000-4000-8000-000000000001';
    raise exception 'B pointed his item at A''s example';
  exception when insufficient_privilege then null;
  end;
  -- B cannot reorder A's list: to him it does not exist.
  begin
    perform app_stepwise.reorder_lesson_list('1a000000-0000-4000-8000-000000000001',
      array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000002',
            '1a100000-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'B reordered A''s list';
  exception when raise_exception then
    if sqlerrm not like 'lesson_list_missing%' then raise; end if;
  end;
end $$;
commit;

-- A's lists and items are untouched by B's attempts.
do $$ begin
  if (select title from app_stepwise.lesson_lists where id = '1a000000-0000-4000-8000-000000000002') <> 'Week 2'
     or not exists (select from app_stepwise.lesson_lists where id = '1a000000-0000-4000-8000-000000000001')
     or (select note from app_stepwise.lesson_list_items where id = '1a200000-0000-4000-8000-000000000001') <> 'tree first'
     or (select array_agg(position order by id) from app_stepwise.lesson_list_items
         where list_id = '1a000000-0000-4000-8000-000000000001') <> array[0, 1, 2]
     or (select count(*) from app_stepwise.lesson_list_items
         where list_id = '1a000000-0000-4000-8000-000000000002') <> 3 then
    raise exception 'B changed A''s lists or items';
  end if;
end $$;

do $$ begin perform pg_sleep(0.02); end $$;

-- A renames, changes notes and item notes, reorders and removes.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
do $$
declare
  n int;
  before_created timestamptz;
  before_updated timestamptz;
begin
  select created_at, updated_at into before_created, before_updated from app_stepwise.lesson_lists
    where id = '1a000000-0000-4000-8000-000000000001';
  update app_stepwise.lesson_lists set title = 'Week 1, renamed', notes = 'new notes', created_at = '2000-01-01'
    where id = '1a000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A could not rename her list'; end if;
  if (select updated_at <= before_updated or created_at <> before_created
      from app_stepwise.lesson_lists where id = '1a000000-0000-4000-8000-000000000001') then
    raise exception 'updated_at should move on update and created_at should stay';
  end if;
  update app_stepwise.lesson_list_items set note = 'start here, slowly'
    where id = '1a100000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A could not change an item''s note'; end if;
  -- Even the owner cannot move an item to another list.
  begin
    update app_stepwise.lesson_list_items set list_id = '1a000000-0000-4000-8000-000000000002'
      where id = '1a100000-0000-4000-8000-000000000001';
    raise exception 'an item moved to another list';
  exception when insufficient_privilege then null;
  end;

  -- Reorder: last first. One statement renumbers the list, so swapping places works.
  perform app_stepwise.reorder_lesson_list('1a000000-0000-4000-8000-000000000001',
    array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000001',
          '1a100000-0000-4000-8000-000000000002']::uuid[]);
  if (select array_agg(id order by position) from app_stepwise.lesson_list_items
      where list_id = '1a000000-0000-4000-8000-000000000001')
     <> array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000001',
              '1a100000-0000-4000-8000-000000000002']::uuid[] then
    raise exception 'reorder did not put the items in the order asked for';
  end if;
  -- An order that leaves one out, names one twice, names another list's item, or is empty or
  -- null is refused, and the order stays as it was.
  declare
    bad uuid[];
  begin
    foreach bad slice 1 in array array[
      array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000001', null],
      array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000001',
            '1a100000-0000-4000-8000-000000000001'],
      array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000001',
            '1a200000-0000-4000-8000-000000000001']
    ]::uuid[] loop
      begin
        perform app_stepwise.reorder_lesson_list('1a000000-0000-4000-8000-000000000001', bad);
        raise exception 'reorder accepted %', bad;
      exception when raise_exception then
        if sqlerrm not like 'lesson_list_order%' then raise; end if;
      end;
    end loop;
  end;
  begin
    perform app_stepwise.reorder_lesson_list('1a000000-0000-4000-8000-000000000001',
      array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'reorder accepted an order with an item left out';
  exception when raise_exception then
    if sqlerrm not like 'lesson_list_order%' then raise; end if;
  end;
  begin
    perform app_stepwise.reorder_lesson_list('1a000000-0000-4000-8000-000000000001', null);
    raise exception 'reorder accepted null';
  exception when raise_exception then
    if sqlerrm not like 'lesson_list_order%' then raise; end if;
  end;

  -- Remove the middle item; the next one added goes at the end.
  delete from app_stepwise.lesson_list_items where id = '1a100000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A could not remove an item'; end if;
  select updated_at into before_updated from app_stepwise.lesson_lists
    where id = '1a000000-0000-4000-8000-000000000001';
  insert into app_stepwise.lesson_list_items (id, list_id, example_id) values
    ('1a100000-0000-4000-8000-000000000004', '1a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');
  if (select array_agg(id order by position) from app_stepwise.lesson_list_items
      where list_id = '1a000000-0000-4000-8000-000000000001')
     <> array['1a100000-0000-4000-8000-000000000003', '1a100000-0000-4000-8000-000000000002',
              '1a100000-0000-4000-8000-000000000004']::uuid[] then
    raise exception 'an item added after a removal should go at the end';
  end if;
end $$;
commit;

-- The check constraints refuse oversize rows.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
do $$
declare
  bad record;
begin
  for bad in
    select * from (values ('long title', repeat('t', 201), ''), ('long notes', 'ok', repeat('n', 2001)))
      as t(what, title, notes)
  loop
    begin
      insert into app_stepwise.lesson_lists (title, notes) values (bad.title, bad.notes);
      raise exception 'accepted a list with a %', bad.what;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into app_stepwise.lesson_list_items (list_id, example_id, note) values
      ('1a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', repeat('n', 2001));
    raise exception 'accepted an item with a long note';
  exception when check_violation then null;
  end;
  -- At the limits is fine.
  insert into app_stepwise.lesson_lists (title, notes) values (repeat('t', 200), repeat('n', 2000));
  insert into app_stepwise.lesson_list_items (list_id, example_id, note) values
    ('1a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', repeat('n', 2000));
end $$;
rollback;

-- Privileges: anon has none on the tables; the shared function is for everyone, reorder only for
-- the signed in, and the trigger functions for nobody.
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['app_stepwise.lesson_lists', 'app_stepwise.lesson_list_items'] loop
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) then
        raise exception 'anon has % on %', p, t;
      end if;
      if has_table_privilege('public', t, p) then
        raise exception 'PUBLIC has % on %', p, t;
      end if;
    end loop;
    if has_table_privilege('authenticated', t, 'truncate')
       or has_table_privilege('authenticated', t, 'references')
       or has_table_privilege('authenticated', t, 'trigger') then
      raise exception 'authenticated has more than it needs on %', t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'app_stepwise.lesson_list_items', 'update')
     or has_column_privilege('authenticated', 'app_stepwise.lesson_list_items', 'list_id', 'update')
     or has_column_privilege('authenticated', 'app_stepwise.lesson_list_items', 'example_id', 'update')
     or not has_column_privilege('authenticated', 'app_stepwise.lesson_list_items', 'note', 'update')
     or not has_column_privilege('authenticated', 'app_stepwise.lesson_list_items', 'position', 'update') then
    raise exception 'authenticated should update only an item''s note and position';
  end if;
  if not has_function_privilege('anon', 'app_stepwise.shared_lesson_list(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'app_stepwise.shared_lesson_list(uuid)', 'execute') then
    raise exception 'anon and authenticated must be able to call shared_lesson_list';
  end if;
  if has_function_privilege('anon', 'app_stepwise.reorder_lesson_list(uuid, uuid[])', 'execute')
     or not has_function_privilege('authenticated', 'app_stepwise.reorder_lesson_list(uuid, uuid[])', 'execute') then
    raise exception 'only authenticated may call reorder_lesson_list';
  end if;
  if exists (select from information_schema.routine_privileges
             where routine_schema = 'app_stepwise'
               and routine_name in ('shared_lesson_list', 'reorder_lesson_list')
               and grantee = 'PUBLIC') then
    raise exception 'PUBLIC can still execute a lesson list function';
  end if;
  foreach t in array array['lesson_lists_touch()', 'lesson_lists_cap()', 'lesson_list_items_add()',
                           'lesson_list_items_touch()'] loop
    if has_function_privilege('authenticated', 'app_stepwise.' || t, 'execute')
       or has_function_privilege('anon', 'app_stepwise.' || t, 'execute') then
      raise exception 'the trigger function % can be called', t;
    end if;
  end loop;
end $$;

begin;
set local role anon;
do $$
declare
  got jsonb;
  items jsonb;
begin
  begin
    perform 1 from app_stepwise.lesson_lists;
    raise exception 'anon read the lists';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from app_stepwise.lesson_list_items;
    raise exception 'anon read the items';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into app_stepwise.lesson_lists (title) values ('anon');
    raise exception 'anon made a list';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app_stepwise.reorder_lesson_list('1a000000-0000-4000-8000-000000000002', array[]::uuid[]);
    raise exception 'anon called reorder';
  exception when insufficient_privilege then null;
  end;

  -- A shared list: exactly three columns, its items in order, private examples included, and
  -- no ids or owner anywhere.
  select to_jsonb(s) into got from app_stepwise.shared_lesson_list('1a000000-0000-4000-8000-000000000002') as s;
  if got is null then raise exception 'anon could not read a shared list'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(got) as k) <> array['items', 'notes', 'title'] then
    raise exception 'shared_lesson_list returned other columns: %', got;
  end if;
  if got ->> 'title' <> 'Week 2' or got ->> 'notes' <> 'Shared with the class' then
    raise exception 'shared_lesson_list returned the wrong list: %', got;
  end if;
  items := got -> 'items';
  if jsonb_array_length(items) <> 3 then raise exception 'expected 3 items: %', items; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(items -> 0) as k)
     <> array['example', 'note', 'notes', 'title', 'viz'] then
    raise exception 'an item has other fields: %', items -> 0;
  end if;
  if (select array_agg(i ->> 'note' order by n) from jsonb_array_elements(items) with ordinality as x (i, n))
     <> array['tree first', 'then the stack', 'and the tree again'] then
    raise exception 'the items are out of order: %', items;
  end if;
  if items -> 1 ->> 'title' <> 'A one' or items -> 1 ->> 'viz' <> 'stack-array'
     or items -> 1 ->> 'notes' <> 'first notes'
     or items -> 1 -> 'example' -> 'ops' <> '[["push", 1]]'::jsonb then
    raise exception 'a private example in a shared list should be readable through it: %', items -> 1;
  end if;
  if got::text like '%0000000a-%' or got::text like '%a0000000-%' or got::text like '%1a%00000-%' then
    raise exception 'shared_lesson_list gave away an id: %', got;
  end if;
  -- Private and missing lists: nothing.
  if exists (select from app_stepwise.shared_lesson_list('1a000000-0000-4000-8000-000000000001')) then
    raise exception 'anon read a private list';
  end if;
  if exists (select from app_stepwise.shared_lesson_list('1b000000-0000-4000-8000-000000000001')) then
    raise exception 'anon read B''s private list';
  end if;
  if exists (select from app_stepwise.shared_lesson_list('ffffffff-0000-4000-8000-000000000000')) then
    raise exception 'shared_lesson_list returned a row for a missing id';
  end if;
end $$;
rollback;

-- Signed in as someone else: the same through the function, and still nothing directly.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000b-0000-4000-8000-000000000000","role":"authenticated"}';
do $$ begin
  if (select count(*) from app_stepwise.shared_lesson_list('1a000000-0000-4000-8000-000000000002')) <> 1 then
    raise exception 'B could not read A''s shared list through the function';
  end if;
  if exists (select from app_stepwise.lesson_lists where id = '1a000000-0000-4000-8000-000000000002')
     or exists (select from app_stepwise.lesson_list_items where list_id = '1a000000-0000-4000-8000-000000000002') then
    raise exception 'B read A''s shared list from the tables';
  end if;
  if exists (select from app_stepwise.shared_lesson_list('1a000000-0000-4000-8000-000000000001')) then
    raise exception 'B read A''s private list through the function';
  end if;
end $$;
rollback;

-- An empty shared list reads as a list with no items, not as a missing one.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000b-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.lesson_lists (id, title, shared) values ('1b000000-0000-4000-8000-000000000002', 'Empty', true);
do $$ begin
  if (select items from app_stepwise.shared_lesson_list('1b000000-0000-4000-8000-000000000002')) <> '[]'::jsonb then
    raise exception 'an empty shared list should have items []';
  end if;
end $$;
rollback;

-- Once unshared, the link stops working.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
update app_stepwise.lesson_lists set shared = false where id = '1a000000-0000-4000-8000-000000000002';
commit;
begin;
set local role anon;
do $$ begin
  if exists (select from app_stepwise.shared_lesson_list('1a000000-0000-4000-8000-000000000002')) then
    raise exception 'an unshared list is still readable';
  end if;
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
update app_stepwise.lesson_lists set shared = true where id = '1a000000-0000-4000-8000-000000000002';
commit;

-- An account holds at most 200 lists, and a list at most 100 items.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000c-0000-4000-8000-000000000000","role":"authenticated"}';
insert into app_stepwise.saved_examples (id, viz, title, example) values
  ('c0000000-0000-4000-8000-000000000001', 'bst', 'C one', '{}');
insert into app_stepwise.lesson_lists (id, title) values ('1c000000-0000-4000-8000-000000000001', 'C full');
insert into app_stepwise.lesson_lists (title) select 'n' || i from generate_series(2, 200) as i;
insert into app_stepwise.lesson_list_items (list_id, example_id)
  select '1c000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'
  from generate_series(1, 100);
do $$ begin
  begin
    insert into app_stepwise.lesson_lists (title) values ('one too many');
    raise exception 'the 201st list was accepted';
  exception when raise_exception then
    if sqlerrm not like 'lesson_lists_limit%' then raise; end if;
  end;
  begin
    insert into app_stepwise.lesson_list_items (list_id, example_id) values
      ('1c000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');
    raise exception 'the 101st item was accepted';
  exception when raise_exception then
    if sqlerrm not like 'lesson_list_items_limit%' then raise; end if;
  end;
  if (select array_agg(position order by position) from app_stepwise.lesson_list_items
      where list_id = '1c000000-0000-4000-8000-000000000001')
     <> (select array_agg(i) from generate_series(0, 99) as i) then
    raise exception 'a list filled in one statement should be numbered 0 to 99';
  end if;
end $$;
commit;

-- Cascades: deleting an example takes it out of every list (the list stays); deleting a list
-- deletes its items; deleting the auth user deletes their lists and items.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"0000000a-0000-4000-8000-000000000000","role":"authenticated"}';
do $$
declare
  before_updated timestamptz;
begin
  select updated_at into before_updated from app_stepwise.lesson_lists
    where id = '1a000000-0000-4000-8000-000000000002';
  perform pg_sleep(0.02);
  delete from app_stepwise.saved_examples where id = 'a0000000-0000-4000-8000-000000000002';
  if exists (select from app_stepwise.lesson_list_items where example_id = 'a0000000-0000-4000-8000-000000000002') then
    raise exception 'deleting an example left it in a list';
  end if;
  if (select count(*) from app_stepwise.lesson_list_items where list_id = '1a000000-0000-4000-8000-000000000002') <> 1
     or not exists (select from app_stepwise.lesson_lists where id = '1a000000-0000-4000-8000-000000000002') then
    raise exception 'deleting an example should leave the list and its other items';
  end if;
  if (select updated_at <= before_updated from app_stepwise.lesson_lists
      where id = '1a000000-0000-4000-8000-000000000002') then
    raise exception 'an item taken out of a list should count as a change to it';
  end if;
  if (select jsonb_array_length(items) from app_stepwise.shared_lesson_list('1a000000-0000-4000-8000-000000000002')) <> 1 then
    raise exception 'the shared list should now have one item';
  end if;
  delete from app_stepwise.lesson_lists where id = '1a000000-0000-4000-8000-000000000001';
end $$;
commit;

do $$ begin
  if exists (select from app_stepwise.lesson_list_items where list_id = '1a000000-0000-4000-8000-000000000001') then
    raise exception 'deleting a list left its items behind';
  end if;
  if not exists (select from app_stepwise.lesson_lists where owner = '0000000a-0000-4000-8000-000000000000') then
    raise exception 'setup: A should still have a list';
  end if;
  delete from auth.users where id = '0000000a-0000-4000-8000-000000000000';
  if exists (select from app_stepwise.lesson_lists where owner = '0000000a-0000-4000-8000-000000000000')
     or exists (select from app_stepwise.lesson_list_items as i
                where not exists (select from app_stepwise.lesson_lists as l where l.id = i.list_id)) then
    raise exception 'deleting the user left her lists or items behind';
  end if;
  if (select count(*) from app_stepwise.lesson_lists where owner = '0000000b-0000-4000-8000-000000000000') <> 1
     or (select count(*) from app_stepwise.lesson_list_items where list_id = '1b000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'deleting A touched B''s lists';
  end if;
end $$;

\echo all lesson_lists tests passed
