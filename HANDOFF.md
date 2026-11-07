# StepWise handoff

The rolling handoff for the StepWise cloud sessions (the session-relay skill). Each handover
rewrites this file; it never gets a dated copy. Times are Europe/Berlin.

Last written: Saturday 7 November 2026, about 21:20. No handover today: at the 15:56 check the
context was about 18% (after a compaction), so the current session carries on. This file is
kept current for the next handover.

## What is live

- `main` is at `381c171`, live on Netlify (site `stepwise-pisan-labs`, `stepwise.pisan.me`),
  deployed at 20:00 on Yusuf's "deploy": 122 pages. The live bundle matched a local build of
  `381c171` and every page returned 200.
- `next` is ahead of `main` by: the halting-problem, multitape-tm and regex-engines pages, the
  allow rule in `.claude/settings.json` (below), the conformance fix for `sizes: []`, and logs.
  125 pages. The daily deploy routine fast-forwards `main` to `next` at 17:27 if CI on `next`'s
  head is green.
- Checks on `next`: lint, svelte-check and 2902 unit tests passed on `e18d7ed`; the full local
  e2e on `a7fbdac` passed (2041, 5 skipped); a full e2e with regex-engines was running at 21:20.

## Merged today (Saturday 7 November), on `next` unless marked

- 08:05 and 08:44, `main`: all 108 pages live; a taller desktop stage, with views given the
  stage's size (`StageSize`, `view(step, settings, stage?)`) and graph pages laying out for it.
- 08:49, automata groundwork (`src/viz/_automata/`, `src/layouts/automaton.ts`, `tape.ts`, curved
  arrows). 08:52, CI on `next`. 09:00, the deploy rule (`PLAN.md` decision 34).
- 09:39 to 09:56, wave 5A: dfa, nfa, nfa-to-dfa, dfa-minimization, regex-to-nfa, turing-machine.
- 13:54 to 15:19, wave 5B: cfg-derivation, cyk (`src/viz/_grammar/`), pda, chomsky-hierarchy;
  14:02, 15 more pages arrange their parts for the stage; 14:15, consolidated automata code.
- 14:42, `main`: Yusuf merged PR #1 (catalog thumbnails, from `session_015Hhm4gYmBnZQozfDqkFdPy`);
  15:51, `main` merged into `next`, with previews for the new pages.
- 17:27: the daily deploy was blocked by the session's auto-mode permission check (production
  deploy). 18:45, `main`: deployed on Yusuf's "deploy" (120 pages).
- 18:00 to 20:20, wave 5C: dfa-to-regex, product-construction, mealy-moore, pumping-lemma,
  halting-problem, multitape-tm; 21:10, regex-engines. All 17 automata pages are on `next`.
- 19:14: `VizDef.opening`, an example a page runs on arrival when the link has none; the
  Chomsky hierarchy opens on the whole map (default taken at 19:03; Yusuf can undo it by saying
  "empty map back"). The halting problem and regex engines pages use it too.
- 19:24, Yusuf's yes: `.claude/settings.json` allows exactly `git push origin origin/next:main`,
  so the daily deploy routine can push. Not yet tested by the routine.
- 20:00, `main`: deployed on Yusuf's "deploy" (122 pages).
- 20:50: the conformance check runs presets at size 5 for pages with `sizes: []`.

## Branches still unmerged

None with unmerged content. `next` is ahead of `main`; `main` is an ancestor of `next`.

## Next, in order

1. Watch the 17:27 deploy on 8 November: the first test of the allow rule. If the permission
   check still blocks it, tell Yusuf (he can say "deploy").
2. Shared-code recommendations from the wave 5 agents, smallest first:
   - `STAGES` in `src/layouts/graph.ts` (and its header comment) still holds the old 884×305
     desktop stage, and `fitScore` falls back to it when a view gets no stage (thumbnails,
     prerender, tests); the desktop stage is now 387 px tall. A code change: check framing;
   - a floor on the tag size in `calls.ts`;
   - plainer wording for the reasons `classify()` gives in `src/viz/_grammar/grammar.ts`;
   - move `construct`, `pictures`, `pairKey`, `randomRegex`, `randomWord` from
     `src/viz/regex-to-nfa/` into `src/viz/_automata/` (regex-engines imports them); a shared
     `readWord`;
   - one word-wrap helper in `src/layouts` (dfa-to-regex, halting-problem and pumping-lemma each
     have their own); `drawTape` with rows and identity-based cell ids; `tableScene` with a
     separated extra row and column;
   - `drawAutomaton`: multi-line and custom move labels, output inside a state (mealy-moore has
     a local `draw.ts`), a diagonal start arrow, a layer-gap option for `layoutFromLayers`;
   - `page.ts`: a `parse` option for `loadOp`; `wordProblem`'s hint mentions a Test button some
     pages lack; a shared two-machine input parser;
   - `matches` in `regex.ts` is exponential on deeply nested concatenations (memoize by node
     and position); `parseRegex` stops at 40 characters;
   - one chooser for layouts in `src/layouts` (today `pickLayout`, `bestPlacement`, the
     chomsky-hierarchy chooser and per-page `placePanels`/`fitScore` column pickers);
   - `textWidth` factors for DejaVu (CI's font); Learn-panel tables that scroll sideways;
   - move `src/viz/_stage/arrange.ts` and `src/viz/_dp/strip.ts` into `src/layouts`;
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

- Read the concept pages of the 17 automata pages for voice (not urgent). Every agent invoked
  `anthropic-skills:write-like-pisan` before its final `explain.md`; nobody has read them against
  it. Start with chomsky-hierarchy, pda and turing-machine. Send page links only once live.

## Not verified

- The zoom-button clearance moves side panels on about 25 graph pages. Their tests pass;
  nobody has looked at screenshots of them.
- Thumbnails of the 17 automata pages were checked by eye once, on the desktop catalog;
  regex-to-nfa is the busiest.
- regex-engines: the backtracker skips an ε-move back to a state already passed at the same
  position (so (a*)*b ends), and after 150 visits it shows only the steps where the count
  doubles. Both are the agent's choices; no one else has reviewed them.

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
- Agents: about four at a time, each in its own worktree with its own `E2E_PORT` (ports up to 4273 have been used; start new ones at 4274), told not to edit shared files, to name e2e
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

- Current session: `session_01JyJzMXcc2unSAwN88hsew5` (lineage depth 2, limit 8). It took over
  on Saturday 7 November at 08:00 from `session_01JyJzMZHCY1tEoov2vYAuJv`. The 15:56 check that
  day found no handover due (context about 18%). The next session will be at depth 3.
- Routines, owned by the current session; the next session moves them to itself at takeover,
  keeping their names exactly:
  - `trig_01AEsnzySTfQAsgxsS9RCdAA`: "StepWise hourly status report", `46 * * * *`.
  - `trig_016mmp7qgknR6maFcPpcHyn6`: "StepWise handoff check: hand over only when due",
    `CRON_TZ=Europe/Berlin 56 15 * * *`.
  - `trig_01Q4wsxyfeskA8277FXxTfcY`: "StepWise daily handoff: start the next session
    (create_session)", `CRON_TZ=Europe/Berlin 52 16 * * *`.
  - `trig_01PfFMZmwbM2JKpfyhtLRmvn`: "StepWise daily deploy: fast-forward main to next",
    `CRON_TZ=Europe/Berlin 27 17 * * *`. It deploys only when CI on `next`'s head is green, and
    stops and asks Yusuf if `main` is not an ancestor of `next`.
- The account's other routines (DSA, Chess TD, Chess Analyzer, Plabs, TPT, product ideas,
  reminders) belong to other projects: never move or change them.
