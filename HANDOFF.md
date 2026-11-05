# StepWise handoff

The rolling handoff for the StepWise cloud sessions (the session-relay skill). Each handover
rewrites this file; it never gets a dated copy. Times are Europe/Berlin.

Last written: Thursday 5 November 2026, about 06:45, for the first handover.

## What is live

- Nothing is published yet. Yusuf deploys to Netlify by hand (site `stepwise-pisan-labs`, domain
  `stepwise.pisan.me`); sessions never start, publish or roll back a deploy.
- `main` holds 74 of the 108 catalog pages. Every one has a concept page, curated examples, a
  Big-O self-test, presets, Python/Java/C++ code tabs, a practice set and tests.
- Site features: per-page URLs, saved and shared examples, embeds, presentation mode, compare
  mode (`/<page>/#compare=<other>`), printable concept pages, practice sets with assignment links.
- CI (`.github/workflows/ci.yml`) runs on every push to `main`. Runs 34 to 36 passed (the last at
  06:24 Thursday). Runs 37 and 38, the first to include the trie and Huffman merge, were still
  running when this was written: check them first.

## Merged since the session started (Wednesday 4 and Thursday 5 November)

- Wed 09:13 to 14:50, wave 1 (23 pages): binary tree and BST; linked lists and cycle detection;
  stacks, queues, deques and arrays; searching and sorting.
- Wed 15:06 to 21:00, wave 2: AVL, red-black, splay, treap; hashing and the LRU cache; B-tree,
  2-4 tree, B+ tree, skip list; recursion; heaps and heap sort; dynamic programming, counting,
  radix and bucket sort.
- Wed 21:41 to Thu 06:08, wave 3: graph foundation (graph representations, BFS, DFS); string
  matching (brute force, KMP, Boyer-Moore, Rabin-Karp); shortest paths (Dijkstra, Bellman-Ford,
  DAG shortest paths, Floyd-Warshall); range queries (prefix sums and sparse tables, Fenwick tree,
  segment tree); trie, compressed trie, Huffman coding.
- Lead features and fixes: practice sets, presentation mode, compare mode, printable concept
  pages, CI font fixes, operation queueing during playback, seed mixing, address-sync race fix.
- Shared layouts in `src/layouts/`: binary-tree, bars, circular-array, linked, node-chain,
  multiway, heap, forest, calls, table, graph, align, columns, trie. Graph helpers in
  `src/viz/_graph/`.

## Branches still unmerged

None. Every agent branch (`worktree-agent-*`, local only) is merged into `main`.

## Next, in order

1. Wave 4, the 34 pages still in `src/viz/catalog.ts`, about three or four per agent, each
   briefed like the wave 3 briefs (in this session's history; copy their structure: read first,
   setup with its own `E2E_PORT`, the assignment, "every page also needs", rules, final report):
   - MST and union-find: `prim`, `kruskal`, `disjoint-sets` (on `src/viz/_graph/`, `load` and
     `run`, so compare mode pairs Prim with Kruskal);
   - connectivity: `connected-components`, `bipartite`, `topo-indegree`, `topo-dfs`, `scc`,
     `bridges`;
   - grids: `grid-bfs`, `a-star` (a grid layout; N-Queens has a board in its own folder);
   - flow and matching: `max-flow`, `bipartite-matching`, `min-cost-flow`, `weighted-matching`,
     `general-matching`, `two-sat`;
   - geometry: `convex-hull`, `polygon`, `rotate-scale-2d`, `rotate-translate-2d`,
     `coordinates-2d`, `rotate-scale-3d`, `coordinates-3d`;
   - foundations: `memory-model`, `big-o-lab`, `master-theorem` (can reuse
     `src/layouts/calls.ts`), `bitmask`;
   - suffix structures: `suffix-array`, `suffix-tree`;
   - hard problems: `np-reductions`, `tsp`, `vertex-cover`, `steiner-tree`.
2. Shared rendering requests from the agents:
   - arrow lines colored by role (only active and error have line colors; tree edges get only a
     green head);
   - views sized to the stage's aspect ratio. At 1366x768 the desktop stage is about 305 px tall,
     so tall scenes (DFS, merge sort, deep tries, DP tables) draw text at 10 to 13 px;
   - the wider input for long inputs pushes buttons to a second row on some pages (the
     Fenwick tree and segment tree pages moved Build under More operations);
   - a three-value button's error reads "needs l and r and an amount";
   - graph pages start on their own sample graphs, so compare mode across families starts on
     different graphs until Load;
   - `src/viz/_paths/overlap.ts` (a label-overlap checker) could become a shared test.
3. Tech debt: unify `src/layouts/node-chain.ts` with `src/layouts/linked.ts`, with screenshots
   before and after.
4. The "All colliding keys" preset on the four hashing pages (hash-chaining, hash-open,
   hash-buckets, hash-rehash) uses a hidden `fill` operation on each page; presets now receive
   the settings (`Preset.make` in `src/engine/types.ts`), so it could become plain inserts.

## Waiting on Yusuf

Nothing open.

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
  4205 have been used; start new ones at 4206), told not to edit shared files, to add practice
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

- Previous session: `session_01JyJzMV9R79kmMm2TxMzCD9` (lineage depth 0, limit 8). It started
  the relay on Wednesday 4 November.
- Routines aimed at it, to move at takeover:
  - `trig_01YFFf7haBUVw55QnJE6zbfH`: StepWise hourly status report, `46 * * * *`.
  - `trig_019edEXqKvVwcMM1CsPVQpUD`: StepWise handoff check, `CRON_TZ=Europe/Berlin 56 15 * * *`.
  - `trig_014pSjnKeCWEgQXUWgZECJGR`: StepWise daily handoff (session start),
    `CRON_TZ=Europe/Berlin 52 16 * * *`.
- The account's other routines (DSA, TPT, product ideas, reminders) belong to other projects:
  never move or change them.
