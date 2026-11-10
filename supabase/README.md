# Accounts on Supabase

StepWise can let readers sign in (Google, or a link by email) and keep their examples in an
account. It uses the shared HintWise Supabase project at `https://auth.hintwise.org`. Sign-in
(Google, magic links sent through Resend, the redirect allow-list `https://*.hintwise.org/**`) is
already set up there for all HintWise apps, and StepWise changes none of it. StepWise keeps its
data in its own schema, `app_stepwise`, and touches nothing else.

Until both build variables below are set, the site shows no account UI and sends nothing to
Supabase, so the code is safe to merge and deploy before then.

## What is left to do

1. **Say yes to the migration.** `migrations/0001_saved_examples.sql` creates the `app_stepwise`
   schema, the `saved_examples` table with row-level security, and the `shared_example`
   function. It is applied by the session that runs the admin workflow. It is idempotent
   (running it twice changes nothing). Once applied it must never be edited: later changes go
   in `0002_...` files.
   *Unlocks:* saving, listing, renaming, deleting and sharing examples.
   Check while it is applied: `app_stepwise` must be among the schemas the Data API exposes
   (Project Settings, Data API, Exposed schemas), next to the other apps' schemas. If it is not,
   every call answers "The schema must be one of the following" and the site says it could not
   reach the account. The site also calls `platform.ensure_profile()` once per account, the
   shared HintWise function; nothing waits for it, so a missing one only logs a failed request.
2. **Set the two build variables** (in `netlify.toml` under `[build.environment]`, or in
   Netlify's environment settings), then deploy:
   - `VITE_SUPABASE_URL` = `https://auth.hintwise.org`
   - `VITE_SUPABASE_ANON_KEY` = the project's anon (public) key.
   Both are public: they end up in the JavaScript every visitor downloads, and row-level
   security is what protects the data. The service-role key never goes in the site.
   *Unlocks:* the "Sign in" button and `#saved=` links on the live site.
3. **Say yes to the lesson lists migration.** `migrations/0003_lesson_lists.sql` (it needs 0001
   only) creates `lesson_lists` and `lesson_list_items` with row-level security, and two
   functions: `shared_lesson_list` (a shared list's content, for anyone with its link) and
   `reorder_lesson_list` (puts a list's items in a new order, for its owner). Idempotent; never
   edited once applied. Until it is applied the rest of the site works, and the lesson-list
   parts say they could not reach the account.
   *Unlocks:* "Add to list" on examples saved in an account, "My lesson lists" (`/#lists`), and
   playing a list from its link (`/#list=<id>`), signed out too when it is shared.

## What is stored, and where

Everything is in the HintWise project, in Supabase's US East region (us-east-1).

- **Supabase Auth** (shared by every HintWise app; one account works on all of them): the email
  address, when the account was made and last signed in, the sign-in method, and for Google
  sign-ins what Google sends (name, picture link and Google account id).
- **`platform.profiles`** (shared HintWise profile, made by `platform.ensure_profile()`): the
  user id, email, a display name (Google's name, else the part of the email before @) and when
  it was made. The reader can read their own row and change the display name.
- **`app_stepwise.saved_examples`**: one row per saved example: the page id, its name, notes,
  the example itself (settings, seed and operations, as in a share link), whether it is shared,
  and when it was made and last changed. Each reader sees only their own rows. Nobody else can
  read the table; a shared example's content (page, name, notes, example) is readable by anyone
  with its link through `app_stepwise.shared_example(id)`, and never who owns it.
- **`app_stepwise.lesson_lists`** and **`app_stepwise.lesson_list_items`**: a reader's lesson
  lists (name, notes, whether it is shared, when it was made and last changed) and, for each, the
  saved examples in it in order, each with an optional note. An item can hold only an example
  from the same account. Each reader sees only their own lists; nobody else can read either
  table. A shared list is readable by anyone with its link through
  `app_stepwise.shared_lesson_list(id)`: its name, notes and its examples in order (page, name,
  notes, example, note), including examples that are not shared on their own, and never who owns
  it or any id. Deleting a saved example takes it out of every list (`on delete cascade`);
  deleting a list leaves its examples in the account.
- **In the reader's browser**: the session (localStorage `stepwise:auth`, written by
  supabase-js, plus a short-lived PKCE code verifier while a sign-in is under way), which
  browser examples were already copied into which account (`stepwise:account-copied`), which
  accounts have a HintWise profile (`stepwise:account-profiles`), and for a moment while signing
  in, the page's address (sessionStorage `stepwise:auth-return`).

Nothing else is recorded: no analytics, no tracking, no logging of what readers do.

**Deleting an account:** there is no self-service yet. A reader who wants their account gone
emails builder@hintwise.org. Deleting the user in Supabase Auth deletes their saved examples and
lesson lists with it (`on delete cascade`), and it ends their account in every HintWise app, since
they share it.

## Testing the migration

There is no Supabase here, so the test runs on plain PostgreSQL 16 with a small stand-in for
Supabase's `auth` schema (`tests/supabase-stub.sql`: the roles `anon` and `authenticated`,
`auth.users`, and `auth.uid()` read from `request.jwt.claims`). No npm needed:

```sh
P="-h localhost -p 54329 -U postgres"
createdb $P sw_test
psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase-stub.sql
psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f supabase/migrations/0001_saved_examples.sql
psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f supabase/migrations/0001_saved_examples.sql  # again: idempotent
psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f supabase/tests/0001_saved_examples.test.sql
dropdb $P sw_test
```

It prints `all saved_examples tests passed`, or stops at the first check that fails. It checks
that a reader sees, adds, changes and deletes only their own rows; that another reader and
anonymous visitors see none; that anon has no grants on the table; that `shared_example`
returns only shared rows and only its four columns, signed in or not; that the check
constraints refuse oversize rows; that an account stops at 1000 examples; and that deleting the
auth user deletes their rows.

Lesson lists (`0003_lesson_lists.sql`) are tested the same way, on their own throwaway database
with the stub and 0001 loaded first, then 0003 twice:

```sh
createdb $P sw_lists
psql $P -d sw_lists -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase-stub.sql
psql $P -d sw_lists -v ON_ERROR_STOP=1 -q -f supabase/migrations/0001_saved_examples.sql
psql $P -d sw_lists -v ON_ERROR_STOP=1 -q -f supabase/migrations/0003_lesson_lists.sql
psql $P -d sw_lists -v ON_ERROR_STOP=1 -q -f supabase/migrations/0003_lesson_lists.sql  # again
psql $P -d sw_lists -v ON_ERROR_STOP=1 -q -f supabase/tests/0003_lesson_lists.test.sql
dropdb $P sw_lists
```

It prints `all lesson_lists tests passed`. It checks that a reader sees, makes, changes, reorders
and deletes only their own lists and items; that nobody can put another account's example (even
a shared one) in a list, or move an item to another list; that anon has no grants on either
table and cannot reorder; that `shared_lesson_list` returns a shared list's three columns with
its items in order (private examples included, no ids), and nothing for a private, unshared or
missing list; that new items go at the end and a reorder must name every item once; the size
checks, 200 lists per account and 100 items per list; and the cascades (an example, a list, the
auth user).

What it cannot show: the stand-in is not Supabase. It does not run PostgREST (so not the
exposed-schema setting, the HTTP errors, or how `rpc` and `maybeSingle` answer), the real
`auth.uid()` and JWT checks, Supabase's default privileges and other roles (`service_role`,
`supabase_admin`), or the other apps' objects in the same project.

## For developers

- The site reads the two variables at build time (`src/account/config.ts`). For local work,
  copy `.env.example` to `.env.local` (git ignores it). Signing in from `localhost` will not
  complete against the real project, whose redirect allow-list holds only `*.hintwise.org`; the
  e2e tests mock every Supabase endpoint instead (`tests/e2e/accounts.spec.ts`).
- Tests turn accounts on or off with `window.__STEPWISE_ACCOUNTS__ = { url, anonKey }` (or
  `null`), set before the app starts (Playwright's `page.addInitScript`).
- supabase-js loads in its own chunk, only when a reader opens Sign in, already has a stored
  session, comes back from signing in (`?code=` or `?error=`), or opens a `#saved=` link or a
  lesson list's link (`#list=`).
