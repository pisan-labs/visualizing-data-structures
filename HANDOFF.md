# StepWise handoff

The rolling handoff for the StepWise cloud sessions (the session-relay skill). Each handover
rewrites this file; it never gets a dated copy. Times are Europe/Berlin.

Last written: Saturday 7 November 2026, about 16:00, at the daily handover check (context about
55%). The 16:52 session-start routine creates the next session from this file.

## What is live

- `main` is at `92b03fe`, live on Netlify (site `stepwise-pisan-labs`, `stepwise.pisan.me`).
  It holds the 108 pages of 6 November, the taller desktop stage with graph pages laid out for
  the screen (`10f414b`, pushed 08:44), and animated catalog thumbnails (PR #1 from another
  session, `session_015Hhm4gYmBnZQozfDqkFdPy`, merged by Yusuf at 14:42).
- `next` is at `9b9ee16` and holds all of `main` plus today's work below: 118 pages. The daily
  deploy routine fast-forwards `main` to it at 17:27 if CI on `next` is green.
- Checks on `next`:
  - CI passed on every push to `next` up to `6540c9d` (runs 61 to 69). Runs 71 (`20e1b63`) and
    72 (`9b9ee16`) were still running at 15:56.
  - Full local e2e on `20e1b63`: 1862 passed, 4 skipped, desktop and phone with axe.
  - On `9b9ee16`: lint, svelte-check and 2708 unit tests passed. A full local e2e was still
    running at 15:56.

## Merged today (Saturday 7 November), on `next` unless marked

- 08:05, `main`: the push that put all 108 pages live after Yusuf unlocked Netlify builds.
- 08:44, `main`: a taller desktop stage (Options moved to the side column, the back link on the
  title row); views get the stage's size (`StageSize`, `view(step, settings, stage?)`), and
  graph pages choose their layout and side panels for it (`placePanels`, `fitScore` in
  `src/layouts/graph.ts`).
- 08:49, automata groundwork: `src/viz/_automata/` (model, ε-closure, subset construction,
  Moore minimization, regex parser, Thompson's construction, the one-line text format);
  `src/layouts/automaton.ts` (state diagrams), `src/layouts/tape.ts`; curved arrows
  (`ArrowShape.via`).
- 08:52, CI runs on `next` too. 09:00, the deploy rule (below; `PLAN.md` decision 34).
- 09:39 to 09:56, wave 5A: dfa, nfa, nfa-to-dfa, dfa-minimization, regex-to-nfa,
  turing-machine (`src/viz/_turing/`).
- 10:20, `settled()` in `tests/e2e/helpers.ts` also waits for the svg's viewBox; the
  regex-to-nfa test compares scene coordinates, not screen pixels; the bfs and skip-list specs
  poll.
- 13:54, wave 5B grammar pages: cfg-derivation, cyk (`src/viz/_grammar/`: parser, CNF in
  stages, CYK, derivation search, the Chomsky level of a grammar).
- 14:02, option 3 step 2: 15 more pages arrange their parts for the stage
  (`src/viz/_stage/arrange.ts`, `src/viz/_dp/strip.ts`); 27 left as they are, because they
  already read fine or a shared layout or a setting sets their size (no list was kept).
- 14:15, consolidated automata code: a shared page kit, panels and random input in
  `src/viz/_automata/`; one label placement in `drawAutomaton` (label collisions on the six
  pages fell from thousands to 51, all one crossing on the Turing machine's phone diagram);
  `src/layouts/trace.ts` and `route.ts`; side panels clear the zoom buttons; the conformance
  check accepts set notation such as `{q0}`.
- 15:13 and 15:19, wave 5B: pda (`src/viz/_automata/pda.ts`; nondeterminism by breadth-first
  search, capped at 200 configurations) and chomsky-hierarchy.
- 15:51, `main` merged into `next` (the thumbnails). Previews for the ten new pages, and
  thumbnails drop arrowheads on curved arrows as well as straight ones.

## Branches still unmerged

None with unmerged content. `next` is ahead of `main`; `main` is an ancestor of `next`.

## Next, in order

1. Wave 5C, the advanced automata pages (`PLAN.md` 13.5): dfa-to-regex, product-construction,
   pumping-lemma, mealy-moore, multitape-tm, halting-problem, regex-engines. Build them with
   agents, as for 5A and 5B, on the shared code in `src/viz/_automata/`, `_turing/`,
   `_grammar/` and the layouts.
2. Shared-code recommendations from the 5A and 5B agents, smallest first:
   - the `STAGES` comment in `src/layouts/graph.ts` still says 884×305;
   - a floor on the tag size in `calls.ts`;
   - `classify()` reasons say "more than one symbol" where a plainer phrase would do;
   - multi-line arrow labels in `drawAutomaton`;
   - the page kit's scene builder (`faScene`) taking a drawing function; TestRow gaining a
     "stopped" result; a general `parseBatch`; `drawRules` taking any rule;
   - one chooser for layouts in `src/layouts` (today `pickLayout`, `bestPlacement` and the
     chomsky-hierarchy chooser);
   - `textWidth` factors for DejaVu (CI's font);
   - Learn-panel tables that scroll sideways;
   - moving `src/viz/_stage/arrange.ts` and `src/viz/_dp/strip.ts` into `src/layouts`;
   - wrap options for node-chain, align, bars and columns; an "auto" arrangement for
     graph-representations and stack-array.
3. Pages still small (option 3): the Master theorem's smallest text is about 8 px on a laptop
   and 4 px on a phone, and some other pages are still small on a phone. Measure again before
   choosing which to fix.
4. Older items from 6 November: the wider input pushes buttons to a second row on some pages;
   a three-value button's error reads "needs l and r and an amount"; `src/viz/_paths/overlap.ts`
   could become a shared test; Master theorem presets could return to fixed recurrences;
   code-tab coverage for the master-theorem and memory-model drivers (random scripts give them
   nothing); unify `src/layouts/node-chain.ts` with `linked.ts`; the "All colliding keys" preset
   on the hashing pages could become plain inserts.

## Waiting on Yusuf

- Read the concept pages of the ten new pages for voice. Every agent invoked
  `anthropic-skills:write-like-pisan` before its final `explain.md`; nobody has read them against
  it. Start with chomsky-hierarchy, pda and turing-machine.

## Not verified

- The zoom-button clearance moves side panels on about 25 graph pages. Their tests pass;
  nobody has looked at screenshots of them.
- Thumbnails of the ten new pages were checked by eye once, on the desktop catalog; regex-to-nfa
  is the busiest.

## Dated tasks

| When | What |
|---|---|
| Daily 17:27 | The deploy routine fast-forwards `main` to `next` if CI on `next` is green |

## Notes for the next session

### Standing instructions (Yusuf's)

- Read `CLAUDE.md` (definition of done, commands, branches), `BRIEFING.md` and the end of
  `CHANGES.md` (append-only, one line per entry: `YYYY-MM-DD [type] description`).
- Work on `next` and push `next`; no pull requests. Before a commit or push, `git fetch` first.
  `main` is what Netlify publishes (15 credits a deploy): it only fast-forwards to `next`, once
  a day at 17:27 (the daily deploy routine) or when Yusuf says "deploy" (his choice, 7 November).
  Before committing run `npm run lint && npm run check && npm test`, and `npm run e2e` when
  `src/ui`, `src/render` or a view changed.
- Another session (`session_015Hhm4gYmBnZQozfDqkFdPy`, the catalog thumbnails) works through
  pull requests that Yusuf merges into `main`. After such a merge `main` is no longer an
  ancestor of `next`: merge `origin/main` into `next`, run the checks and push `next`, or the
  daily deploy stops and asks. New pages must name a `preview` (`src/render/preview.test.ts`).
- Reports and every time in them use Europe/Berlin. Lead with the answer, keep it short, say
  what is not verified.
- Questions go in the message text (or a decision card), numbered, each with a recommendation;
  never a blocking dialog. With no answer in 15 minutes, take the recommendation and say how to
  undo it; without a recommendation, keep working on other parts and list it as open.
- Always ask first and wait for a yes before: writing production data, deploying outside the
  daily routine, spending money or using an API key (use the local `claude` CLI), deleting what
  cannot be restored, rotating secrets, rewriting shared history, publishing outside the
  session.
- Concept pages are written in Yusuf's voice: invoke `anthropic-skills:write-like-pisan` first.
- Usage: on 7 November at 09:54 Yusuf said usage was at 80% and asked to slow down but not stop.
  Run fewer agents at once when usage is high.
- Agent worktrees start from `main` (the default branch), not `next`: tell every agent to run
  `git reset --hard next` first (seen 7 November).
- Agents: about four at a time, each in its own worktree with its own `E2E_PORT` (ports up to
  4249 have been used; start new ones at 4250), told not to edit shared files, to name e2e
  specs after their pages, to use `showMe()` from `tests/e2e/helpers.ts` for "Show me" checks,
  to commit WIP before a limit stop, to add practice sets and a `preview`, to keep rows able to
  wrap for CI's wider font, to poll (`expect.poll`) when measuring the drawing, and not to
  push. The lead checks the branch for files outside the agent's folders, merges with
  `--no-ff`, runs the conformance check 10 or more times on the new pages
  (`npx vitest run src/viz/conformance.test.ts -t "<ids>"`), then the full suite, then pushes.
- The 5-hour usage limit pauses everything every few hours, and the container can restart:
  worktrees survive, so resume agents with SendMessage when the limit resets.
- Never hand over while agents are running: their worktrees and notices live in the old
  container.

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

- Previous session: `session_01JyJzMXcc2unSAwN88hsew5` (lineage depth 2, limit 8). It took over
  on Saturday 7 November at 08:00 from `session_01JyJzMZHCY1tEoov2vYAuJv` and hands over on
  Saturday 7 November at the 15:56 check (context about 55%). The next session is at depth 3.
- Routines, to be moved to the next session when it takes over:
  - `trig_01AEsnzySTfQAsgxsS9RCdAA`: StepWise hourly status report, `46 * * * *`.
  - `trig_016mmp7qgknR6maFcPpcHyn6`: StepWise handoff check, `CRON_TZ=Europe/Berlin 56 15 * * *`.
  - `trig_01Q4wsxyfeskA8277FXxTfcY`: StepWise daily handoff (session start),
    `CRON_TZ=Europe/Berlin 52 16 * * *`.
  - `trig_01PfFMZmwbM2JKpfyhtLRmvn`: StepWise daily deploy (fast-forward `main` to `next`
    when CI on `next` is green), `CRON_TZ=Europe/Berlin 27 17 * * *`. It stops and asks Yusuf
    if `main` is not an ancestor of `next`.
- The account's other routines (DSA, Chess TD, Chess Analyzer, Plabs, TPT, product ideas,
  reminders) belong to other projects: never move or change them.
