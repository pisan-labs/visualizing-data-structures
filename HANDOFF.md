# StepWise handoff

The rolling handoff for the StepWise cloud sessions (the session-relay skill). Each handover
rewrites this file; it never gets a dated copy. Times are Europe/Berlin.

Last written: Thursday 5 November 2026, 20:50, at Yusuf's request to wrap up for the day. This is
not a handover: the current session stays the relay session and continues later.

## What is live

- Nothing is published yet. Yusuf deploys to Netlify by hand (site `stepwise-pisan-labs`, domain
  `stepwise.pisan.me`); sessions never start, publish or roll back a deploy.
- `main` (`123aaa7` on Friday 6 November) holds 100 of the 108 catalog pages, each with a concept
  page, curated examples, a Big-O self-test, presets, Python/Java/C++ code tabs, a practice set
  and tests.
- CI: runs 44 to 46 passed (the last on `267834f`, 17:15 to 17:39).

## Merged on Thursday 5 November

- 06:49, `session_01JyJzMZHCY1tEoov2vYAuJv` took over the relay.
- 12:10, wave 4 batch 1 (13 pages): prim, kruskal, disjoint-sets; connected-components,
  bipartite, topo-indegree; topo-dfs, scc, bridges; memory-model, big-o-lab, master-theorem,
  bitmask.
- 12:55, `tests/e2e/helpers.ts` `showMe()`: the "Show me" checks also accept a replay that
  already ended (the Boyer-Moore practice test flaked in four agent runs).
- 17:09 (pushed 17:15), wave 4H (4 pages): convex-hull, polygon, coordinates-2d, rotate-scale-2d; shared
  `src/layouts/plane.ts` for the later transform pages.

## Branches still unmerged

None. The three wave 4 batch 2 branches were merged on Friday 6 November at about 08:30 after
10 conformance runs, the full suite (2121 tests) and e2e on their nine pages (152 tests);
main holds 100 of 108 pages.

## Next, in order

1. Look into `src/viz/skip-list/skip-list.test.ts` "matches a reference skip list, coin flips and
   search paths included": it failed once in a full `npm test` on main at about 17:40 while three
   agents were running, then passed 5 of 5 alone. Find the seed or timeout behind it (root
   cause, not a retry).
2. Wave 4 batch 3, the last 8 pages: `rotate-translate-2d`, `rotate-scale-3d`,
   `coordinates-3d` (reuse `src/layouts/plane.ts`), `suffix-tree`, `np-reductions`, `tsp`,
   `vertex-cover`, `steiner-tree`.
3. Shared rendering requests from the agents:
   - a categorical palette for groups (SCC and component colors repeat after five);
   - stroke colors for arrows in every role (`found`, `new`, `done`, `compare`), and a thicker
     `done` edge, in `src/ui/Shapes.svelte`;
   - a filled polygon shape kind in `src/render/scene.ts` (shoelace triangles, unit square);
   - smaller arrowheads for short vectors;
   - `src/ui/OpControls.svelte` hiding the size select when a page's presets take no size
     (then the Master theorem presets can go back to fixed recurrences);
   - views sized to the stage's aspect ratio (tall scenes are small at 1366x768; Kruskal,
     convex hull and polygon also draw small on laptops);
   - the wider input for long inputs pushes buttons to a second row on some pages;
   - a three-value button's error reads "needs l and r and an amount";
   - `src/viz/_paths/overlap.ts` (a label-overlap checker) could become a shared test.
4. Code-tab coverage: random scripts give the master-theorem and memory-model drivers nothing
   to run; only curated examples test them.
5. Tech debt: unify `src/layouts/node-chain.ts` with `src/layouts/linked.ts`, with screenshots
   before and after.
6. The "All colliding keys" preset on the four hashing pages uses a hidden `fill` operation;
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
- Work on `main` and push `main`; no pull requests. Before a commit or push, `git fetch` first.
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
- Agents: about four at a time, each in its own worktree with its own `E2E_PORT` (ports up to
  4215 have been used; start new ones at 4216), told not to edit shared files, to name e2e specs after their pages, to use
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
| Handoff marker | a commit on `main` with exactly the subject `docs: the handoff of <D Month>` (no pull requests) |
| Merge rule | `npm run lint && npm run check && npm test` pass (and `npm run e2e` when `src/ui`, `src/render` or a view changed), then push `main`; CI runs on the push |
| Project rule | never hand over while subagents are running |

### Scheduling

- Current session: `session_01JyJzMZHCY1tEoov2vYAuJv` (lineage depth 1, limit 8). It took over on
  Thursday 5 November at 06:49 from `session_01JyJzMV9R79kmMm2TxMzCD9`, which started the relay
  on Wednesday 4 November. Context was at 24% at 15:41.
- The session-start routine looks only for a marker commit made since 15:30 that day, so an
  early handover cannot start a second session at 16:52.
- Routines aimed at the current session, to move at the next takeover:
  - `trig_01WrodgXYXHnQCWP71RxfbU2`: StepWise hourly status report, `46 * * * *`.
  - `trig_01Tg9X7MLii8DWA6vMVaY1VP`: StepWise handoff check, `CRON_TZ=Europe/Berlin 56 15 * * *`.
  - `trig_01EZxsysCxTEvpueRRchrmfk`: StepWise daily handoff (session start),
    `CRON_TZ=Europe/Berlin 52 16 * * *`.
- The account's other routines (DSA, Chess TD, TPT, product ideas, reminders) belong to other
  projects: never move or change them.
