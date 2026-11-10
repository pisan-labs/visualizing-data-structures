# Accounts on Supabase

StepWise can let readers sign in (Google, or a link by email) and keep their examples, settings
and progress in an account. It uses the shared HintWise Supabase project at
`https://auth.hintwise.org`. Sign-in (Google, the platform's sign-in-link service for magic links,
the redirect allow-list `https://*.hintwise.org/**`) is already set up there for all HintWise
apps, and StepWise changes none of it. StepWise keeps its data in its own schema,
`app_stepwise`, and touches nothing else.

Until both build variables below are set, the site shows no account UI and sends nothing to
Supabase, so the code is safe to merge and deploy before then.

## What is left to do

1. **Say yes to the migrations.** Each file in `migrations/` is applied by the session that runs
   the admin workflow, in order. Each is idempotent (running it twice changes nothing). Once
   applied a file must never be edited: later changes go in a new, higher-numbered file.
   - `0001_saved_examples.sql` (applied 10 Nov) creates the `app_stepwise` schema, the
     `saved_examples` table with row-level security, and the `shared_example` function.
     *Unlocks:* saving, listing, renaming, deleting and sharing examples.
   - `0002_preferences.sql` creates the `preferences` table (one row per account) with
     row-level security, read access for `service_role` plus update of `notify_new_pages` only
     (for the platform's email job), and the `delete_my_data` function.
     *Unlocks:* settings and progress that follow the account, the last release seen, the
     "Email me when new pages arrive" choice, and "Delete my StepWise data". Until it is
     applied the site keeps all of these in the browser, says nothing, and "Delete my StepWise
     data" deletes the saved examples table by table.

   Check while one is applied: `app_stepwise` must be among the schemas the Data API exposes
   (Project Settings, Data API, Exposed schemas), next to the other apps' schemas. If it is not,
   every call answers "The schema must be one of the following" and the site says it could not
   reach the account. The site also calls `platform.ensure_profile()` once per account, the
   shared HintWise function; nothing waits for it, so a missing one only logs a failed request.
2. **Set the two build variables** (in `netlify.toml` under `[build.environment]`, or in
   Netlify's environment settings), then deploy:
   - `VITE_SUPABASE_URL` = `https://auth.hintwise.org`
   - `VITE_SUPABASE_ANON_KEY` = the project's anon (public) key.
   Both are public: they end up in the JavaScript every visitor downloads, and row-level
   security is what protects the data. The service-role key never goes in the site. (Done:
   both are in `netlify.toml`.)
3. **Email about new pages is not sent by StepWise.** The account menu only stores the reader's
   choice (`preferences.notify_new_pages`, off unless they tick it). The platform sends the
   email from a daily function of its own, through the owner's Resend account, from
   "StepWise <stepwise@hintwise.org>", with an unsubscribe link that turns `notify_new_pages`
   off. It reads `dist/releases.json` (below) to know what is new, and the rows that ask for
   email. No email goes out until that function exists; StepWise has no code for it.

## Magic links: the platform's sign-in-link service

Google sign-in goes through Supabase Auth as before (PKCE, `?code=` on the way back). Magic
links go through the HintWise platform's sign-in-link service instead of
`supabase.auth.signInWithOtp` (`src/account/link-service.ts`):

- **Request:** `POST https://auth.hintwise.org/functions/v1/sign-in-link` with the headers
  `apikey: <anon key>` and `content-type: application/json`, and the body
  `{ "email", "redirectTo", "app": "stepwise", "browserId", "turnstileToken"? }`.
  `redirectTo` is the page's origin and path only: the service drops a query and a hash, so the
  page's hash is put aside in sessionStorage (`stepwise:auth-return`) and put back on return.
- **browserId** is a random id (`crypto.randomUUID()`) made once and kept in localStorage under
  `hintwise.browserId` (a platform convention shared by every HintWise app, so not under our
  `stepwise:` prefix). It lets the service tell repeated requests from one browser apart. It
  says nothing about the reader and is not sent anywhere else.
- **Answers:** 200 `{status: 'sent'}`: "Check your email". 429 `{status: 'wait', retryAt}`: "You
  can ask for another link at <local time>", with the button off until then (the waits per
  address grow: 1, 3, 5, 8, 13, 21 minutes). 403 `{status: 'challenge', siteKey, failed?}`: a
  Cloudflare Turnstile check (below), then the same request again with `turnstileToken`;
  `failed` shows "That check did not work; try again". Any other error `{status: 'error',
  message}`: the message as is (for example 503 "Email sign-in is paused; try Google"). No
  answer: the usual "Could not reach the account server" message.
- **Cloudflare Turnstile** is the only script StepWise ever loads from another site, and only
  when the service asks for a check: `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`,
  rendered in the sign-in dialog with the action `sign-in` (`src/account/turnstile.ts`). Its
  token works once, so the widget is reset after each request. While the check shows, the
  dialog's privacy text adds "This check is run by Cloudflare."
- **The email's link** opens `redirectTo?token_hash=…&type=email&email_hint=a***@domain`. The
  page loads supabase-js, calls `verifyOtp({ token_hash, type: 'email' })`, takes the three
  parameters out of the address and puts the saved hash back. It works in any browser. If
  someone else is already signed in here (their address does not fit `email_hint`), the page
  asks before switching accounts.

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
- **`app_stepwise.preferences`**: one row per account: the settings that follow the reader
  (theme, playback speed, detail level, code view and the last tab, each with the time it was
  chosen), their progress (lessons read, concept checks answered right, practice first tries,
  each with its time), the id of the last release they saw, whether they asked for email about
  new pages, and when the row last changed. The reader sees and changes only their own row.
  The platform's email job (`service_role`) reads the rows and may only turn the email choice
  off. Size limits: settings 4 KB, progress 512 KB.
- **Lesson lists** (`0003_...`, built beside this): see that migration.
- **In the reader's browser**, signed in or not: the settings (`stepwise:theme`, `speed`,
  `detail`, `codeView`, `tab`) and since this slice when each was chosen (`stepwise:pref-times`),
  progress (`stepwise:progress`), the last release seen (`stepwise:last-release`), the examples
  saved in this browser (`stepwise:library`) and the recent pages (`stepwise:recent`). Signed
  in, the first four are merged with the account's copy and written back a few seconds after
  each change; signed out they never leave the browser.
- **In the reader's browser, for accounts**: the session (localStorage `stepwise:auth`, written
  by supabase-js, plus a short-lived PKCE code verifier while a Google sign-in is under way),
  which browser examples were already copied into which account (`stepwise:account-copied`),
  which accounts have a HintWise profile (`stepwise:account-profiles`), the sign-in-link
  service's browser id (`hintwise.browserId`, made the first time a link is asked for), and for
  a moment while signing in, the page's address (sessionStorage `stepwise:auth-return`).

Nothing else is recorded: no analytics, no tracking, no logging of what readers do.

## How settings and progress follow the account

`src/account/sync.svelte.ts`, with the merge in `src/account/sync-merge.ts` and
`src/progress/progress.ts`. On sign-in (or a page load with a stored session) the site reads the
row, merges it with the browser's copy, shows the result and writes it back if the account lacked
anything. Afterwards each change is written about three seconds later (at once when the tab is
hidden), and a tab that comes back into view after a minute reads the row again. Nothing waits
for any of it; a write that fails leaves the change in the browser for the next try.

The merge keeps, for every setting, lesson, check and practice question, the later of the two
records ("Reset my progress" is a time too, so it empties every copy). It gives the same result
whichever copy comes first and changes nothing when a copy meets itself. A write names the
`updated_at` of the row it was merged from and only lands if the row is unchanged (compare and
swap; `updated_at` moves forward on every write); otherwise the site reads the row again,
merges and retries. So two tabs or two computers never overwrite each other's changes, and all
copies end up the same (`src/account/sync.test.ts` checks this on random sequences of changes).
The email choice is written only when the reader changes it, so a write from another tab never
undoes it (or the platform's unsubscribe link).

## Deleting

**Delete my StepWise data** (account menu, signed in) asks first, then calls
`app_stepwise.delete_my_data()`, which deletes the reader's rows from every `app_stepwise`
table with an `owner` column: saved examples, preferences, and lesson lists (any table added
later is covered as long as it keeps the reader's id in `owner`). It runs as the reader, so
row-level security still holds. The site then clears this browser's copy of the settings,
progress and last release seen, forgets which browser examples went into that account, and
signs out here. Examples saved in this browser only stay. Another browser where the reader is
still signed in keeps its own copy and would save it again, so the dialog says to sign out
there first.

**Deleting the account itself**: there is no self-service, since the account is shared with
every HintWise app. A reader who wants it gone emails builder@hintwise.org. Deleting the user in
Supabase Auth deletes all their `app_stepwise` rows with it (`on delete cascade`), and ends their
account in every HintWise app.

## Testing the migrations

There is no Supabase here, so the tests run on plain PostgreSQL 16 with a small stand-in for
Supabase's `auth` schema and roles (`tests/supabase-stub.sql`: the roles `anon`,
`authenticated` and `service_role`, `auth.users`, and `auth.uid()` read from
`request.jwt.claims`). No npm needed:

```sh
P="-h localhost -p 54329 -U postgres"
createdb $P sw_test
psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/0001_saved_examples.sql supabase/migrations/0002_preferences.sql; do
  psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f $f
  psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f $f  # again: idempotent
done
psql $P -d sw_test -v ON_ERROR_STOP=1 -q -f supabase/tests/0002_preferences.test.sql
dropdb $P sw_test
```

Run `tests/0001_saved_examples.test.sql` the same way on its own fresh database (each test file
makes its own users). Each prints `all ... tests passed`, or stops at the first check that
fails.

- **0001** checks that a reader sees, adds, changes and deletes only their own rows; that
  another reader and anonymous visitors see none; that anon has no grants on the table; that
  `shared_example` returns only shared rows and only its four columns, signed in or not; that
  the check constraints refuse oversize rows; that an account stops at 1000 examples; and that
  deleting the auth user deletes their rows.
- **0002** checks one row per account and owner isolation for every operation (including an
  upsert and moving a row to someone else); that `updated_at` is set by the database and moves
  forward on every write, even twice in one transaction, so a stale write back matches nothing;
  the size and format checks; that anon has no grants and cannot call `delete_my_data`; that
  `service_role` reads every row and may update `notify_new_pages` and nothing else; that
  `delete_my_data` deletes the caller's rows from every table with an owner column (two
  stand-in lesson-list tables, one referring to saved examples, are made for the test) and
  nobody else's, and refuses a caller with no user; and that deleting the auth user deletes the
  row.

What they cannot show: the stand-in is not Supabase. It does not run PostgREST (so not the
exposed-schema setting, the HTTP errors, or how `rpc` and `maybeSingle` answer), the real
`auth.uid()` and JWT checks, Supabase's default privileges and other roles (`supabase_admin`),
or the other apps' objects in the same project.

## For developers

- The site reads the two variables at build time (`src/account/config.ts`). For local work,
  copy `.env.example` to `.env.local` (git ignores it). Signing in from `localhost` will not
  complete against the real project, whose redirect allow-list holds only `*.hintwise.org`; the
  e2e tests mock every Supabase endpoint, the sign-in-link service and Turnstile instead
  (`tests/e2e/supabase-mock.ts`, `accounts.spec.ts`, `account-sync.spec.ts`).
- Tests turn accounts on or off with `window.__STEPWISE_ACCOUNTS__ = { url, anonKey }` (or
  `null`), set before the app starts (Playwright's `page.addInitScript`).
- supabase-js loads in its own chunk, only when a reader opens Sign in, already has a stored
  session, comes back from signing in (`?code=`, `?token_hash=` or `?error=`), or opens a
  `#saved=` link.
- `dist/releases.json` is written by `scripts/prerender.mjs` from `src/releases.ts`: every
  release with its stable `id` (never changed once published), date, title, one-line note and
  its new pages (id, title and address). Add a release at the end of `src/releases.ts` with each
  deploy that brings something new; the home page's "New since your last visit" shows it.
