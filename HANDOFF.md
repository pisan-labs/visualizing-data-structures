# StepWise handoff

The rolling handoff for the StepWise cloud sessions (the session-relay skill). Each handover
rewrites this file; it never gets a dated copy. Times are Europe/Berlin.

Last written: Sunday 8 November 2026, about 08:40, for the handover Yusuf asked for at about
08:12 ("merge next to main and deploy, and then do handoff"). The previous session starts the
next one at once, so the 16:52 session-start run (which looks only for a marker made since
15:30) finds nothing to do.

## What is live

- `main` is at `1d91418`, live on Netlify (site `stepwise-pisan-labs`, `stepwise.pisan.me`),
  deployed at 08:26 on Yusuf's word after CI run 98 passed: 129 pages. The live bundle matched a
  local build of `1d91418`, and every page returned 200.
- `next` is ahead of `main` by two cleanups and their logs: the layout chooser and table strip
  moved into `src/layouts` (`ad5bac1`; no scene changed on any page), and one definition of the
  typical stages and a thumbnail stage in `src/render/stage.ts` (`38f65a4`; 5 thumbnails better,
  none worse). The daily deploy at 17:27 fast-forwards `main` to `next` if CI on `next`'s head is
  green.
- Checks: on `38f65a4`, lint, svelte-check and 3016 unit tests passed; the full local e2e on
  `1d91418` had 2166 passed, 1 failed (the factorial axe scan, intermittent, register item 11),
  5 skipped.

## Merged since the last handover (7 November, 08:00), on `next` unless marked

- 7 November: waves 5A, 5B and 5C, the 17 automata and computability pages (09:39 to 21:10);
  catalog thumbnails from PR #1 (Yusuf, `main`, 14:42) merged into `next`; `VizDef.opening`
  (pages that open on an example); the allow rule in `.claude/settings.json` for the daily
  deploy's push; e2e count checks that wait for the drawing to settle. Deploys at 18:45 and 20:00.
- 8 November:
  - 01:58, `main`: deployed (125 pages).
  - 03:57 to 06:24, wave 6, understanding Big-O (`PLAN.md` section 14, decisions 35 to 37):
    loop-counting, big-o-definition, amortized-analysis (linked from the dynamic array page),
    doubling-experiment.
  - 06:16, the Mealy and Moore property test generates only machines the page loads (it failed
    about 1 run in 6; `0de5f99` was pushed red because a check was piped through grep).
  - 06:26 onwards, the shared-code cleanup (`PLAN.md` section 15): the debt register; one
    measured `textWidth` and `wrapText` (`src/layouts/text.ts`) used by layouts and four pages;
    `settled()` waits for playback to finish; one source for the zoom buttons' room
    (`src/render/stage.ts`, `StageSize.strip`; three phone copies counted the buttons twice);
    the layout chooser and table strip in `src/layouts`; the typical stages and a thumbnail
    stage in `src/render/stage.ts`.
  - 08:26, `main`: deployed (129 pages).

## Branches still unmerged

None with unmerged content. Agent worktree branches (`worktree-agent-*`) are all merged.

## Next, in order

1. Watch the 17:27 deploy on 8 November: `next` has the two cleanups after `1d91418`. It is the
   first daily run since the allow rule; if the permission check still blocks the push, tell
   Yusuf (he can say "deploy").
2. The rest of the cleanup register, `PLAN.md` section 15.1:
   - item 8, one chart layout in `src/layouts/chart.ts` for the three local charts
     (big-o-definition on exact fractions, doubling-experiment log-log, amortized-analysis
     two-lane bars; their reports list what each needs);
   - item 9, shared code living in page folders (avl for treap, splay and red-black;
     hash-chaining for four pages; linked-list for three; regex-to-nfa for regex-engines; prim
     for kruskal; leftist-heap for skew-heap) into kits;
   - item 10, `matches()` in `_automata/regex.ts` is exponential on nested concatenations;
   - item 11, the intermittent factorial axe failure (capture the element next time);
   - from the item 6 report: the floyd-warshall and multitape-tm pickers score like `pickBest`
     in `_automata/panels.ts`, and the two `acrossFits` are near copies; they could merge if
     `pickBest` moved into `src/layouts`.
3. Smaller shared-code requests from the wave 5 and 6 agents: multi-line and custom move labels
   in `drawAutomaton`; a `parse` option for `loadOp`; a shared two-machine parser; `drawTape`
   with rows and identity-based cell ids; `gridScene` with an id prefix and no empty headers;
   `classify()` reason wording; `parseRegex`'s 40-character limit.
4. Pages still small (option 3): the Master theorem's smallest text is about 8 px on a laptop
   and 4 px on a phone; measure again before choosing which to fix.
5. Older items from 6 November: the wider input pushes buttons to a second row on some pages; a
   three-value button's error reads "needs l and r and an amount"; `src/viz/_paths/overlap.ts`
   could become a shared test; code-tab coverage for the master-theorem and memory-model drivers;
   unify `src/layouts/node-chain.ts` with `linked.ts`; the hashing "All colliding keys" preset
   could become plain inserts.

## Waiting on Yusuf

- Read some of the new concept pages for voice (not urgent): the 17 automata pages and the four
  Big-O pages. Every agent invoked `anthropic-skills:write-like-pisan` before its final
  `explain.md`; nobody has read them against it. Send page links only once they are live.

## Not verified

- Whether the 17:27 routine can push to `main` on its own with the allow rule; the two pushes
  since it was added were on Yusuf's word.
- regex-engines: the backtracker skips an ε-move back to a state already passed at the same
  position, and after 150 visits shows only the steps where the count doubles; nobody else has
  reviewed these choices.
- The factorial axe failure (register item 11): one color-contrast node, once, element not
  captured.

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
- Agents: about four at a time, each in its own worktree with its own `E2E_PORT` (ports up to 4298 have been used; start new ones at 4300), told not to edit shared files, to name e2e
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
  Sunday 8 November at about 08:45, at Yusuf's request (context about 65%). The next session is
  at depth 3.
- Routines, to be moved to the next session when it takes over, keeping their names exactly:
  - `trig_01AEsnzySTfQAsgxsS9RCdAA`: "StepWise hourly status report", `46 * * * *`.
  - `trig_016mmp7qgknR6maFcPpcHyn6`: "StepWise handoff check: hand over only when due",
    `CRON_TZ=Europe/Berlin 56 15 * * *`.
  - `trig_01Q4wsxyfeskA8277FXxTfcY`: "StepWise daily handoff: start the next session
    (create_session)", `CRON_TZ=Europe/Berlin 52 16 * * *`.
  - `trig_01PfFMZmwbM2JKpfyhtLRmvn`: "StepWise daily deploy: fast-forward main to next",
    `CRON_TZ=Europe/Berlin 27 17 * * *`. It deploys only when CI on `next`'s head is green, and
    stops and asks Yusuf if `main` is not an ancestor of `next`. `.claude/settings.json` allows
    its push (`git push origin origin/next:main`).
- The account's other routines (DSA, Chess TD, Chess Analyzer, Plabs, TPT, product ideas,
  reminders) belong to other projects: never move or change them.
