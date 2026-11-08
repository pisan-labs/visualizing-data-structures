# StepWise: Plan

v2, 2026-11-04. **Status:** Phase 0 and Phase 1 (Stack, array) are done and green in CI.

v2 adds:
- what we learned from VisuAlgo, csvistool and Coddy (3.3);
- new teaching features (4.7);
- a proposed URL change (5.7) and code testing (5.8);
- a parallel build in waves (7);
- an expanded catalog (Appendix B).

Questions waiting for an answer are in section 12. Under the standing rule, if there is no answer
within 15 minutes, the recommendation goes ahead.

---

## 1. Goal

StepWise (<https://stepwise.pisan.me>) is our own set of interactive data structure and
algorithm visualizations for university courses. The Galles/Lucet site
(<https://cmps-people.ok.ubc.ca/ylucet/DS/Algorithms.html>) sets the baseline coverage: 50
pages, Appendix A. The catalog grows from there to everything in Appendix B.

We aim to beat every site we surveyed on six things:

| Area | Target |
|---|---|
| Phones | Every page works on a phone in portrait |
| Access | Keyboard and screen-reader access, axe-clean |
| History | Stepping back through the whole session, not just the last operation |
| Explanation | Narration, synced pseudocode and live variables at every step |
| Saving | Saving and sharing, step position included |
| License | Open: code under MIT, text under CC BY |

## 2. Non-goals (v1)

- Accounts or server-side storage. Saving works without a server (4.3).
- LMS grade passback (LTI). Embedding in Canvas is in scope.
- Copying code, text, examples or designs from any site we looked at.
- Old browsers.
- Analytics, tracking, beacons, tag managers or third-party CDNs.
- Translations, for now (question 12.6). UI strings stay in one module so this stays possible.
- Running code that learners type (question 12.7).
- Joke algorithms (bogo sort and friends) in the main catalog.

## 3. What other sites taught us

### 3.1 Galles/Lucet, the original reference

50 pages, all loading without errors on 2026-11-04 (Appendix A). Worth keeping:
- step back across the whole session;
- variant switches (null leaves, null path lengths, B-tree degree, union-find options, probe types);
- three views of one graph;
- recursive vs memoized vs table DP;
- typed coin flips for skip lists.

### 3.2 Problems Phase 1 already fixed

- **Logic mixed with drawing.** Drawing commands at pixel positions are replaced by snapshot steps and shared layouts.
- **Ordering.** Numbers no longer sort as strings ("-2" before "-3").
- **Fixed canvas.** A 1000×500 canvas is replaced by a responsive layout.
- **Explanation.** Narration and pseudocode are added.
- **Input.** Bulk and random input are added.
- **Saving.** Work can now be saved and shared.

### 3.3 VisuAlgo, csvistool and Coddy (surveyed 2026-11-04)

Full notes are in the session scratchpad. The Coddy pages sit behind a bot check, which we did
not try to get past, so its page details come from search-engine summaries. Its topic list was
verified from Coddy's sitemap.

| | VisuAlgo (NUS) | csvistool (Georgia Tech CS 1332) | Coddy | StepWise |
|---|---|---|---|---|
| Coverage | 26 modules, deep on algorithms (flow, matching, suffix structures, range trees, geometry, TSP, NP reductions) | 47 pages following a Java DS&A syllabus | 29 introductory topics | Appendix B, about 100 planned |
| Phone | Portrait blocked; landscape lacks play buttons | Drawings clip or vanish at 390 px | Not verified | Works at 375 px, tested in CI |
| Keyboard and screen reader | Controls not focusable, no ARIA | 6 axe violations on one page; narration drawn on the canvas | Not verified | axe-clean in 3 themes; narration announced |
| History | Last operation only | Step back across the session; no scrubber | Play and step only | Whole session, scrubber, detail levels |
| Explanation | Narration per frame and synced pseudocode (sometimes coarse); lecture slides that drive the drawing | Thin narration; pseudocode on 31 of 47 pages in plain and formal versions; Big-O tables with hidden answers | Article, static trace table, code in 5 languages | Narration, synced pseudocode and variables; concept page |
| Practice | Seeded quizzes; answer by clicking the drawing | Big-O answers revealed on click | Inside gated courses | Planned (4.7) |
| Saving and sharing | URL parameters; Share on some pages only; step not saved | Incoming URL parameters only | None found | Links with the step, browser library, files, embed |
| Themes | None | Dark page, but the drawing stays white | Unknown | Light, dark, high contrast |
| Openness | Closed; forks banned | BSD; engine derived from Galles | Closed; reuse forbidden | MIT code, CC BY text |

**Ideas we take, as ideas only. No material is reused.**
- **From VisuAlgo:**
  - lessons whose buttons drive the live drawing, with a deep link per section;
  - seeded practice answered by clicking the drawing;
  - "killer" inputs that make worst cases concrete;
  - graph text input in three formats with layout templates;
  - heap building with best and worst inputs;
  - visible tombstones in hash tables;
  - BST extras: predecessor/successor, select/rank, shape presets;
  - recursion tree vs memoized DAG;
  - a Master theorem tree.
- **From csvistool:**
  - Big-O self-test tables with hidden answers, plus a reason and an example for each case;
  - plain-English and formal pseudocode;
  - pseudocode that follows the settings (theirs does not);
  - graph state panels;
  - string matching shown as one row per alignment;
  - many textbook-variant toggles;
  - building a state from text with validation;
  - readable URL parameters;
  - presets on every page;
  - catalog search and related links;
  - a feedback link.
- **From Coddy:**
  - a live trace table, which we can generate from our steps;
  - real code in Python, Java and C++ (we will test ours);
  - pointer and memory views;
  - "when to use / when to avoid" and failure cases on concept pages;
  - richer embed options;
  - "build the answer" exercises;
  - assignment links.

**What we avoid:**
- Blocking phones, or laying drawings out at fixed pixel positions.
- Controls that aren't focusable; meaning carried by color alone.
- Overlays that cover the drawing; a canvas that scrolls by itself.
- Narration only as a canvas label.
- Silently accepting or truncating bad input; silently changing the learner's graph.
- Answers hidden behind accounts.
- Stub pages, placeholder text, or template tokens leaking into narration.
- Examples named after textbook figure numbers.
- Colors that mean different things on different pages.
- Running JavaScript that learners type.
- Inbound-only URL state; a last-operation-only timeline; coarse pseudocode.
- Untested code in several languages.
- Duplicate pages per search keyword.
- Bot walls, analytics, ads, accounts, upsells.

## 4. Features

Items marked ✔ are already built.

### 4.1 Core experience
- ✔ Timeline over the whole session: play/pause, step, jump between operations, scrubber, speed.
- ✔ Detail levels: milestones, normal, every detail.
- ✔ History with jump and undo.
- ✔ Keyboard and clicker shortcuts.
- **To add:**
  - `-` and `+` change the speed;
  - counters (comparisons, swaps, probes, rotations) shown as variables;
  - readouts such as N and tree height;
  - invariant overlays.

### 4.2 Explanation
- ✔ Narration, highlighted pseudocode, variables panel, concept page.
- Pseudocode and lessons gain more in v2 (4.7).

### 4.3 Saving and sharing
- ✔ Share links that include the step.
- ✔ Browser library, JSON files, embed mode, curated examples.
- **To add:**
  - **Readable URL parameters** next to the compressed code, for example `?ops=insert:50,30,70;delete:50&mode=avl`. Instructors can write these by hand.
  - **Embed options:** theme, which panels show, starting step, autoplay, minimal or full controls.

### 4.4 Input
- ✔ Bulk entry and a random value.
- **To add:**
  - **Presets on every page:** random, sorted, reverse, nearly sorted, many duplicates, skewed, balanced, and a best and worst case where one exists.
  - **Build a state from text with validation.** Examples: a level-order tree, B-tree nodes, an edge list. Invalid input leaves the current state alone and says why.
  - **Graph editor and graph text input:**
    - formats: edge list, adjacency list, adjacency matrix, with 0- or 1-based numbering;
    - layout templates: DAG layers, bipartite, tree, grid, flow;
    - live readouts: V, E, connected, tree, DAG, bipartite.
  - **Typed operation scripts,** for example `insert 50 30 70; delete 50`. They convert to and from the example format.

### 4.5 Responsive and accessible
- ✔ Phone through projector, three themes, keyboard, reduced motion, announced narration.
- ✔ axe checks in CI on every page.
- **To add:**
  - a shape or label in addition to color wherever meaning is encoded (edge types, visited states);
  - one meaning per color across the whole site.

### 4.6 Instructor features
- ✔ Embed in Canvas.
- ✔ Presentation mode (2026-11-04).
- ✔ Compare mode (2026-11-04): `/<page>/#compare=<other>` runs the same operations on two pages, or on one page with two settings, side by side. Playback moves by operation; a side that finishes first waits.
- ✔ Assignment links (see 4.7).
- ✔ Catalog pathways ("Data structures", "Algorithms").
- ✔ Printable concept pages (2026-11-04): Print on the Learn tab, or the browser's print, gives the title, the explanation and its checks in light colors, without the drawing or controls.

### 4.7 New teaching features in v2

| Feature | What it is | When |
|---|---|---|
| **Lessons** | Concept-page sections with "Show me" buttons that load an example and play it on the live drawing, then hand control back. Each section has a deep link (`/bst/#lesson=delete`). They live in the side panel, never in an overlay. | Framework in wave 1 (lead); content as part of each page's definition of done |
| **Big-O self-test** | A table per page of best, average and worst cases per operation. Answers are hidden until clicked; each has a one-line reason and a one-click example. | Framework now; data from each page |
| **Concept checks** | One or two multiple-choice questions per concept section, with the explanation shown after answering. | With lessons |
| **Practice sets** | Generated from a seed in the browser, graded in the browser. Answer by clicking nodes or cells in order (with undo), typing a number, or choosing an option. The link carries the seed, so instructors can hand out the same set. Includes "build the answer" exercises. | Framework in wave 3; questions per page |
| **Trace table** | One row per milestone step, built from the step variables. Click a row to jump; export as CSV or Markdown. | Framework now (generic, no work per page) |
| **Pseudocode v2** | Formal and plain-English versions share line ids; the text follows the settings; lines are fine-grained. | Type in place now; pages fill it in |
| **Code tabs** | Static Python, Java and C++ for each page, run in CI against our model (5.8). Not line-synced; pseudocode stays the synced panel. | Question 12.1 |
| **Pointer and memory views** | Named pointers (head, tail, cur, prev) as labeled arrows, an explicit null, unreachable nodes marked, call frames with their local variables. | Linked lists (wave 1) and recursion (wave 2) |
| **Graph state panels** | Visited set, frontier (queue, stack or priority queue), distance and parent tables, call stack vs explicit stack. | Graphs (wave 3) |
| **Precondition checks** | Explain why an algorithm cannot run as asked (Dijkstra with a negative edge, MST on a disconnected graph) instead of silently changing the input. | With each page |
| **Catalog** | Search, tags, pathways, related links on every page. Counts are generated, never written by hand. | Wave 1 (lead) |
| **Feedback link** | Opens a GitHub issue prefilled with the page id and the current example link. | Wave 1 (lead) |

## 5. Architecture

### 5.1 to 5.5: as built in Phase 1

Each operation is a TypeScript generator that yields immutable steps. A step holds:
- the state;
- marks (element id plus a role);
- narration;
- pseudocode line ids;
- variables;
- a detail level;
- an optional quiz prompt.

Views are pure functions from a step to a scene of shapes with stable ids. The renderer blends
scenes by id and draws SVG. The stack is Svelte 5, TypeScript, Vite, Vitest, fast-check,
Playwright and axe. See `CLAUDE.md`.

### 5.6 Shared layouts (by wave)

| Layout | First used | Reused by |
|---|---|---|
| Array cells | Stack (array) ✔ | Queues, hashing, sorts, DP tables |
| Bars with counters | Sorting (wave 1) | Searching, heap sort |
| Linked nodes with named pointers | Lists (wave 1) | Stacks, queues, chaining, skip list, LRU |
| Binary tree (tidy layout) | BST (wave 1) | AVL, red-black, splay, treap, heaps, Huffman, recursion trees |
| Multiway tree and forest | B-tree (wave 2) | 2-4 tree, B+ tree, trie, binomial, Fibonacci, union-find |
| Call stack and recursion tree | Recursion (wave 2) | DP, backtracking, Master theorem |
| Graph, plus adjacency list and matrix | Graphs (wave 3) | Flow, matching, MST, shortest paths |
| String alignment rows | Strings (wave 3) | Suffix structures |
| Grid | Grid BFS (wave 3) | N-Queens |
| Plane geometry and 3D | Geometry (wave 4) | Convex hull, polygons, transforms |

### 5.7 URL scheme v2 (question 12.2)

Today every route is a hash: `#/bst?ex=...`. The proposal:
- **One real, pre-rendered page per visualization:** `/bst/`. It carries its own title, description and preview image, plus the concept text for search engines.
- **The hash keeps only the state:** `/bst/#ex=...&step=...`.

**Why:**
- Link previews in Canvas, Discord and email show the right page.
- Search engines can index each page.
- Netlify serves the folders without rewrite rules.
- It is cheap now and expensive once links are out in the world.

Old `#/bst` links keep working through a redirect.

### 5.8 Testing the code tabs (if 12.1 is yes)

Each visualization gets `code/python`, `code/java` and `code/cpp`. Each implements the same
operations and includes a small driver that reads operations on standard input and prints
results. A Vitest suite does the checking:
1. it generates random operation scripts with fast-check;
2. it runs them through our TypeScript model to get the expected output;
3. it runs the three programs on the same scripts;
4. it compares the outputs.

CI already has Python, Java and a C++ compiler.

## 6. Quality

- **Unit tests on every page:**
  - comparison against a reference implementation;
  - invariants on every step;
  - property-based tests.
- **Shared conformance tests:**
  - narration on every step;
  - valid line ids;
  - marks that point at shapes;
  - unique shape ids;
  - curated examples that replay;
  - concept-page links to examples that exist;
  - the folder name matches the id;
  - every page is listed in the catalog.

  New: no unfilled `{...}` tokens in narration, and no "TODO", "???" or "future work" in user-facing text.
- **Browser tests:** every operation of every page runs on desktop and phone with an axe scan (`tests/e2e/all-vizzes.spec.ts`); page-specific tests sit on top.
- **CI** runs everything on every push. Netlify builds `main` and pull-request previews; publishing is locked until Yusuf releases it.

## 7. Roadmap: building in waves

Agents work in parallel, one family each, each in its own git worktree and branch. The lead
(Claude in the main session) works alongside them:
- writes each brief;
- builds the shared frameworks;
- reviews every branch, runs all tests, looks at screenshots, and merges.

There are four or five agents per wave, and an hourly report goes to Yusuf.

| Wave | Parallel agents (families) | Lead in the same wave |
|---|---|---|
| ✔ 0 | Phase 0 setup, Phase 1 Stack (array) | |
| **1** | **A. Trees I:** general binary tree (build from level order, four traversals showing the stack or queue), BST (insert, delete with successor/predecessor toggle, search, min/max, predecessor/successor, select/rank, lower bound, shape presets, duplicate policy, key-value mode, N/height readout)<br>**B. Lists:** singly, doubly and circular linked lists with named pointers; Floyd cycle detection<br>**C. Stacks, queues, deques, arrays:** stack (linked list), queue (circular array, linked list), deque (circular array, linked list), dynamic array (doubling, amortized cost), sorted vs unsorted array<br>**D. Sorting and searching:** linear search, binary search (variants), bubble, cocktail shaker, selection, insertion, shell, merge, quicksort (pivot rules, Lomuto/Hoare), quickselect | Big-O self-test, presets, plain-English pseudocode, trace table, lesson framework, URL scheme v2, catalog search and pathways, feedback link, code-test harness (if 12.1) |
| **2** | **E. Balanced and self-adjusting trees:** AVL, red-black (null-leaf toggle), splay, treap<br>**F. Multiway trees:** B-tree (degree, preemptive split), 2-4 tree preset, B+ tree, skip list<br>**G. Heaps:** binary heap (array and tree, two build methods, update-key, delete), heap sort, leftist, skew, binomial, Fibonacci<br>**H. Hashing and maps:** chaining, open addressing (linear, quadratic, double; tombstones; load factor), buckets, rehashing, hash functions, key-value mode, LRU cache<br>**I. Recursion and DP:** factorial, reverse, Fibonacci call tree, N-Queens, backtracking, recursion tree vs memo DAG, Fibonacci/change/LCS/edit distance/knapsack tables; counting, radix and bucket sorts | Compare mode; practice-set framework; first lessons; presentation mode |
| **3** | **J. Graphs I:** editor and representations, BFS (including grid), DFS (recursive and explicit stack), components, bipartite check, topological sort (both), SCC (Kosaraju, Tarjan), cut vertices and bridges<br>**K. Graphs II:** Dijkstra (decrease-key vs lazy), Bellman-Ford (with early exit and SPFA), DAG shortest paths, A*, Floyd-Warshall, Prim, Kruskal, union-find<br>**L. Strings:** brute force, KMP, Boyer-Moore (Galil), Rabin-Karp, trie, compressed trie, Huffman<br>**M. Foundations:** memory model, Big-O growth lab, recurrences and the Master theorem | Practice sets for waves 1–2; printable pages |
| **4** | **N. Flow and matching:** Ford-Fulkerson/Edmonds-Karp with residual graph and min cut, Dinic, min-cost flow, bipartite matching, Hopcroft-Karp, Hungarian, blossom<br>**O. Geometry:** convex hull (Graham, Andrew, Jarvis), polygon algorithms, 2D and 3D transforms<br>**P. Range queries and suffixes:** prefix sums, difference array, sparse table, Fenwick tree, segment tree (lazy), suffix array with LCP, suffix tree<br>**Q. Hard problems:** NP-completeness reduction map, TSP (exact vs approximate), 2-SAT, vertex cover, Steiner tree, bitmask subsets | Polish, lessons for remaining pages |

The order follows the shared layouts: each wave reuses what the previous one built. Advanced
items (Appendix B) come after the core of their family.

## 8. Definition of done (per visualization, v2)

1. **Operations** are step generators. Variant toggles cover textbook differences, with CLRS
   as the default, and the pseudocode follows the settings.
2. **Unit tests:** comparison against a reference implementation, invariants on every step, and
   property-based tests. All shared checks pass.
3. **Steps:** every step is narrated and mapped to fine-grained pseudocode lines, in formal and
   plain-English versions. Counters and readouts appear as variables.
4. **Concept page** in Yusuf's voice:
   - the idea, and operations with their costs;
   - how it works and its variants;
   - when to use it and when to avoid it;
   - failure cases and common mistakes;
   - "try this" links.
5. **Big-O self-test** data, with a reason and an example for each case.
6. **Examples and presets:**
   - at least 3 curated examples, including edge and worst cases;
   - presets that suit the structure;
   - titles name the idea, not a textbook figure.
7. **Code tabs** pass the shared tests (if 12.1).
8. **Browser checks** pass on desktop and phone: keyboard, axe, no horizontal scroll. These run automatically.
9. **Catalog:** listed with tags.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Parallel agents make inconsistent choices | One shared brief, the reference implementation, shared conformance tests, and a lead review of every branch |
| Merge conflicts | One folder per page; the registry finds pages by itself; agents don't touch shared files without saying so |
| Explanations for about 100 pages are uneven | A concept-page template, the voice skill, and lead spot checks; Yusuf edits as he likes |
| Tree and graph layouts jump during animation | Stable ids, tidy-tree layout, screenshots reviewed before merge |
| Code tabs drift from the model | Code is run against the model on every push |
| Scope keeps growing | Waves with clear lists; advanced items come after the core |
| Phone screens are too small for big graphs | Pan, zoom, fit, smaller presets on phones |
| Saved links break when a model changes | Format version field; curated examples replayed in CI |

## 10. Licensing and credit

We write everything ourselves:
- **Code:** MIT.
- **Explanations:** CC BY 4.0.

What the surveyed sites allow:
- **VisuAlgo and Coddy:** their terms forbid reuse. We took ideas only.
- **csvistool and Galles/Lucet:** BSD-licensed. We still don't copy them.

The About page credits Galles and Lucet as inspiration.

## 11. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Audience | University data structures and algorithms courses |
| 2 | Code panel | Synced pseudocode in formal and plain-English versions, plus static Python, Java and C++ tabs tested in CI against the model (12.1) |
| 3 | Saving | No server in v1 |
| 4 | UI framework | Svelte 5; no student contributors expected |
| 5 | Hosting | Netlify site `stepwise-pisan-labs`, final domain `stepwise.pisan.me`; public repo; publishing locked until Yusuf releases it |
| 6 | License | MIT code, CC BY 4.0 text |
| 7 | Slices | Stack done; BST is in wave 1 |
| 8 | Pace | As fast as the quota allows; parallel agents; hourly reports; 15-minute rule for decisions |
| 9 | Geometry | In scope, last |
| 10 | Additions | Everything in Appendix B, and possibly more |
| 11 | Quiz mode | Big-O self-tests and concept checks with every page; practice-set framework in wave 2 (12.4) |
| 12 | Conventions | Toggles wherever textbooks differ; CLRS default |
| 13 | Analytics | None |
| 14 | Name and logo | **StepWise** (capital W); logo A, a staircase of array cells |
| 15 | Canvas embed | Yes |
| 16 | Explanations | Claude writes in Yusuf's voice; no approval step |
| 17 | URLs | One pre-rendered page per visualization (`/bst/`); state in the hash; old `#/` links redirect (12.2) |
| 18 | Lessons | Concept sections with "Show me" buttons that drive the drawing, each with a deep link; framework in wave 1 (12.3) |
| 19 | Advanced topics | All in the catalog, marked advanced, built in wave 4; no joke sorts (12.5) |
| 20 | Translations | English only for now; UI strings in one module (12.6) |
| 21 | Learners' own code | Not traced; typed operation scripts instead (12.7) |
| 22 | Parallelism | 4 agents per wave; the lead reviews and merges (12.8) |
| 23 | Pathways | "Data structures" and "Algorithms" (12.9) |
| 24 | Feedback | Prefilled GitHub issue link on every page; Issues turned on by Yusuf (12.10) |
| 25 | Time zone | UTC+1 assumed for reports (12.11) |
| 26 | Deploys | Work goes to `dev` (CI runs there); `main` is what Netlify publishes and moves only when Yusuf says "deploy" (`git push origin dev:main`). Each production deploy costs 15 Netlify credits. Replaced by 27 |
| 27 | Branches (later on 2026-11-04) | All work goes to `main`, as in Yusuf's other projects; `dev` is retired. Yusuf deploys to Netlify by hand for now |
| 28 | Small drawings on laptops (2026-11-07) | Option 3: a taller desktop stage first (Options in the side column, back link on the title row), then views that lay out for the stage's size |
| 29 | Automata pathway (2026-11-07, default taken, confirmed by Yusuf) | A third course pathway, "Theory of computation" (13.8 question 1) |
| 30 | Automata conventions (2026-11-07, default taken, confirmed by Yusuf) | Sipser by default, with toggles where books differ (13.2) |
| 31 | Defining machines (2026-11-07, default taken, confirmed by Yusuf) | A typed one-line format (13.3); mouse drawing maybe later |
| 32 | Regex syntax (2026-11-07, default taken, confirmed by Yusuf) | Formal regular expressions only; a regex-engine comparison page in wave 5C |
| 33 | Automata scope (2026-11-07, default taken, confirmed by Yusuf) | Waves 5A, 5B and 5C as in 13.5; agents start 5A after the stage work is committed |
| 34 | Deploys (2026-11-07, replaces 27) | Work goes to `next` (CI runs there). Every push to `main` publishes (15 Netlify credits), so `main` only fast-forwards to `next`: daily at 17:27 Europe/Berlin, or when Yusuf says "deploy" |
| 35 | Amortized analysis (2026-11-08, default taken) | Its own page (dynamic array and binary counter, aggregate, accounting and potential), linked from the dynamic array page |
| 36 | Doubling experiments (2026-11-08, default taken) | Deterministic step counts, with an optional noise setting to show why real timings need care |
| 37 | Big-O pages (2026-11-08, default taken) | The four wave 6 pages go in Foundations, after the growth lab |

## 12. Questions asked 2026-11-04

No answers arrived within 15 minutes, so every recommendation below went ahead at 06:42 UTC
(decisions 2, 11 and 17–25 in section 11). Any of them can still be reversed.

1. **Code tabs.** Should each page also show static Python, Java and C++, tested in CI against
   our model? Pseudocode would stay the only panel synced with the animation.
   *Recommendation: yes, all three languages, with plain-English pseudocode as well.*
2. **URLs.** Switch to one pre-rendered page per visualization (`/bst/`), with the state in
   the hash (5.7)? *Recommendation: yes, now, before links spread.*
3. **Lessons.** Concept-page sections with "Show me" buttons that drive the live drawing,
   each with its own link. *Recommendation: yes. I build the framework in wave 1, and every page
   gets lessons as part of its definition of done.*
4. **Practice.** When should seeded, browser-graded practice sets and assignment links come?
   *Recommendation: Big-O self-tests and concept checks with each page from now on; the
   practice-set framework moves up to wave 2 (it was after Phase 5).*
5. **Advanced topics.** Flow, matching, suffix structures, Fenwick and segment trees, 2-SAT,
   TSP, the NP-reduction map, polygons, vertex cover, Steiner tree.
   *Recommendation: all in the catalog, marked advanced, built in wave 4. Leave out joke sorts.*
6. **Translations.** *Recommendation: English only for now, with UI strings kept in one
   module. Revisit if you want another language.*
7. **Tracing students' own code**, as Python Tutor does. *Recommendation: no. Typed operation
   scripts cover "try my own scenario".*
8. **Parallelism.** *Recommendation: 4 agents per wave, as in section 7, with the lead reviewing
   and merging. More agents would make reviews the bottleneck.*
9. **Pathways in the catalog.** *Recommendation: two generic ones, "Data structures" and
   "Algorithms". Say if you want course-specific ones.*
10. **Feedback link.** *Recommendation: yes, a prefilled GitHub issue on the public repo (issues
    must be turned on).*
11. **Time zone.** I assume UTC+1, from your commit timestamp. *Recommendation: confirm or
    correct.*

---

## 13. Wave 5: automata and computability (planned 2026-11-07)

Yusuf asked on 7 November for finite state machines, regular expressions, Turing machines,
the Chomsky hierarchy and related topics. The questions sent with this plan are in 13.8;
answers and defaults taken go in section 11.

### 13.1 What other tools taught us (surveyed 2026-11-07)

We surveyed 12 tools. Their names are listed only as a record of what we looked at; we copy no
design, names, examples or code from any of them.

| Tool | What it models |
|---|---|
| flat-pro | regex to NFA to DFA to minimal DFA |
| noam FSM simulator | DFA, NFA and ε-NFA, with regex conversions |
| explain.software | regex to ε-NFA |
| lotusfa | DFA |
| madebyevan | drawing only |
| Silicon Ladder, binaryvisual | Moore and Mealy machines |
| turingmachine.io, compscitutoring, morphett | Turing machines |
| JFLAP | everything, desktop Java |
| RegExr | practical regular expressions |

What they get right:
- **Typed definitions:** one transition per line (morphett, noam).
- **Runs** that highlight the active state set and the input read so far, and can step back
  (noam, morphett).
- **Batch tests:** strings with the expected accept or reject (JFLAP, RegExr).
- **Guided conversions:**
  - JFLAP lets the learner build the DFA from an NFA and checks it;
  - it also has pumping-lemma games;
  - it shows one card per configuration, with dead branches red and accepting ones green.
- **Many worked examples** with commentary (turingmachine.io, morphett).

What they get wrong, and we avoid:
- conversions that show only the result;
- a "Run" that jumps to the end;
- canvas-only drawings with no text alternative;
- mouse-only editing and `alert()` errors;
- syntax that needs Unicode to type;
- unexplained step caps;
- CDNs, fonts and analytics;
- practical-regex features (backreferences) that are not regular.

### 13.2 Conventions

- **Sipser** is the default text:
  - notation: δ, q0, F, ε;
  - his constructions;
  - a Turing machine with accept and reject states;
  - a tape that is infinite to the right only, the head staying put at the left end.
- Where textbooks differ, a setting picks:
  - the Turing machine tape: one-way (Sipser) or two-way infinite (Hopcroft–Ullman, Linz);
  - moves L/R, or L/R/S;
  - a pushdown automaton accepting by final state or by empty stack;
  - regex union written `|` or `+`;
  - the regex to NFA construction: Thompson, or Sipser's union/concatenation/star;
  - DFA minimization by partition refinement or by table filling.
- **Missing moves:** a DFA may leave moves out, and a missing move rejects (Sipser draws such
  DFAs without the dead state). A setting draws the dead state.

### 13.3 Input formats (one line in the input box; `;` separates items)

- **Finite automaton:**
  - Form: `start q0; accept q2 q3; q0 a -> q1; q1 a,b -> q2; q2 eps -> q0`.
  - `->` or `→`; `eps` or `ε`.
  - Without `start`, the start is the first move's state.
  - `states q4` adds a state with no moves.
  - The alphabet is every symbol used in a move, plus any an `alphabet a b` item names (written
    only when needed).
- **Word:** symbols with or without spaces, `ε` (or `eps`) for the empty word.
- **Batch:** `+ab +aabb -ba -eps`, each word with the result it should get. The page runs them
  all and shows a table of expected against actual.
- **Two machines (product construction):** `A | B`, two machines in the automaton format with a
  `|` between them. Differing alphabets are completed with dead states.
- **Machine with output (Mealy and Moore):** Mealy moves `q0 a -> q1 / 1` (or `q0 a/1,b/0 -> q1`);
  Moore outputs `q0 / 0` with plain moves. No accept states; every state needs a move on every
  symbol.
- **Multi-tape Turing machine:** `q0 1,_ -> q1 1,1 R,R` (per tape, comma-separated: symbol read,
  written, move L/R/S). `|` lists symbols read, `-` keeps one, writes may be left out; `#` is
  reserved for the one-tape simulation. Input `101,011` is one word per tape.
- **Regex engines:** `(a|a)*b ; aaaa`: an expression, `;`, then the word (ε or eps for empty); a
  word alone keeps the expression. Grow repeats the word: `(a|a)*b ; a` runs a, aa, ... up to 16
  symbols.
- **Regular expression:**
  - `(a|b)*abb`: letters and digits, `ε`, `∅`, `|`, `*`, `+`, `?` and parentheses;
  - nothing else;
  - with the `+`-is-union setting, `?` stays and `+` means union;
  - `eps` is ε only as a word of its own.
- **Pushdown automaton:** `q0 a, Z -> q1 AZ` (read a, pop Z, push AZ). `eps` may stand for
  any of the three.
- **Grammar:** `S -> aSb | eps; T -> ...`; the first variable is the start. Capitals are
  variables; anything else is a terminal.
- **Turing machine:** `q0 1 -> q1 0 R` (in state q0 reading 1: write 0, move right, go to q1).
  `_` is the blank. The states `accept` and `reject` halt.

Errors name the item and say what is wrong ("q0 ab -> q1": "ab" is not a symbol). The parser
for finite automata is built (`src/viz/_automata/parse.ts`).

### 13.4 Shared pieces

Built on 7 November:
- `src/viz/_automata/automaton.ts`:
  - the model;
  - ε-closure, runs, the subset construction;
  - minimization, a dead state, reachability;
  - property tests against direct definitions.
- `src/viz/_automata/regex.ts`:
  - the regex parser and printer;
  - Thompson's construction, with fragments in build order;
  - a direct matcher used as the test oracle.
- `src/viz/_automata/parse.ts`: the automaton text format.
- `src/layouts/automaton.ts`: state diagrams.
  - Breadth-first layers from the start: across on a wide stage, down on a phone.
  - Accept rings, the start arrow, combined labels.
  - Loops on the freest side; curved pairs; curves around states in the way.
  - Fixed positions for pages that place states themselves.
- Curved arrows in the renderer (`ArrowShape.via`, a quadratic curve that tweens).
- Views receive the stage's size (`view(step, settings, stage)`), so a diagram can run across
  a laptop and down a phone.

Built later on 7 November, when the wave 5A pages were consolidated:
- `src/viz/_automata/page.ts`: the input boxes, batches, one Load operation, the summary
  sentence, one driver protocol for the code tabs (`automatonLines`).
- `src/viz/_automata/panels.ts`: the input tape, the verdict badge, the test table, grids;
  `src/viz/_automata/random.ts`: random machines and words.
- `setText` writes sets as `{q0, q1}`; the conformance check accepts set notation and still
  catches template leftovers.
- `drawAutomaton`: one label placement for every page, badges on the freest side, and options
  `startArrow`, `show` (a growing diagram keeps its final layout), `route` and `around`;
  `layoutFromLayers`. `src/layouts/route.ts` routes arrows around states.
- `src/layouts/tape.ts`: a window that holds still while the touched cells fit, cells left of 0
  for a two-way tape. `src/layouts/trace.ts`: configuration traces (`u q v`, and the pushdown
  automaton's state, input and stack).
- Thompson's construction builds exactly 2m states (R? with two states).
- `src/viz/_turing/`: the Turing machine model. `src/viz/_grammar/`: grammars, Chomsky normal
  form with each stage, CYK, derivation search and the Chomsky level of a grammar.
- `src/viz/_stage/arrange.ts`: picks the arrangement of a page's parts that draws largest on
  the stage (option 3 step 2).

Still to build:
- **A computation tree** for nondeterminism: the NFA's branches, dead ones in red.
- Shared moves recommended by the agents: `_stage/arrange.ts` and the grammar pages'
  `bestPlacement` into `src/layouts`, `_dp/strip.ts` into `src/layouts/table.ts` (with cells
  left out and two-line values), the parse-tree drawer into a layout, wrap options for
  `node-chain`, `align`, `bars` and `columns`, a floor on the `calls.ts` tag size, an "auto"
  arrangement for graph-representations and stack-array.

### 13.5 Pages

Every page meets the definition of done in `CLAUDE.md`:
- operations as generators;
- marks with stable ids;
- pseudocode in formal and plain English;
- Big-O rows;
- presets and at least three examples;
- a concept page with checks, in Yusuf's voice;
- code tabs in Python, Java and C++, with drivers;
- practice;
- property tests;
- e2e.

**Wave 5A, regular languages and Turing machines**

1. **`dfa` DFA run.**
   - **Operations:** Load (the machine), Run (a word), Test (a batch).
   - **Stage:** the diagram, with the current state blue and the arrow just taken highlighted; the input tape under it, with the head and the symbols read greyed; a final accept or reject badge.
   - **Readouts:** δ(q, c) and steps read.
   - **Settings:** draw the dead state; complete or partial DFA.
   - **Examples:**
     - ends in ab;
     - divisible by 3 in binary;
     - even number of a's and b's;
     - a missing move;
     - the empty word.
   - **Big-O:** a run is Θ(n) in the word's length, whatever the word; the table is O(|Q||Σ|).
2. **`nfa` NFA run** (with ε-moves).
   - **Stage:** the active set highlighted, an explicit ε-closure step, and a computation tree (or a table of sets) under the diagram.
   - **Setting:** show the tree, or the set of states only.
   - **Examples:**
     - third symbol from the end is 1;
     - a|b with ε-moves;
     - a branch that dies;
     - ε-loops.
   - **Big-O:** O(n·|Q|²) per word by simulating the sets.
3. **`nfa-to-dfa` subset construction.**
   - **Stage:** one new subset per step: the NFA on one side, the DFA growing on the other, and a table of subsets.
   - **Setting:** reachable subsets only (default) or all 2^|Q|.
   - **Examples:**
     - the 2^n blow-up (n-th symbol from the end);
     - no blow-up;
     - ε-closures.
4. **`dfa-minimization`.**
   - **Settings:** partition refinement (Moore, default) or table filling (Myhill–Nerode pairs). The minimal DFA is drawn at the end.
   - **Stage:** the blocks, colored with the group colors g1 to g8.
   - **Examples:**
     - already minimal;
     - two equivalent states;
     - unreachable states;
     - the blow-up from page 3 shrinking back.
5. **`regex-to-nfa`.**
   - **Settings:** Thompson (default) or Sipser's construction.
   - **Stage:** one fragment per step, children before parents, placed inside their parent (fixed positions). Then a Run on a word.
   - **Examples:**
     - (a|b)*abb;
     - a*b*;
     - nested stars;
     - ε and ∅.
6. **`turing-machine`.**
   - **Operations:** Load, Run, Step.
   - **Stage:** tape, head, state diagram (small) or transition table, and the configuration trace.
   - **Settings:** tape one-way or two-way; moves L/R or L/R/S.
   - **Step cap:** a run stops after 500 steps and says so: "still running: it may never halt. That is the halting problem."
   - **Examples:**
     - 0ⁿ1ⁿ;
     - binary increment;
     - palindromes;
     - copy a string;
     - a machine that loops forever.

**Wave 5B, context-free languages and the hierarchy**

7. **`pda` pushdown automaton run.**
   - **Stage:** the stack (`drawColumn`) and the configuration trace.
   - **Behaviour:** nondeterminism by search, with a cap.
   - **Setting:** accept by final state or by empty stack.
   - **Examples:**
     - aⁿbⁿ;
     - even palindromes;
     - balanced parentheses.
8. **`cfg-derivation`.**
   - **Operations:** leftmost and rightmost derivations, the parse tree growing with each step.
   - **Ambiguity:** two trees for one string.
   - **Examples:**
     - arithmetic expressions with and without precedence;
     - the dangling else.
9. **`cyk`:**
   - convert to Chomsky normal form (shown);
   - then fill the triangle cell by cell (level 3 for each split).
   - **Big-O:** Θ(n³·|G|).
10. **`chomsky-hierarchy`.**
    - **Stage:** four nested regions (regular ⊂ context-free ⊂ context-sensitive ⊂ recursively enumerable); each level has its machine and grammar form.
    - **Operations:**
      - Classify a grammar: the most restrictive level its rules fit;
      - Place a language from a preset list (aⁿbⁿ, aⁿbⁿcⁿ, the halting language), with the reason.
    - The concept page is the main content.

**Wave 5C, conversions and limits**

11. **`dfa-to-regex`:** state elimination through a GNFA (Sipser 1.64), one state removed per step.
12. **`product-construction`:** union, intersection, difference and complement of two DFAs.
13. **`pumping-lemma`:** the regular and context-free games. The learner picks the split or the string; the page plays the other side.
14. **`mealy-moore`:** machines with output, such as sequence detectors. These are digital-logic style and convert both ways.
15. **`multitape-tm`:** two or three tapes; then the simulation on one tape.
16. **`halting-problem`:** diagonalization as a table of machines against inputs, and the contradiction.
17. **`regex-engines`:** backtracking against NFA simulation on (a|a)*b, and why one is exponential.

### 13.6 Catalog

- A new family, "Automata and computability".
- A third course pathway, "Theory of computation" (if 13.8 question 1 is yes).
- The family lists every page above. Wave 5C items are marked advanced.
- The site shows planned items as planned until they merge.

### 13.7 Order of work

1. The shared kit and the state-diagram layout (done).
2. Wave 5A with four agents:
   - `dfa` with `nfa`;
   - `nfa-to-dfa` with `dfa-minimization`;
   - `regex-to-nfa`;
   - `turing-machine` with the tape layout.
3. The lead builds the tape layout's first form for the `dfa` agent to reuse, then reviews and merges.
4. Wave 5B, then 5C, the same way.
5. In parallel, the lead keeps fitting the remaining small pages to the stage (option 3 of the 7 November decision).

### 13.8 Questions asked 2026-11-07

1. A third course pathway, "Theory of computation"? Recommend yes.
2. Sipser as the default, with toggles where books differ? Recommend yes.
3. A typed machine format (13.3), with mouse drawing later if wanted? Recommend typed now.
4. Formal regular expressions only, with a regex-engine comparison page in 5C? Recommend yes.
5. Waves 5A, 5B and 5C as listed? Recommend yes.
6. Commit the stage work, then start 5A with agents, and keep fitting pages to the stage
   between merges? Recommend yes.

## 14. Wave 6: understanding Big-O (planned 2026-11-08)

Yusuf asked (8 November): are there exercises and visualizations for Big-O understanding;
research and implement what is found.

### 14.1 What exists

- On StepWise: the Big-O growth lab (seven functions side by side, doubling n, linear or log
  bars, time at a given speed), recurrences and the Master theorem, the dynamic array (amortized
  O(1) explained in prose only), and a Big-O self-test on every page.
- Elsewhere (surveyed 2026-11-08):
  - growth visualizers comparing O(1) to O(n²) on a log scale (csvisualizer.netlify.app), and an
    interactive guide where readers edit code and watch operation counts (Bondaryev, dev.to);
  - GeoGebra worksheets comparing two functions; none found shows c and n₀ as handles;
  - loop-pattern practice questions (Educative: nested, sequential, dependent, halving and
    doubling loops, early breaks); answer keys found online are sometimes wrong;
  - amortized analysis demos with the potential Φ = 2n − capacity, the accounting method and a
    binary counter (instantcube, Axiom Academy, a VSB-TUO teaching server; Cornell CS 3110);
  - Sedgewick and Wayne's doubling test: T(n) = a·nᵇ, b ≈ log₂ of the time ratio, and a
    log-log plot whose slope is b; it cannot see log factors.

### 14.2 Pages (Foundations family)

1. **`big-o-definition`:** f(n) against c·g(n), with c and n₀ as the handles: find witnesses,
   see where the inequality fails, Ω flips it, Θ sandwiches f between c₁·g and c₂·g; the ratio
   f/g settling (the limit test). Practice: is f = O(g)? find n₀ for this c.
2. **`loop-counting`:** code patterns (single, nested, triangular, halving, doubling inner,
   sequential, √n, early exit) run for a chosen n; the iteration space lit cell by cell, the
   exact count T(n), and the Big-O it simplifies to. Practice: count for this n; Big-O of this
   code.
3. **`doubling-experiment`:** run counted algorithms at n, 2n, 4n, ...; a table of T(n), the
   ratio and b = log₂ ratio; a log-log plot whose slope is b; where it misleads (n log n looks
   like n^1.1; noise in real timings).
4. **`amortized-analysis`:** the three methods (aggregate, accounting with coins, potential)
   on the dynamic array (doubling against growing by a constant) and the binary counter; actual
   against amortized cost per operation.

### 14.3 Order

Two agents at a time: `big-o-definition` and `loop-counting` first, then
`doubling-experiment` and `amortized-analysis`. Then the shared-code cleanup (HANDOFF.md, next in
order).

## 15. Shared-code cleanup (started 2026-11-08)

Yusuf asked (8 November), once the Big-O pages were done: start the shared-code search and the
code cleanup. The search (8 November) covered 929 source and test files, about 227 000 lines.

### 15.1 Debt register

Scored 1 to 5: interest (ongoing cost), principal (cost to fix), risk (of a wrong page or a red
CI), leverage (what fixing it unblocks). Priority = interest + risk + leverage − principal.

| # | Item | I | P | R | L | Priority | Where |
|---|---|---|---|---|---|---|---|
| 1 | Done 8 November: `settled()` could return between two steps of a playback (nothing animates during the hold), so a count taken then is of the wrong step; two agents met it | 3 | 2 | 3 | 3 | 7 | `tests/e2e/helpers.ts` |
| 2 | Done 8 November: the zoom-button size was copied in four places (`graph.ts` 118×42, `circular-array.ts` 34 of 362, `_grammar/draw.ts` 34, `loop-counting/view.ts`); on phones `Stage.svelte` already gives the buttons a strip of their own, so the phone copies may compensate twice | 2 | 1 | 3 | 2 | 6 | `src/ui/Stage.svelte`, `src/layouts/` |
| 3 | Done 8 November: two `textWidth` functions (`layouts/graph.ts`, `layouts/bars.ts`) and local estimators in three pages; CI's DejaVu font is wider than either assumes | 3 | 2 | 2 | 3 | 6 | `src/layouts/`, pumping-lemma, chomsky-hierarchy, big-o-definition |
| 5 | Done 8 November (two were text wrappers): six word-wrap helpers | 2 | 2 | 1 | 3 | 4 | `_automata/regex.ts`, pumping-lemma, halting-problem, chomsky-hierarchy, dfa-to-regex, regex-to-nfa |
| 6 | The layout chooser `pickLayout` lives in `src/viz/_stage/arrange.ts` (23 users), beside `bestPlacement` in `_grammar/draw.ts` and per-page column pickers | 2 | 2 | 1 | 3 | 4 | `src/viz/_stage/`, `src/viz/_grammar/` |
| 7 | `STAGES` in `layouts/graph.ts` still holds the old 884×305 desktop stage, the fallback for thumbnails, prerender and tests | 2 | 2 | 2 | 1 | 3 | `src/layouts/graph.ts` |
| 8 | Chart code written three times: big-o-definition (exact fractions), doubling-experiment (log-log), amortized-analysis (two-lane bars) | 2 | 4 | 1 | 3 | 2 | those three views |
| 9 | Shared code living in page folders, imported by siblings: avl (treap, splay, red-black), hash-chaining (4 pages), linked-list (3), regex-to-nfa (regex-engines), prim (kruskal), leftist-heap (skew-heap) | 2 | 3 | 1 | 2 | 2 | those folders |
| 10 | `matches()` in `_automata/regex.ts` is exponential on deeply nested concatenations | 1 | 2 | 2 | 1 | 2 | `src/viz/_automata/regex.ts` |

### 15.2 Debt to keep

- The pseudocode line helper `L` (107 copies) and `mark` (90): one-line, never change, and a
  shared import would save nothing.
- `plural` and `distinct` variants (about 20 each): small, and their signatures differ on purpose.
- Large model files (bst, linked lists, np-reductions, over 1000 lines): one page each, mostly
  narration; they are long, not tangled.
- Two TODO or FIXME comments in the whole tree.
- `graphLines` in 19 graph pages (item 4 at first): four formats, not copies (with or without
  `directed`, with or without weights), each matching that page's Python, Java and C++ drivers;
  one function with two flags would move the format away from the parsers that read it.

### 15.3 Order

Highest priority first, one item per commit, each with the full checks and screenshots before
and after when a drawing can change: 1, 2, 3, 4, 5, 6, 7, then 8 and 9 (larger).

## Appendix A: Galles/Lucet pages and controls (captured 2026-11-04)

| Page | Controls |
|---|---|
| StackArray | value; Push, Pop, Clear (fixed capacity 30) |
| StackLL | value; Push, Pop, Clear |
| QueueArray / QueueLL | value; Enqueue, Dequeue, Clear |
| RecFact / RecReverse | n or string; Factorial / Reverse |
| RecQueens | board size 1–8 |
| BST, AVLtree, SplayTree | Insert, Delete, Find (one value each); Print |
| RedBlack | the same, plus show null leaves |
| SkipList | key, coin flips; Lookup, Insert, Remove |
| OpenHash / ClosedHashBucket | Insert, Delete, Find; integers or strings |
| ClosedHash | the same, plus linear, quadratic or double hashing |
| BTree | Insert, Delete, Find, Print, Clear; max degree 3–7; preemptive split/merge |
| BPlusTree | Insert, Delete, Find, Print, Clear; max degree 3–7 |
| ComparisonSort | Randomize, Change size; insertion, selection, bubble, quick, merge, shell |
| Bucket/Counting/Radix/HeapSort | Randomize; run |
| BoyerMoore / KnuthMorrisPratt | text, pattern; Search (KMP also builds the failure function) |
| Trie / CompressedTrie | key; Lookup, Insert, Remove |
| Huffman | text; Build tree |
| Heap | Insert, Remove smallest, Clear, BuildHeap |
| BinomialQueue / FibonacciHeap | Insert, Remove smallest, Clear; logical or internal view |
| LeftistHeap / SkewHeap | Insert, Remove smallest, Clear (Leftist: show null path lengths) |
| BFS, DFS, Dijkstra | start vertex; New graph; directed/undirected; small/large; 3 views |
| ConnectedComponent, Prim, TopoSort×2, Kruskal, Floyd | New graph; small/large; 3 views (Prim takes a start vertex; Floyd directed or not) |
| DPFib / DPChange / DPLCS | recursive, table, memoized (Change: greedy too; two coin sets) |
| 2D/3D geometry (5 pages) | angles, scales, translations; row or column major; +y up or down; hand↔world space |
| DisjointSets | Find, Union; path compression; union by rank; rank = nodes or estimated height |

## Appendix B: Catalog additions in v2

The source of truth is `src/viz/catalog.ts`. These come from the surveys, beyond the
Galles/Lucet list and the v1 additions. Source key: V = VisuAlgo, C = csvistool, D = Coddy.

**Core**
- **Lists:** circular linked list (C); Floyd cycle detection (V).
- **Stacks, queues, arrays:** deque as both array and linked list (C); sorted vs unsorted array (V).
- **Searching and sorting:** linear search (D); binary search variants (D); cocktail shaker sort (C).
- **Trees:** general binary tree with traversals (D); 2-4 tree preset (C).
- **Maps:** key-value mode on BST, AVL and hash pages (C, D). This is a mode, not new pages.
- **Recursion:** Fibonacci call tree (D); recursion tree vs memo DAG (V).
- **Foundations:** memory model (D); Big-O growth lab (D); recurrences and the Master theorem (V).
- **Graphs:**
  - representations (V, C);
  - bipartite check (V);
  - cut vertices and bridges (V);
  - DAG shortest paths (V);
  - grid BFS (D).
- **Flow and matching:** max flow with min cut; bipartite matching (V).
- **Strings:** brute force (C); Rabin-Karp (C).
- **Geometry:** convex hull (V).
- **Hard problems:** NP-completeness reduction map (V).

**Advanced**
- LRU cache (C).
- Backtracking decision trees (D).
- Static range queries; Fenwick tree; segment tree (V).
- Suffix array; suffix tree (V).
- Dinic and min-cost flow; Hopcroft-Karp, Hungarian, blossom (V).
- 2-SAT; TSP; vertex cover; Steiner tree; bitmask subsets (V).
- Polygon algorithms (V).
