# StepWise handoff

The rolling handoff for the StepWise cloud sessions (the session-relay skill). Each handover
rewrites this file; it never gets a dated copy. Times are Europe/Berlin.

Last written: Wednesday 4 November 2026, 21:10, when the relay was set up (not a handover).

## What is live

- Nothing is published yet. Yusuf deploys to Netlify by hand (site `stepwise-pisan-labs`, domain
  `stepwise.pisan.me`); sessions never start, publish or roll back a deploy.
- `main` holds 60 of the 108 catalog pages, every one with a concept page, examples, Big-O
  self-test, presets, Python/Java/C++ code tabs, a practice set and tests.
- Site features: per-page URLs, saved and shared examples, embeds, presentation mode, compare
  mode (`/<page>/#compare=<other>`), printable concept pages, practice sets with assignment links.

## Merged so far (4 November)

- Wave 1: stacks, queues, deques and arrays; linked lists and cycle detection; binary tree and
  BST; searching and sorting (10 pages).
- Wave 2: AVL, red-black, splay, treap; hashing (chaining, open addressing, buckets, rehashing,
  LRU cache); B-tree, 2-4 tree, B+ tree, skip list; heaps (binary, leftist, skew, binomial,
  Fibonacci, heap sort); recursion (factorial, reverse, Fibonacci calls, tree vs memo DAG,
  N-Queens, backtracking); dynamic programming (Fibonacci, change, LCS, edit distance,
  knapsack); counting, radix and bucket sort.
- Shared layouts in `src/layouts/`: binary-tree, bars, linked, node-chain, multiway, heap,
  forest, calls, table.

## Branches still unmerged

Local only, in this container, each an agent still running when this was written (all must be
merged before a handover):
- string matching (brute force, KMP, Boyer-Moore, Rabin-Karp) with an alignment layout;
- tries, compressed tries and Huffman coding;
- range queries (prefix sums and sparse tables, Fenwick tree, segment tree);
- shortest paths (Dijkstra, Bellman-Ford, DAG shortest paths, Floyd-Warshall) on the graph
  foundation.

## Next, in order

1. Merge each running agent after its checks, with repeated conformance runs on its pages
   (`npx vitest run src/viz/conformance.test.ts -t "<ids>"`, 10 or more times).
2. More graph pages on the foundation in `src/viz/_graph/` and `src/layouts/graph.ts` (BFS and
   DFS are the reference pages), about four per agent: MST and union-find (Prim, Kruskal,
   disjoint sets); connectivity (components, bipartite, topological sorts, SCC, bridges, grid
   BFS, A*); flow and matching. Then the suffix structures, geometry, foundations and hard
   problems (see `src/viz/catalog.ts` and PLAN.md section 7).
3. Tech debt: unify `src/layouts/node-chain.ts` with `src/layouts/linked.ts`, with screenshots
   before and after.
4. Shared rendering requests from the graph agent: arrow lines colored by role (only active
   and error have line colors now; tree edges get only a green head), and views sized to the
   stage's aspect ratio (DFS draws at about 0.6x on a 1366x768 laptop).
5. Known rough edges from the agents' reports: at 1366x768 the desktop stage is about 305 to 320
   px tall, so tall scenes (merge sort, recursion trees, DP tables, mid-rehash) draw text at
   11 to 13 px; the hash page's "all keys collide" preset could now use the settings presets
   receive instead of its hidden fill operation.

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
- Questions go in the message text, numbered, each with a recommendation; never a blocking
  dialog. With no answer in 15 minutes, take the recommendation and say how to undo it; without
  a recommendation, keep working on other parts and list it as open.
- Always ask first and wait for a yes before: writing production data, deploying (Yusuf
  deploys by hand), spending money or using an API key (use the local `claude` CLI), deleting
  what cannot be restored, rotating secrets, rewriting shared history, publishing outside the
  session.
- Concept pages are written in Yusuf's voice: invoke `anthropic-skills:write-like-pisan` first.
- Agents: about four at a time, each in its own worktree with its own `E2E_PORT` (ports 4191 to
  4201 have been used), briefed like the wave 2 briefs (definition of done, no shared-file
  edits, practice sets, the CI-font rule, `git merge main` allowed, do not push). The lead
  reviews screenshots, merges with `--no-ff`, runs the conformance check 10 or more times on new
  pages (random scripts found real bugs twice), then the full suite, then pushes.
- The 5-hour usage limit pauses everything every few hours; resume agents with SendMessage after
  it resets.

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
| Merge rule | `npm run lint` passes, then push `main`; CI runs on the push |
| Project rule | never hand over while subagents are running |

### Scheduling

- This session: `session_01JyJzMV9R79kmMm2TxMzCD9` (lineage depth 0, limit 8). It is the first
  session; there is no previous one.
- Routines aimed at it:
  - `trig_01YFFf7haBUVw55QnJE6zbfH`: StepWise hourly status report, `46 * * * *`.
  - `trig_019edEXqKvVwcMM1CsPVQpUD`: StepWise handoff check, `CRON_TZ=Europe/Berlin 56 15 * * *`.
  - `trig_014pSjnKeCWEgQXUWgZECJGR`: StepWise daily handoff (session start),
    `CRON_TZ=Europe/Berlin 52 16 * * *`.
- The account's other routines (DSA, TPT, product ideas, reminders) belong to other projects:
  never move or change them.
