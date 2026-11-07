# StepWise handoff

The rolling handoff for the StepWise cloud sessions (the session-relay skill). Each handover
rewrites this file; it never gets a dated copy. Times are Europe/Berlin.

Last written: Saturday 7 November 2026, about 08:00, for the handover Yusuf asked for at 07:55.
The previous session starts the next one at once, so the 16:52 session-start run (which looks
only for a marker made since 15:30) finds nothing to do.

## What is live

- Nothing is published yet. Yusuf deploys to Netlify by hand (site `stepwise-pisan-labs`, domain
  `stepwise.pisan.me`); sessions never start, publish or roll back a deploy.
- `main` holds all 108 catalog pages, each with a concept page, curated examples, a Big-O
  self-test, presets, Python/Java/C++ code tabs, a practice set and tests.
- CI: every push of 6 November passed (runs 48 to 57); the last on `53991fb`.
- Last full checks on main (6 November, 18:20): lint, svelte-check, 2270 unit tests, and the
  full e2e suite (1636 passed, 4 skipped) on desktop and phone with axe.

## Merged since the last handover (5 and 6 November)

- Thu 5 Nov: 06:49 takeover; 12:10 wave 4 batch 1 (13 pages); 12:55 `showMe()` e2e helper;
  17:15 geometry (convex-hull, polygon, coordinates-2d, rotate-scale-2d, `src/layouts/plane.ts`).
- Fri 6 Nov:
  - 08:27 (pushed 08:42), grid-bfs, a-star, suffix-array (`src/layouts/grid.ts`, `src/viz/_grid/`);
    max-flow, bipartite-matching, min-cost-flow (`src/viz/_flow/`); weighted-matching,
    general-matching, two-sat;
  - 08:50, the skip-list reference test gets a 180 s budget (it timed out under load: 2000
    more random cases found no counterexample);
  - 11:48, suffix-tree (naive or Ukkonen), np-reductions;
  - 11:52, tsp, vertex-cover, steiner-tree (`src/viz/_approx/kit.ts`); 12:04, the DFS
    readability e2e check polls its heights;
  - 12:13, rotate-translate-2d, rotate-scale-3d, coordinates-3d (`src/layouts/space.ts`);
  - 12:47 (pushed 13:07), arrow lines take their role's colour; the preset select stays on screen;
    `sizes: []` hides the size select;
  - 13:52, group roles `g1` to `g8` (`groupRole(k)` in `src/engine/types.ts`) for components,
    SCC and 2-SAT; 14:27 (both pushed then), axe scans call `settled()` from `tests/e2e/helpers.ts` first;
  - 17:51 (pushed 18:20), a `polygon` shape kind (filled, tinted by role) and `drawPolygon({ fill })`; the
    polygon page shades the polygon and each shoelace triangle.

## Branches still unmerged

None with unmerged content. Seven `worktree-agent-*` WIP copies on origin are unmerged by git
but superseded: their content is on main. Leave them; they are not an owner action.

## Next, in order

1. Views sized to the stage's aspect ratio. At 1366x768 the desktop stage is about 305 px tall,
   so tall scenes (DFS, merge sort, deep tries, DP tables, Kruskal, convex hull, polygon) draw
   small. It changes framing on every page: take screenshots before and after on desktop and
   phone.
2. Smaller shared requests still open: the wider input for long inputs pushes buttons to a
   second row on some pages; a three-value button's error reads "needs l and r and an amount";
   `src/viz/_paths/overlap.ts` could become a shared test; the Master theorem presets can go
   back to fixed recurrences now that `sizes: []` hides the size select. Done on 6 November:
   role colours for arrow lines, group colours g1 to g8, filled polygons, the preset select
   width, `settled()` before axe scans. Declined: loosening the `{A}` leftover check (it also
   catches a missing `$`, such as `{CAPACITY}`).
3. Code-tab coverage: random scripts give the master-theorem and memory-model drivers nothing
   to run; only curated examples test them.
4. Tech debt: unify `src/layouts/node-chain.ts` with `src/layouts/linked.ts`, with screenshots
   before and after.
5. The "All colliding keys" preset on the four hashing pages uses a hidden `fill` operation;
   presets now receive the settings (`Preset.make`), so it could become plain inserts.

## Waiting on Yusuf

Nothing open. (This session could not install `.githooks` with `git config core.hooksPath`:
auto mode refused it as persistence. Lint and tests were run by hand before every push.)

## Dated tasks

| When | What |
|---|---|
| (none) | |

## Notes for the next session

### Standing instructions (Yusuf's)

- Read `CLAUDE.md` (definition of done, commands, branches), `BRIEFING.md` and the end of
  `CHANGES.md` (append-only, one line per entry: `YYYY-MM-DD [type] description`).
- Work on `next` and push `next`; no pull requests. Before a commit or push, `git fetch` first.
  `main` is what Netlify publishes (15 credits a deploy): it only fast-forwards to `next`, once
  a day at 17:27 (the daily deploy routine) or when Yusuf says "deploy" (his choice, 7 November).
  Before committing run `npm run lint && npm run check && npm test`, and `npm run e2e` when
  `src/ui`, `src/render` or a view changed.
- Reports and every time in them use Europe/Berlin. Lead with the answer, keep it short, say
  what is not verified.
- Questions go in the message text (or a decision card), numbered, each with a recommendation;
  never a blocking dialog. With no answer in 15 minutes, take the recommendation and say how to
  undo it; without a recommendation, keep working on other parts and list it as open.
- Always ask first and wait for a yes before: writing production data, deploying (Yusuf deploys
  by hand), spending money or using an API key (use the local `claude` CLI), deleting what
  cannot be restored, rotating secrets, rewriting shared history, publishing outside the
  session.
- Concept pages are written in Yusuf's voice: invoke `anthropic-skills:write-like-pisan` first.
- Agent worktrees start from `main` (the default branch), not `next`: tell every agent to run
  `git reset --hard next` first (seen 7 November).
- Agents: about four at a time, each in its own worktree with its own `E2E_PORT` (ports up to
  4241 have been used; start new ones at 4242), told not to edit shared files, to name e2e specs after their pages, to use
  `showMe()` from `tests/e2e/helpers.ts` for "Show me" checks, to commit WIP before a limit stop, to add practice
  sets, to keep rows able to wrap for CI's wider font, to poll (`expect.poll`) when measuring
  the drawing, and not to push. The lead checks the branch for files outside the agent's
  folders, merges with `--no-ff`, runs the conformance check 10 or more times on the new pages
  (`npx vitest run src/viz/conformance.test.ts -t "<ids>"`; random scripts found real bugs
  three times), then the full suite, then pushes.
- The 5-hour usage limit pauses everything every few hours, and the container can restart:
  worktrees survive, so resume agents with SendMessage when the limit resets.
- Never hand over while agents are running: their worktrees and notices live in the old
  container.
- The `dev` branch is retired: all work goes to `main`. It is fully merged; this session could
  not delete it on GitHub (HTTP 403), and nothing uses it.

### Parameters

| Parameter | Value |
|---|---|
| Repository | `pisan-labs/visualizing-data-structures` |
| Handoff document | `HANDOFF.md` at the repo root |
| Routine time zone | Europe/Berlin |
| Report time zone | Europe/Berlin |
| Handover check | 15:56 |
| Session start | 16:52 |
| Handoff marker | a commit on `next` with exactly the subject `docs: the handoff of <D Month>` (no pull requests) |
| Merge rule | `npm run lint && npm run check && npm test` pass (and `npm run e2e` when `src/ui`, `src/render` or a view changed), then push `next`; CI runs on the push. `main` fast-forwards to `next` at 17:27 or when Yusuf says "deploy" |
| Project rule | never hand over while subagents are running |

### Scheduling

- Previous session: `session_01JyJzMZHCY1tEoov2vYAuJv` (lineage depth 1, limit 8). It took over
  on Thursday 5 November at 06:49 from `session_01JyJzMV9R79kmMm2TxMzCD9` and handed over on
  Saturday 7 November at about 08:00 at Yusuf's request (context about 50%). The next session is
  at depth 2.
- The session-start routine looks only for a marker commit made since 15:30 that day, so this
  morning's handover cannot start a second session at 16:52.
- Current session: `session_01JyJzMXcc2unSAwN88hsew5` (lineage depth 2, limit 8), created by
  the previous session on Saturday 7 November at 07:59; it took over at 08:00.
- Routines, moved to the current session at takeover (the old ids are deleted):
  - `trig_01AEsnzySTfQAsgxsS9RCdAA`: StepWise hourly status report, `46 * * * *`.
  - `trig_016mmp7qgknR6maFcPpcHyn6`: StepWise handoff check, `CRON_TZ=Europe/Berlin 56 15 * * *`.
  - `trig_01Q4wsxyfeskA8277FXxTfcY`: StepWise daily handoff (session start),
    `CRON_TZ=Europe/Berlin 52 16 * * *`.
  - `trig_01PfFMZmwbM2JKpfyhtLRmvn`: StepWise daily deploy (fast-forward `main` to `next`
    when CI on `next` is green), `CRON_TZ=Europe/Berlin 27 17 * * *`. Created 7 November.
- The relay routines' prompts were updated on 7 November for the `next` branch: the handoff
  marker goes on `next`, and the session start checks out `next`.
- The account's other routines (DSA, Chess TD, Chess Analyzer, Plabs, TPT, product ideas,
  reminders) belong to other projects: never move or change them.
