# StepWise handoff

The closing handoff. The session relay ended on Wednesday 11 November 2026: Yusuf asked for a
final deploy, the routines to be deleted, and the last session (`session_01JyJzMVTxpUGw93ZHHXr69v`)
to be archived. No session takes over, and nothing is scheduled. Times are Lisbon time (Yusuf's
choice of 10 November).

## What is live

**Update, 14 November 2026, 09:50 Lisbon:** `main` is at `9ca8d71`, deployed on Yusuf's
"deploy" after CI run 215 passed: the AI and LLMs pathway (33 pages, PLAN.md section 20), the
release `2026-11-14-ai-and-llms` in `notify-feed.json` (emailed to opted-in readers at the next
app-notify run, 15:17 UTC), and the CI concurrency group. The live check passed: the bundle
(`index-C8enJsGa.js`) matches a local build, all 237 addresses return 200 with the footer once,
the 33 new pages draw, the feed is application/json with no redirect, and an ordinary visit sends
nothing to `auth.hintwise.org`. The notes below are from 11 November.

- `main` is at `70155fe`, live on Netlify at https://stepwise.hintwise.org/ (site
  `stepwise-pisan-labs`), deployed on 11 November at 10:32 on Yusuf's word, after CI on
  `70155fe` passed. The live check passed:
  - the bundle (`index-HsjKBzBp.js`) is the same as at `b418072`, because no source changed;
  - all 204 addresses (the home page and 203 pages) return 200, each with the HintWise footer
    once;
  - the manifest is served as `application/manifest+json`;
  - an ordinary visit sends nothing to `auth.hintwise.org`.
- 203 visualizations (every page in `src/viz/catalog.ts`), each with its concept page,
  examples, practice, code tabs (Python, Java, C++) and a catalog thumbnail.
- Since 10 November:
  - optional accounts on the shared HintWise Supabase project (`app_stepwise` schema,
    migrations 0001 to 0003 applied), with Google and magic-link sign-in;
  - saved and shared examples, lesson lists, preferences and progress that follow the account;
  - "New since your last visit", and "Delete my StepWise data";
  - Present-mode pen and pointer, Save picture, the shortcuts list;
  - printable worksheets, progress, recent pages;
  - the offline app;
  - the HintWise footer on every page, and a Google button that follows Google's branding
    guidelines.
- Magic links go only through the platform's sign-in-link service: the email hook is on since
  11 November, and Yusuf's first live magic-link sign-in worked.
- `next` is one commit ahead of `main`: this handoff and its log lines (docs only, not part of
  the site). Deploy it with the next real change.

## How deploys work now

`main` moves only when Yusuf says "deploy": fast-forward it to a commit on `next` whose CI is
green (`git push origin <sha>:refs/heads/main`, after `git merge-base --is-ancestor origin/main
<sha>`). Each deploy costs 15 Netlify credits. The daily 17:27 Berlin deploy routine was deleted
on 11 November. Then check the live site:

- the bundle name in https://stepwise.hintwise.org/ matches a local `npm run build` made with
  the `VITE_` values from `netlify.toml` (when only docs or headers changed, the bundle name
  does not change, so check the header or page that did);
- every page returns 200;
- an ordinary visit sends nothing to `auth.hintwise.org`.

## Branches to delete (Yusuf; this session could not)

GitHub refused this session's branch deletes (HTTP 403); pushes work. All 19 leftover branches
on origin were checked on 11 November and are safe to delete:

- 9 are fully merged into `next`: `dev`, `wip/accounts-slice1`, `wip/lesson-lists`,
  `wip/offline-app`, `wip/present-tools`, `wip/slice2-sync`,
  `worktree-agent-a821abc5bc340c0ac`, `worktree-agent-aa205b40a571e95f4` and
  `worktree-agent-aa81297ea160adf81`.
- 10 hold only work-in-progress snapshots whose work reached `next` in later commits:
  `wip/followup-practice`, `wip/followup-wording`, `wip/practice-progress`,
  `worktree-agent-a0c892cfc943adc5f`, `worktree-agent-a363cfb926bbc7c1f`,
  `worktree-agent-a4a2653da0afe3f55`, `worktree-agent-a623f1d5e970be25f`,
  `worktree-agent-a64e7be82dd66d736`, `worktree-agent-a69c97199f92c789d` and
  `worktree-agent-abea496d65b7d74bd`.
  - Every file they touch is on `next`, identical or later edited there.
  - What differs: a debug print in a tsp test, a 5 November Master theorem phone layout that
    was later redone, and `prim/mst.ts`, which moved to `src/viz/_graph/mst.ts`.

From a checkout with push rights:

```
git push origin --delete dev wip/accounts-slice1 wip/lesson-lists wip/offline-app wip/present-tools wip/slice2-sync wip/followup-practice wip/followup-wording wip/practice-progress worktree-agent-a821abc5bc340c0ac worktree-agent-aa205b40a571e95f4 worktree-agent-aa81297ea160adf81 worktree-agent-a0c892cfc943adc5f worktree-agent-a363cfb926bbc7c1f worktree-agent-a4a2653da0afe3f55 worktree-agent-a623f1d5e970be25f worktree-agent-a64e7be82dd66d736 worktree-agent-a69c97199f92c789d worktree-agent-abea496d65b7d74bd
git ls-remote --heads origin
```

The second command should list only `main` and `next`.

## Waiting on others

- **Opt-in emails about new pages:** they wait for the platform's daily sender. It reads
  `dist/releases.json` and `preferences.notify_new_pages`, and sends through Yusuf's Resend
  account (`supabase/README.md`). StepWise's side is live; StepWise has no sending code.
- **Self-service deletion of a whole HintWise account:** this is a platform feature. "Delete my
  StepWise data" already removes StepWise's rows.
- The platform side (the Supabase project, the sign-in-link service, the email hook, the footer
  markup) belongs to the Plabs session for `pisanuw/claude-built-apps`. Its `HANDOFF.md` names
  its current session.

## Not verified

- **The factorial axe scan:** on 8 November it found one color-contrast node, once, then passed
  32 runs in a row. Every axe check now prints the failing elements (`PLAN.md` section 15.1,
  item 11), so the next failure will show the cause.

## Starting again

Start a session by hand at https://claude.ai/code with `pisan-labs/visualizing-data-structures`
on the branch `next`. Read `CLAUDE.md` (commands, definition of done, branches), `BRIEFING.md`,
the end of `CHANGES.md`, then this file. Work on `next`; before committing run `npm run lint &&
npm run check && npm test`, and `npm run e2e` when `src/ui`, `src/render` or a view changed.

- The SQL tests (`supabase/tests/`) need a local PostgreSQL 16 with
  `supabase/tests/supabase-stub.sql`; `supabase/README.md` has the steps.
- New migrations go in `supabase/migrations/0004_...`; never edit an applied one. The Plabs
  session applies them on Yusuf's yes.
- A cloud clone can be shallow: run `git fetch --unshallow origin` before comparing branches.
- To run the relay again, the `anthropic-skills:session-relay` skill sets up the routines. The
  deleted ones were the hourly status report, the handover check (15:56 Berlin), the session
  start (16:52 Berlin) and the daily deploy (17:27 Berlin).
