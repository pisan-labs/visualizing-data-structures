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

StepWise (<https://stepwise.hintwise.org>) is our own set of interactive data structure and
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
| 5 | Hosting | Netlify site `stepwise-pisan-labs`, final domain `stepwise.hintwise.org` (was `stepwise.pisan.me`, which now redirects); public repo; publishing locked until Yusuf releases it |
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
| 6 | Done 8 November (moved; the other choosers score differently and stay apart): the layout chooser `pickLayout` lives in `src/viz/_stage/arrange.ts` (23 users), beside `bestPlacement` in `_grammar/draw.ts` and per-page column pickers | 2 | 2 | 1 | 3 | 4 | `src/viz/_stage/`, `src/viz/_grammar/` |
| 7 | Done 8 November: `STAGES` in `layouts/graph.ts` still held the old 884×305 desktop stage, the fallback for thumbnails, prerender and tests | 2 | 2 | 2 | 1 | 3 | `src/layouts/graph.ts` |
| 8 | Done 8 November (the shared parts: axes, grid and reference lines, tick labels, clipping, powers of ten, fit-to-room sizes, in `src/layouts/chart.ts`; each page keeps its own scales): chart code written three times: big-o-definition (exact fractions), doubling-experiment (log-log), amortized-analysis (two-lane bars) | 2 | 4 | 1 | 3 | 2 | those three views |
| 9 | Done 8 November (moved, no code changed: `_bst`, `_hashing`, `_lists`, `_meld`, `_graph/mst.ts`, `_automata/thompson-*` and `regex-random.ts`; `fmt` and `parseListValue` stay in linked-list/model.ts): shared code living in page folders, imported by siblings: avl (treap, splay, red-black), hash-chaining (4 pages), linked-list (3), regex-to-nfa (regex-engines), prim (kruskal), leftist-heap (skew-heap) | 2 | 3 | 1 | 2 | 2 | those folders |
| 10 | Done 8 November (memoized by subexpression and start; a 20-deep test that hung now takes milliseconds): `matches()` in `_automata/regex.ts` is exponential on deeply nested concatenations | 1 | 2 | 2 | 1 | 2 | `src/viz/_automata/regex.ts` |

| 11 | Capture in place 8 November (every axe check prints each failing element through `axeFindings` in `tests/e2e/helpers.ts`); the cause waits for the next failure. Intermittent: the factorial page's axe scan "deep in the recursion" (dark, desktop) found one color-contrast node once in a full run on 8 November, then passed 32 runs of 32; the element was not captured | 1 | 2 | 2 | 1 | 2 | `tests/e2e/factorial.spec.ts` |

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

## 16. Wave 7: the topics the surveys did not cover (planned and built 2026-11-08)

Yusuf (8 November, about 16:10): "All" to the list of standard topics none of our pages covered.
62 pages, all in `src/viz/catalog.ts` (they show as planned until built). Every page meets the
definition of done in `CLAUDE.md` (examples, concept page in Yusuf's voice, code tabs in three
languages, practice, preview, property test), lays out for the stage (smallest text at least
11 px on a laptop and 9 px on a phone, checked with `smallestText`), and reuses the kits.

### 16.1 Families and agents

| Agent | Pages | Kits to reuse |
|---|---|---|
| 7A Searching and sorting | interpolation-search, exponential-search, ternary-search, comb-sort, gnome-sort, introsort, timsort, bitonic-sort | `_sorting`, bars |
| 7B Balanced and augmented trees | cartesian-tree, scapegoat-tree, aa-tree, interval-tree, persistent-bst | `_bst`, binary-tree layout |
| 7C Spatial and geometry | kd-tree, quadtree, closest-pair, segment-intersection, delaunay | plane layout, geometry pages |
| 7D Heaps and odd trees | d-ary-heap, min-max-heap, pairing-heap, rope, merkle-tree | heap, forest, binary-tree layouts, `_meld` |
| 7E Hashing and sketches | bloom-filter, cuckoo-hashing, robin-hood-hashing, consistent-hashing, count-min-sketch, hyperloglog | `_hashing` |
| 7F Strings | z-algorithm, aho-corasick, manacher, burrows-wheeler, lz-compression | `_strings`, align, trie layouts |
| 7G Graphs | euler-path, graph-coloring, bidirectional-search, boruvka, johnson, lca, pagerank | `_graph`, graph layout |
| 7H Dynamic programming and greedy | dp-lis, dp-rod-cutting, dp-subset-sum, dp-matrix-chain, dp-palindrome, activity-selection, interval-partitioning, fractional-knapsack | `_dp`, table layouts |
| 7I Numbers, divide and conquer, randomized | euclid, mod-pow, sieve, rsa, karatsuba, fft, fisher-yates, reservoir-sampling | table, bars, calls layouts |
| 7J Computation | cfg-to-cnf, ll1-parsing, lr0-parsing, lba, rice-theorem | `_grammar`, `_automata`, `_turing` |

### 16.2 Order

Yusuf (8 November, about 16:50): everything gets implemented. Running since 16:45: 7A, 7E, 7G,
7H (beside the four small-text agents). Queue, each started as soon as any agent finishes:
7B, 7F, 7I, 7J, 7C, 7D. The lead merges each family with `--no-ff`, runs conformance 10 times
on its pages, the full suites, and pushes `next`; the daily deploy publishes. A family not
finished at a handover is restarted by the next session from its committed WIP, never dropped.

### 16.3 Done

All ten families merged into `next` on 8 November between 19:40 and 21:20: 62 pages, 191 live
in all. Each passed conformance (10 runs by its agent, 2 or 3 by the lead), its own tests, code
tabs, previews and e2e; the full unit suite passed on the merged tree.

## 17. Wave 8 and the review of the older pages (planned 2026-11-09)

Yusuf (9 November, about 10:30): build these first, and at the same time review the older pages
(the 129 built before wave 7, as wave 7 was reviewed), fix memory-model's sideways scroll on a
phone, and move rarely used buttons of the 9 pages whose buttons wrap at laptop width under
"More operations". Not now: the phone layout with the stage below the fold, the partial visual
fixes (Johnson's centre, product-construction's "dead"), engine gaps (multitape-tm identity,
refused-op check, the factorial axe flake), and the chosen simplifications (Timsort, introsort,
segment intersection's default).

### 17.1 Pages (12, in `src/viz/catalog.ts`)

| Agent | Pages | Kits to reuse |
|---|---|---|
| 8A Techniques | two-pointers, sliding-window, monotonic-stack, monotonic-queue, string-hashing | `_sorting` bars, align, `_strings` |
| 8B Algorithms | push-relabel, karger-min-cut, strassen | `_flow`, `_graph`, `_numbers`, calls |
| 8C Theory | myhill-nerode, regex-derivatives, post-correspondence, busy-beaver | `_automata`, `_grammar`, `_turing`, tape |

The definition of done and the wave 7 brief apply unchanged.

### 17.2 Review of the older pages

Four reviewers, the wave 7 review brief: structures (32 pages), sorting/recursion/DP/foundations
(33), strings/graphs/flow (33), ranges/geometry/hard problems/automata (31).

## 18. Optional accounts: sign in, saved examples on the server (planned 2026-11-10)

Yusuf (10 Nov): an optional Google or magic-link sign-in that saves preferences, tells people
about new pages, and saves examples on the server so they can be loaded in class. Possibly
Supabase.

**Choice: the shared HintWise Supabase project** (10 Nov, from the Plabs session at Yusuf's
request): `https://auth.hintwise.org`, US East, paid plan (no pausing), shared with other HintWise
apps. Google and magic-link sign-in are already set up, the magic links sent through Yusuf's paid Resend
account (any Supabase auth email rate limit is raised to suit, with his yes); the redirect allow-list covers `https://*.hintwise.org/**` but not localhost or previews,
so tests stay mocked. StepWise uses only its own schema, `app_stepwise`; one user pool across the
apps. Alternatives weighed before this: a new Supabase project, Firebase, our own auth on Netlify
or Cloudflare.

**Rules**
- Signing in is optional. Signed out, or with no Supabase configured, every page works as now,
  the account UI is hidden, and nothing is sent anywhere (no analytics, no tracking).
- The Supabase client loads on demand (dynamic import), only when someone opens Sign in or
  already has a session, so the main bundle does not grow.
- Configured at build time by `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (both public).
  The service-role key never enters the repository or the client.
- Data is private by default (row-level security: each user sees only their own rows); an
  example marked shared can be read by anyone with its link.
- No sign-in inside embeds (Google refuses sign-in in iframes; embeds stay read-only).

**Slices**
1. *Vertical slice:* sign in (magic link and Google), save, list, load, rename and delete this
   page's examples in the account; copy the browser's saved examples into it; share an example
   by a short link (`#saved=<id>`) that loads without signing in. SQL migration with RLS, setup
   notes for Yusuf, unit tests with a fake backend, e2e with mocked Supabase endpoints.
2. Preferences sync (theme, speed, detail, code view, tab); "New since your last visit" from a
   dated list of releases (works signed out too); an opt-in for email about new pages, sent through
   Yusuf's Resend account from a server-side job (the platform's choice: Edge Function or admin
   workflow); delete my account.
3. Lesson lists: an ordered set of saved examples across pages, played in Present mode, with a
   link for a class.

**Owner actions (Yusuf):** ✔ all done. Plabs applied `app_stepwise` (migrations 0001 to 0003,
10 Nov), the URL and anon key are in `netlify.toml`, and accounts are live since 2905721 (10 Nov).
The platform email hook is on, and the first live magic-link sign-in worked (11 Nov). "Delete my
StepWise data" removes StepWise's rows; deleting the whole HintWise account has no self-service
yet (email builder@hintwise.org).

## 19. Usability (planned 2026-11-10)

Yusuf accepted these (not follow-along mode):

1. **Pen and pointer in Present mode:** a laser-style pointer and freehand ink over the stage,
   cleared when the step changes unless kept; mouse, touch and stylus.
2. **Save the picture** as SVG or PNG (the current step, in the current theme) for slides and
   handouts.
3. **Keyboard shortcuts overlay** on "?", built from the same table the key handlers use.
4. **Printable practice worksheets:** a seeded set (the same seed as the assignment link) with
   pictures and blanks, and an answer key on its own page.
5. **Progress:** lessons read, concept checks answered and practice scores, kept in the browser
   (synced to the account in section 18, slice 2), shown per page and per pathway in the catalog.
6. **Pick up where you left off:** the home page offers the last few pages at the step and
   example the reader left.
7. **Works offline:** an installable app with a service worker we write ourselves; pages load
   from the network first and from the cache when offline. A self-unregistering `sw.js` is the
   kill switch.
8. **Lesson lists** (section 18, slice 3): after accounts slice 1 lands.

Built by three agents in parallel with the accounts slice, split by area so they do not edit the
same files: stage and Present mode (1 to 3), practice, progress and the home page (4 to 6), and
the offline app (7).

## 20. Wave 9: AI and LLMs (planned 2026-11-13, approved the same day)

Yusuf (13 November): lots of interest in LLMs and the AI algorithms behind them; research which
topics and visualizations would be useful and write a detailed plan, then ask before building.
The questions are in 20.9 and the answers in 20.10; the slice (9A) is in 20.11.

### 20.1 What courses teach (surveyed 2026-11-13)

From course pages and syllabi found on 13 November (search summaries; not every page was read
in full):

| Course | Topics that match this section |
|---|---|
| Stanford CS336, Language Modeling from Scratch (2025, 2026) | tokenization, architectures, GPUs, parallelism, inference, scaling laws, alignment (SFT, RLHF, RLVR) |
| Old Dominion CS 795/895 (spring 2026) | tokenization, self-attention, a KV-cache week (cache growth, sliding-window eviction), decoding |
| UC Merced CSE 188 (spring 2026) | BPE; efficient generation: KV cache, prefill against decode, memory |
| Johns Hopkins, ChatGPT from Scratch (2025, 2026) | tokenization, multi-head attention, sampling and inference, quantization |
| IIT Delhi / NPTEL, Introduction to LLMs (2025) | greedy, beam search, temperature, top-k and nucleus sampling |
| Stanford CME 295, Transformers (2025) | tokenization, attention, decoding, mixture of experts, scaling laws (from a news summary, not checked against Stanford's site) |

Texts these courses name: Raschka, *Build a Large Language Model (From Scratch)*; Amidi and
Amidi, *Super Study Guide: Transformers and LLMs*; Jurafsky and Martin, *Speech and Language
Processing* (3rd edition draft, "SLP3").

What every list shares: tokenization (BPE), attention and the transformer block, decoding and
sampling, the KV cache. Most add quantization and mixture of experts. Systems courses add
paged KV memory, batching and FlashAttention.

### 20.2 What other tools do (surveyed 2026-11-13)

As in 13.1, the names are a record of what we looked at; we copy no design, names, examples or
code.

| Tool | What it shows |
|---|---|
| Transformer Explainer (Georgia Tech, IEEE VIS 2024) | a live GPT-2 in the browser: the forward pass, attention, temperature; layers zoom from pipeline to matrix math |
| AnimatedLLM (Kasner and Dušek, 2026) | precomputed traces of open models on curated inputs, step by step |
| bbycroft.net/llm | a 3D walk through a tiny GPT (about 85 000 parameters) that sorts letters |
| Eigenvue | step-by-step pages for BPE, embeddings, self-attention, multi-head attention, transformer block, perceptron, backprop, gradient descent (SGD, momentum, Adam) |
| BPE demos (Cornell CS 4782, Imperial, Nipun Batra, others) | merges one at a time; Cornell's puts BPE and WordPiece side by side |
| FlashAttention demos (several blogs) | tiles and the running max and sum of the online softmax |
| Speculative decoding (Adaptive ML; an LLM inference explorer; a rejection-sampling trace) | draft, verify, accept or reject; speedup against draft length |
| RoPE demos (Oakland, Cornell, Hugging Face Spaces) | rotating pairs of dimensions; the dot product depends only on the distance |
| HNSW (Zilliz Feder; a 2026 talk on vector search) | the search path down the layers; quantization in the talk |
| MoE, GRPO | a few blog widgets (router scores per expert; group-relative advantages) |
| PagedAttention, constrained decoding | explanations and diagrams only; no step-through tool found |

What they get right:
- real or realistic model behaviour (Transformer Explainer runs GPT-2 itself);
- zooming from the whole pipeline down to one matrix product;
- sliders for temperature, k and p, and accept/reject traces for speculative decoding.

What they leave out, and StepWise already has:
- stepping back, and pseudocode in step with the picture;
- code in Python, Java and C++ that CI checks against the model;
- seeded practice graded in the browser, assignment links, worksheets;
- compare mode (greedy against beam, BPE against WordPiece, HNSW against brute force);
- links to the classic data structure each technique rests on;
- the systems side: paged KV memory, prefix caching, batching and constrained decoding have
  explanations but almost no step-through visualization.

I could not find studies of what students get wrong about attention; the one paper found
(arXiv 2601.21631) reports that building a small model moves students from "it's magic" or
anthropomorphic explanations to technical ones. That supports small models learners can step
through.

### 20.3 The angle

**The algorithms and data structures inside an LLM.** StepWise should not try to be a second
Transformer Explainer: we cannot ship GPT-2 weights offline, and others do that well. We do
what they do not: every number on screen comes from a step a learner can pause, rewind, predict
and code. Each page links to the classic pages it rests on:

| LLM page | Rests on |
|---|---|
| BPE | Huffman, LZW (compression by merging frequent pairs) |
| WordPiece | trie (greedy longest match) |
| Unigram tokenizer | dynamic programming (Viterbi over a lattice) |
| constrained decoding | regex to NFA, NFA to DFA, DFA |
| beam search, top-k | BFS by layers, binary heap, quickselect |
| backpropagation | topological sort (DFS) on a DAG |
| HNSW | skip list, greedy graph search |
| paged KV cache, prefix cache | free lists, reference counts, compressed trie, LRU cache |
| MoE routing | load balancing, consistent hashing |
| IVF, product quantization | k-means |
| BM25 | inverted index (hashing) |
| embeddings search | brute-force top-k with a heap |

### 20.4 Conventions

- **Default text:** SLP3 where it defines the method (tokenization, n-grams, decoding,
  embeddings); otherwise the original paper (Vaswani et al. 2017 for attention, Su et al. for
  RoPE, Kwon et al. 2023 for PagedAttention, Dao et al. for FlashAttention, Malkov and Yashunin
  for HNSW, Leviathan et al. 2023 for speculative decoding). Where sources differ, a setting,
  as everywhere else.
- **Notation:** row vectors, `X·W`; `Q`, `K`, `V`, `d_k`; scaling by `1/√d_k`; causal mask on
  in decoder pages; pre-norm (as in GPT-2 and later). Plain-English pseudocode says "how well
  this word's question matches that word's label" before it says "dot product".
- **Toy sizes:** at most about 30 vocabulary items, 8 tokens, model width 8 and 4 heads, so
  every number fits on a phone (an 8 × 8 grid at 360 px gives cells of about 40 px).
- **Weights:** seeded from `rng.ts` and rounded to one decimal, or set by hand to show a
  pattern (a head that looks at the previous token). Never real model weights: they are large,
  have licences, and would break the offline size budget.
- **Numbers:** float64 in the model, two decimals on screen, three decimals (`round3`, half up,
  as on the PageRank page) in the code drivers. Java uses `StrictMath` for `exp`, `log` and
  `sqrt`, so the three tabs agree.
- **Randomness:** every draw uses the seeded RNG; sampling pages show the uniform number drawn
  and the cumulative distribution it lands in.
- **At real scale:** each concept page has a short section with real sizes (for example GPT-2
  small: 12 layers, 12 heads, width 768, 50 257 tokens), each checked against its paper or
  model card when written, with the year. No claims about a company's unpublished internals.
- **A shared toy corpus** we write ourselves (a few dozen short sentences), used by the
  tokenizers, the n-gram model, word2vec and speculative decoding, so a learner meets the same
  words across pages.

### 20.5 Shared pieces (new)

1. **Shaded cells:** a `shade` value on `rect` shapes (0 to 1, or −1 to 1 for diverging),
   drawn from a theme-aware, colour-blind-safe ramp. The number is always printed in the cell,
   so colour is never the only cue (axe and contrast checks in e2e).
2. **`src/viz/_matrix/`:** matrix layout with row and column labels; highlight a row, a column
   and a cell; a matrix product cell by cell at level 3; probability bars with a cut line (top-k,
   top-p); 2D vectors as arrows. Built on `_grid` where it fits.
3. **`src/viz/_lm/`:** the toy corpus, a stable softmax (subtract the max), seeded weight
   matrices, a bigram model, so pages share one toy world.
4. **Catalog:** a fourth pathway, `ai` ("AI and LLMs"), with the six families below; the
   catalog gets a fourth pathway button.
5. **Releases:** each wave is one release in `src/releases.ts`, which since today also feeds
   the platform's opt-in email (`notify-feed.json`) once deployed.

### 20.6 Pages (29, in three tiers)

Tier 1 is what nearly every course teaches; tier 2 is systems and retrieval; tier 3 is
advanced (`advanced: true`). Every page meets the definition of done in `CLAUDE.md`.

**Tokenization**

| id | Tier | What it shows | Settings | Practice |
|---|---|---|---|---|
| `bpe-tokenizer` | 1 | training: count adjacent pairs, merge the most frequent, the vocabulary grows; encoding: apply merges in the order learned | characters or bytes; end-of-word marker; tie-break (first seen or alphabetical) | the next merge; tokens after k merges; encode a new word |
| `wordpiece` | 1 | greedy longest match over a trie with `##` pieces; `[UNK]` when nothing matches; training scores pairs by count(ab) / (count(a) · count(b)) | maximum word length; show the trie | the pieces of a word; which word becomes `[UNK]` |
| `unigram-tokenizer` | 2 | the best split as a shortest path through a lattice (Viterbi); training prunes the pieces that cost least | sample a split (subword regularization) | best split; its score |

**Language models and decoding**

| id | Tier | What it shows | Settings | Practice |
|---|---|---|---|---|
| `ngram-lm` | 1 | count bigrams or trigrams from the corpus, turn counts into probabilities, generate by sampling, perplexity of a sentence | n; add-k smoothing or backoff | a probability; the next word distribution; which sentence has lower perplexity |
| `sampling` | 1 | logits to a stable softmax, temperature, greedy, top-k, top-p, min-p: the cut, the renormalized bars, the draw | strategy; temperature; k; p | which tokens survive; a probability after renormalizing; the token drawn for a given u |
| `beam-search` | 1 | the tree of hypotheses, keeping the best B each step; a case where greedy misses the best sequence | width; length normalization; end-of-sequence handling | the beam after step t; the final sequence |
| `speculative-decoding` | 2 | a small model drafts k tokens, the large model checks them in one pass, accept with min(1, p/q), resample from the leftover on a reject; target passes saved | k; greedy or sampling acceptance | how many drafts are accepted; the passes saved |
| `constrained-decoding` | 2 | a regex compiled to a DFA, then a mask per state over a vocabulary of multi-letter tokens; masked logits set to −∞; the index built once | regex; precompute the index or check each token | allowed tokens in a state; the output |

**Inside the transformer**

| id | Tier | What it shows | Settings | Practice |
|---|---|---|---|---|
| `embeddings` | 1 | words as vectors in 2D; dot product against cosine; nearest neighbours by brute force with a heap; analogy arithmetic | similarity measure; normalize | nearest word; which similarity is larger |
| `self-attention` | 1 (slice) | `Q = XW_Q`, `K`, `V`; scores `QKᵀ`; scale; causal mask; softmax per row; weighted sum of `V`; every dot product at level 3 | causal; scaling on or off (why it matters); `d_k` | a score; which entries are masked; the largest weight in a row |
| `multi-head-attention` | 1 | split into heads, each with its own pattern; concatenate; output projection; MQA and GQA share K and V heads | heads; KV heads (MHA, GQA, MQA) | head width; KV-cache size for a setting |
| `positional-encoding` | 1 | sinusoidal, learned, RoPE (rotate pairs; the score depends only on the distance), ALiBi (a linear bias) | scheme; dimensions | the angle for a pair at a position; which pairs spin fastest |
| `transformer-block` | 2 | one token's vector through norm, attention, residual add, MLP, residual add; then the unembedding to logits and the next token | pre- or post-norm; LayerNorm or RMSNorm; ReLU, GELU or SwiGLU | the residual after a step; parameter count |
| `moe-routing` | 2 | a router scores experts per token, top-k chosen, softmax over the chosen, capacity and dropped tokens, the load-balance readout | k; capacity factor; token choice or expert choice | which experts a token uses; dropped tokens |

**Learning**

| id | Tier | What it shows | Settings | Practice |
|---|---|---|---|---|
| `backpropagation` | 1 | a small expression or neuron as a DAG: forward values, topological order, gradients by the chain rule, gradients that add up when a value is used twice (the classic bug) | expression; zero the gradients or not | a gradient; the order nodes are visited |
| `gradient-descent` | 1 | a 1D and a 2D loss surface; steps with learning rates that crawl, converge and diverge; momentum; Adam | method; learning rate; β values | the next point; does it converge |
| `word2vec` | 3 | skip-gram with negative sampling: windows make pairs, each update pulls a pair together and pushes negatives apart, in 2D | window; negatives | the pairs a window makes; the direction of an update |
| `policy-optimization` | 3 | a policy over four answers as bars; rewards; REINFORCE, PPO's clip and GRPO's group-normalized advantage move the bars; a KL penalty holds them near the reference; DPO from preference pairs | method; clip ε; KL β | the advantages for a group; which bar grows |

**Serving LLMs**

| id | Tier | What it shows | Settings | Practice |
|---|---|---|---|---|
| `kv-cache` | 1 | generating with and without a cache: recompute every K and V, or append one row; prefill against decode; work and memory as counters; sliding-window eviction | cache on or off; window | work for token t; cache size |
| `paged-attention` | 2 | block tables map each sequence's logical blocks to physical blocks; allocation on demand; freeing; shared prompt blocks with reference counts; copy-on-write when samples diverge; waste against contiguous allocation | block size; sharing | blocks in use; the table after a step |
| `continuous-batching` | 2 | requests of different lengths on a time line; static batching waits for the longest, iteration-level scheduling fills free slots; throughput and waiting time | batch slots; policy | finish time of a request; idle slots |
| `quantization` | 2 | absmax int8, zero-point (asymmetric), per-tensor against per-block scales; one outlier ruins a per-tensor scale; the error readout | bits; symmetric; block size | the code for a value; the value it decodes to |
| `prefix-cache` | 3 | a radix tree of token prefixes over cached blocks; matching a new prompt; LRU eviction of leaves | capacity | the length matched; what is evicted |
| `flash-attention` | 3 | Q blocks against K/V blocks; the running max, sum and rescaled output of the online softmax; the same answer as plain attention; memory reads as a counter | block sizes | the running max after a block; reads saved |

**Retrieval and vector search**

| id | Tier | What it shows | Settings | Practice |
|---|---|---|---|---|
| `k-means` | 2 | Lloyd's algorithm: assign, move centres, repeat; empty clusters; k-means++ seeding | k; seeding | the next assignment; the new centre |
| `bm25` | 2 | an inverted index; scores with term frequency saturation (k₁) and length normalization (b); top documents | k₁; b | a term's score; the top document |
| `hnsw` | 2 | insertion with a random level (as in a skip list), greedy descent, neighbour lists; search with a candidate list of size ef; recall against brute force | M; ef | the path of a search; neighbours after an insert |
| `ivf-index` | 3 | k-means cells, search the nprobe nearest cells; the neighbour missed in a cell not probed | lists; nprobe | which cells are searched; is the answer exact |
| `product-quantization` | 3 | split vectors into pieces, a k-means codebook per piece, codes; distance by table lookups (asymmetric distance) | pieces; codebook size | the code of a vector; an approximate distance |

### 20.7 Considered and left out

- **Real models in the browser:** megabytes of weights, against the offline size budget and
  our "nothing external" rule; Transformer Explainer already does it well.
- **RNNs and LSTMs:** courses now mention them only as history; a later page if asked.
- **CNNs, diffusion, GANs:** not LLM algorithms; good tools exist (CNN Explainer, GAN Lab).
- **LoRA, scaling laws:** one formula or one plot each, little to step through; a section on
  the transformer-block or a Foundations-style page later.
- **Parallel training** (ring all-reduce, tensor and pipeline parallelism): ring all-reduce is a
  good algorithm page; a candidate for later.
- **MCTS and search over reasoning steps, interpretability (probes, sparse autoencoders),
  agents and prompting:** not settled enough or not algorithms we can test.

### 20.8 Order of work and risks

1. **9A, vertical slice:** shared pieces 1 to 4 and `self-attention` only. It tests the new
   parts end to end: shaded cells, matrix layout, float output in three languages, practice
   with numbers, the new pathway. Yusuf looks at it on `next` before anything else is built.
2. **9B, the rest of tier 1** (11 pages), agents in parallel as in wave 7, grouped by shared
   pieces: tokenization (`bpe-tokenizer`, `wordpiece`); decoding (`ngram-lm`, `sampling`,
   `beam-search`); transformer (`embeddings`, `multi-head-attention`, `positional-encoding`);
   learning (`backpropagation`, `gradient-descent`); `kv-cache`.
3. **9C, tier 2** (11 pages), then **9D, tier 3** (6 pages), each after Yusuf says go.
4. After each wave, an independent review agent checks the numbers against a reference
   implementation and the concept pages for overclaims and dated facts.

Risks:
- **Float agreement across tabs:** `round3`, `StrictMath` in Java; a value that lands exactly
  on a rounding edge could still differ by 0.001. The self-attention tabs match the model
  exactly, so the code tests still compare lines exactly; a page that ever needs a tolerance
  adds one then.
- **A field that moves fast:** concept pages stick to published algorithms and date their
  "at real scale" numbers.
- **Toy sizes mislead about scale:** the "at real scale" sections say how far off we are.
- **Scope:** 29 pages; the tiers let us stop after any wave.
- **Cost:** quota only, no paid services; each deploy 15 Netlify credits, only on "deploy".

### 20.9 Questions for Yusuf

1. Scope: build tiers 1 and 2 (23 pages) after the slice, and tier 3 later? Recommended: yes.
2. Placement: a fourth pathway "AI and LLMs", or these families under Algorithms? Recommended:
   a fourth pathway, so the section is easy to find and to link to.
3. Weights: seeded or hand-set toy weights everywhere, or also a tiny model we train ourselves
   (in TypeScript, deterministic, a few kB committed) so `transformer-block` predicts a
   sensible next token? Recommended: toy weights now; decide the trained model when
   `transformer-block` comes up in 9C.
4. Default text: SLP3 and the original papers, or Raschka's book? Recommended: SLP3 and papers
   (free to read, and courses name them).
5. Anything from 20.7 you want in now (RNN/LSTM, LoRA, ring all-reduce, MCTS)?
6. Approve 9A (the slice) to start?

### 20.10 Answers (Yusuf, 13 November: "Yes to all")

1. Tiers 1 and 2 after the slice; tier 3 later.
2. A fourth pathway, "AI and LLMs".
3. Toy weights now; the trained model is decided when `transformer-block` comes up.
4. SLP3 and the original papers.
5. Read as yes to all four: `rnn-lstm`, `mcts`, `lora` and `ring-allreduce` join tier 3 (33
   planned pages in all). To drop them, delete their four lines in `src/viz/catalog.ts`.
6. 9A started.

### 20.11 The slice (9A, built 13 November)

- **Catalog:** the `ai` pathway and its six families (Tokenization, Language models and decoding,
  Inside the transformer, Training, Serving LLMs, Retrieval and vector search), 33 pages, one
  live.
- **Shaded cells:** `shade` on `rect` (−1 to 1), drawn in `Shapes.svelte` as a mix of the
  active (positive) or compare (negative) color into the cell, at most half, so the number
  printed on it stays readable; a mark changes the outline and keeps the shade.
- **`_lm`:** `numbers.ts` (matmul, dot, stable softmax, `round3` with a sign, `short` for
  cells, `two` for narration) and `vocab.ts` (21 words with hand-made embeddings: animal,
  thing, action, small).
- **`_matrix`:** panels of numbers in rows, with the words down the left; one row on a laptop,
  two or three on a phone (`pickLayout`).
- **Practice:** number answers take a `tolerance` (two decimals take 0.005); a typed − counts.
- **`self-attention`:** one head, d = 4, d_k = 2, at most 7 words of at most 6 letters (so
  the smallest text is 11 px on a laptop and 9 px on a phone); operations load, project and
  attend; settings causal (default on), scale (on) and the head (made by hand, or random); 7
  examples; 4 practice kinds; code tabs that match the model exactly.

### 20.12 Wave 9B (started 13 November, about 21:10 Lisbon)

Yusuf reviewed the slice ("1 yes", trying it locally). Five agents in parallel, each in its own
worktree from `next` at 457602f (the shared toy corpus, `src/viz/_lm/corpus.ts`, added first),
each told not to edit shared files and to report any change it needs:

| Agent | Pages | Own kit | E2E port |
|---|---|---|---|
| Tokenization | bpe-tokenizer, wordpiece | `_tokenize` | 4801 |
| Decoding | ngram-lm, sampling, beam-search | `_decode` | 4802 |
| Inside the transformer | embeddings, multi-head-attention, positional-encoding | `_transformer` | 4803 |
| Training | backpropagation, gradient-descent | `_train` | 4804 |
| Serving | kv-cache | `_serve` | 4805 |

The lead merges each branch into `next`, runs the full suites and the e2e, and pushes `next`.
A release in `src/releases.ts` comes with the deploy, on Yusuf's "deploy".

All five merged by 22:20 Lisbon; on the merged tree lint, svelte-check, the full unit suite
(260 files, 5212 tests) and e2e for the 12 pages and the catalog (243 passed) passed.

### 20.13 Wave 9C, tier 2 (started 13 November, about 22:40 Lisbon)

Yusuf's loop (13 November): when tier 1 is finished, build tier 2 and then tier 3. The open
question 3 (a trained model for `transformer-block`) went unanswered for 15 minutes, so the
recommendation stands: hand-made weights, like every other page (to change it, only that page's
weights change). Four agents, from `next` at the tier-1 merge:

| Agent | Pages | Own kit | E2E port |
|---|---|---|---|
| Decoding and tokenization | unigram-tokenizer, speculative-decoding, constrained-decoding | `_dec2` | 4811 |
| Transformer | transformer-block, moe-routing | `_block` | 4812 |
| Serving | paged-attention, continuous-batching, quantization | `_serve2` | 4813 |
| Retrieval | k-means, bm25, hnsw | `_retrieve` | 4814 |

All four merged by 00:20 Lisbon on 14 November (the decoding agent was stopped by a container
restart and resumed from its worktree). On the merged tree lint, svelte-check, the full unit
suite (271 files, 5446 tests) and e2e for the 23 AI pages and the catalog (451 passed) passed.
A tier-1 fact check (an independent agent) fixed two wrong facts (SLP3's end-of-word marker,
BERT's 200-character limit) and about 15 smaller ones.

### 20.14 Wave 9D, tier 3 (started 14 November, about 00:25 Lisbon)

Five agents, two pages each, from `next` at 4b499c4, beside a fact check of tier 2:

| Agent | Pages | Own kit | E2E port |
|---|---|---|---|
| Training A | word2vec, policy-optimization | `_train3` | 4821 |
| Training B | lora, ring-allreduce | `_dist` | 4822 |
| Serving | prefix-cache, flash-attention | `_serve3` | 4823 |
| Retrieval | ivf-index, product-quantization | `_retrieve3` | 4824 |
| Decoding | rnn-lstm, mcts | `_dec3` | 4825 |

All five merged by 01:30 Lisbon, then a tier-3 fact check (18 fixes on 7 pages). On the final
tree (14 November, 01:50) lint, svelte-check, the full unit suite (281 files, 5653 tests) and
e2e for all 33 AI pages and the catalog (641 passed) passed, and the 7 fact-checked pages again
(41 unit, 98 conformance and code, 104 e2e).

### 20.15 Done, and what is left

All 33 pages of the AI and LLMs pathway are on `next`, not deployed. A deploy waits for Yusuf's
"deploy"; it adds one release to `src/releases.ts` (proposed: id `2026-11-14-ai-and-llms`,
title "33 new pages", the 33 ids), and that release is emailed the next day at 15:17 UTC to
readers with the notify flag on.

Suggestions the agents made about shared code (none made; for a later cleanup):

1. `pickLayout` compares scale only, which is unfair when arrangements draw the main picture
   at different sizes in scene units (gradient-descent chooses from the stage's shape).
2. Previews repeat every static shape in every frame; contour plots make large previews.
3. A `number` setting takes whole numbers only, so decimals become long choice lists.
4. `VarsPanel` quotes string values and shows ±Infinity as `Infinity` (perplexity ∞).
5. `code.test.ts` random scripts cannot make structured arguments ("x,y", a vector), so search
   operations on hnsw, ivf-index and product-quantization are code-tested on the curated
   examples only.
6. `controls.random.make` gets no settings, unlike presets.
7. `_matrix` panels could take a font size (multi-head-attention is 9.0 px on a phone with 7
   words).
8. `src/layouts/trie.ts` edge labels crowd near a root with many children.
9. A page's opening runs with the reader's seed, so the numbers on arrival differ from the
   curated example's notes (k-means, hnsw, policy-optimization).

## 21. Wave 10: coding interviews and concurrency (planned 2026-11-14, approved the same day)

Yusuf (14 November): LeetCode's Explore has many algorithms and tricks useful to programmers;
explore it and suggest new sections. He chose both suggestions (interview patterns, and
concurrency), a fifth catalog pathway, and a plan for his approval before anything is built.
The questions are in 21.9 and the answers in 21.10.

### 21.1 What LeetCode teaches (surveyed 2026-11-14)

LeetCode refused automated reads (HTTP 403 on every Explore page) and a browser visit was not
allowed in this session, so this comes from search results (mostly third-party copies of the
cards) and from what we already knew of the cards; it may be out of date.

- **Learn cards:** Arrays 101, Array and String, Linked List, Hash Table, Queue & Stack, Recursion
  I and II, Binary Search, Heap, Binary Tree, Binary Search Tree, N-ary Tree, Trie, Graph,
  Dynamic Programming. The Graph card's chapters include disjoint set, Dijkstra, Bellman-Ford,
  SPFA and Kahn's topological sort.
- **Interview Crash Course:** 13 chapters; the core ones are arrays and strings (two pointers,
  sliding window, prefix sum), hashing, linked lists, stacks and queues, trees and graphs, heaps,
  greedy, binary search, backtracking and dynamic programming.
- **Concurrency problems:** printing in order, alternating printers, zero-even-odd, building
  water molecules from threads, dining philosophers, a bounded blocking queue, a multithreaded
  crawler, a traffic-light intersection.
- **Pattern courses elsewhere** (Grokking the Coding Interview and its copies, 14 to 41
  patterns by version) name the same tricks: two pointers, fast and slow pointers, sliding
  window, merge intervals, cyclic sort, in-place reversal, tree BFS and DFS, two heaps, subsets,
  modified binary search, bitwise XOR, top k, k-way merge, knapsack, topological sort.
- **Concurrency teaching tools:** Deadlock Empire (a browser game: the player schedules two
  threads to break the code), Threaded Paws, Railway Quest, ParaView (a recorder for C and C++
  programs), and papers visualizing the classic synchronization problems. As in 13.1, we copy no
  design, names, examples or code from any of them.

### 21.2 What StepWise already has, and the gap

Already live: two pointers, sliding window, monotonic stack and queue, cycle detection (tortoise
and hare), linked-list reversal, binary search and its variants, backtracking (subsets,
permutations, n-queens), bitmasks (including n & (n − 1)), prefix sums and sparse tables (range
queries), union-find, topological sort, tries, heaps, LRU cache, interval partitioning, activity
selection, ten classic DP problems, BFS and DFS.

The gap is LeetCode's real angle: the reusable trick and **recognizing which trick a problem
calls for**. Our pages explain an algorithm; interview prep needs "this problem has these cues,
so reach for that pattern", the naive solution beside the clever one, and the cost difference.

### 21.3 The angle

**Every pattern page shows the naive solution and the pattern side by side.** A setting switches
the approach (for example brute force against prefix sums with a hash map), counters show the
work (O(n²) against O(n)), and compare mode puts the two on the same input. Each concept page has
a "Spot it" section: the cues in a problem statement that call for this pattern. A **pattern
map** page ties the pathway together (problem cue → pattern → page, including the pages we
already have), with practice that asks "which pattern fits this problem?".

**Concurrency pages make the scheduler visible.** Threads are short lists of steps on shared
memory, one step at a time; the learner can be the scheduler (choose which thread runs next) and
try to break the code, or let the page enumerate every interleaving and count the outcomes.
StepWise's step-and-rewind model fits exactly: an interleaving is a timeline.

### 21.4 Conventions

- **Problems are ours.** We write every problem statement ourselves and name pages and examples
  after patterns and ideas, never after LeetCode problems or their numbers.
- **Naive first:** every pattern page has the brute force as a setting, so the gain is measured.
- **Default texts:** CLRS for the algorithms, as everywhere; for concurrency, Arpaci-Dusseau,
  *Operating Systems: Three Easy Pieces* (OSTEP, free online), and Downey, *The Little Book of
  Semaphores* (free), for the synchronization patterns.
- **Toy sizes:** arrays of at most about 12, intervals at most 8, 2 to 4 threads of at most
  about 6 steps, so every interleaving can be enumerated.
- **Concurrency code tabs:** the code shown to learners uses real primitives (Python `threading`,
  Java `synchronized` and `java.util.concurrent`, C++ `std::mutex` and `std::condition_variable`).
  Real threads are not deterministic, so the drivers test the shown classes through
  deterministic calls (one thread, non-blocking `try_` operations, or a fixed hand-off order),
  and the page's model is what explores interleavings. Each page says so.

### 21.5 Shared pieces (new)

1. **Catalog:** a fifth pathway, `interviews` ("Coding interviews"), with the families below.
   The existing Techniques family (two pointers, sliding window, monotonic stack and queue) also
   lists `interviews` among its pathways.
2. **`src/viz/_patterns/`:** the naive-against-pattern setting and its counters, and the "Spot
   it" practice kind (a problem statement of ours, answer: the pattern).
3. **`src/viz/_threads/`:** the concurrency engine: a program is a few threads of steps (load,
   store, add, lock, unlock, wait, signal, P, V, print); a state is the threads' program
   counters, their registers, shared memory and the locks or semaphores; one operation runs one
   step of a chosen thread; another enumerates every interleaving (with a cap) and groups the
   outcomes; a wait-for graph finds deadlock (the DFS cycle check of /dfs/).
4. **`src/layouts/lanes.ts`:** threads as columns of steps, with the program counter in each,
   shared variables and locks beside them, and a timeline strip of the schedule so far.

### 21.6 Pages (39)

Tier 1 is what interviews ask most; tier 2 the rest; tier 3 advanced (`advanced: true`).

**Array and string tricks**

| id | Tier | What it shows (naive against pattern) | Practice |
|---|---|---|---|
| `prefix-sum-hashmap` | 1 (slice) | count the subarrays with sum k: every pair of ends (O(n²)) against running sums with a hash map of how often each sum was seen (O(n)) | the count; the map after step i; spot it |
| `difference-array` | 2 | many range additions: add to every cell against +x at l and −x at r + 1, then one prefix sum | an entry after the updates |
| `kadane` | 1 | maximum subarray: all pairs against "extend or restart" | the best sum; where it restarts |
| `dutch-flag` | 2 | three-way partition in one pass with three pointers (link /quick-sort/) | the array after step t |
| `cyclic-sort` | 2 | numbers 1..n: put each at its index by swaps; the missing and the duplicate fall out | the first index out of place |
| `matrix-traversal` | 2 | spiral order, rotating a square in place by layers, transpose and reverse | the cell visited k-th; a cell after the rotation |
| `frequency-counting` | 1 | anagrams and "first unique": sort each word against a 26-count signature; grouping by signature | the signature; the groups |

**Intervals**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `merge-intervals` | 1 | sort by start, then merge or start a new one; inserting one interval; intersecting two lists | the merged list; the next action |
| `sweep-line` | 2 | events sorted by time: the most intervals overlapping at once, and the skyline with a max-heap (link /interval-partitioning/, /binary-heap/) | the maximum overlap; the skyline point |

**Linked list tricks**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `fast-slow-pointers` | 1 | the middle node, the k-th from the end, a palindrome check, beside the cycle check of /floyd-cycle/ | where the slow pointer stops |
| `reverse-k-group` | 2 | reversing in groups of k by moving pointers (link /linked-list/) | the list after one group |
| `merge-sorted-lists` | 1 | merging two sorted lists with a dummy head; then k lists | the next node taken |

**Heap patterns**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `top-k` | 1 | the k largest: sort all, a min-heap of size k, quickselect (link /quickselect/), with comparison counts | the heap after step i; the cost of each |
| `k-way-merge` | 1 | merging k sorted lists with a heap of their heads | the next value out; the heap |
| `two-heaps-median` | 1 | the running median with a max-heap of the low half and a min-heap of the high half | the median after each value; which heap gets it |

**Search templates**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `binary-search-answer` | 1 | binary search over the answer, not the array: the smallest capacity that ships in d days, the largest minimum distance; the feasibility check | the next mid; the answer |
| `combination-sum` | 2 | backtracking for combinations with reuse, with duplicates skipped, and pruning by a sorted list (link /backtracking/) | the next branch; the count |
| `state-space-bfs` | 1 | BFS over states that are not stored as a graph: a combination lock, word changes one letter at a time (link /bfs/, /bidirectional-search/) | the distance; the next layer |

**Bit tricks**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `xor-tricks` | 2 | the single number, the missing number, swapping, splitting two singles by their lowest differing bit (link /bitmask/) | the running XOR; which group a value goes to |

**DP patterns**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `dp-grid-paths` | 1 | paths and minimum-cost paths on a grid with walls, top-down with memo against bottom-up | a cell's value; the path |
| `dp-state-machine` | 1 | buying and selling with a cooldown or a fee: states (holding, not holding, cooling down) and their transitions per day | a state's value on day t |
| `dp-interval` | 2 | the best order to merge or remove a row (bursting balloons, merging stones): solving every interval by its last step (link /dp-matrix-chain/) | an interval's value |
| `dp-tree` | 2 | the best set of non-adjacent nodes in a tree: two values per node, from the leaves up (link /binary-tree/) | a node's two values |
| `dp-bitmask` | 3 | assigning n tasks to n workers: a DP over subsets (link /bitmask/, /tsp/) | a subset's value |

**Design a data structure**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `min-stack` | 1 | a stack that returns its minimum in O(1): a second stack of minimums | the minimum after the operations |
| `two-stack-queue` | 1 | a queue from two stacks, with the amortized cost (link /amortized-analysis/) | which stack a value is in; the cost |
| `randomized-set` | 1 | insert, remove and a random element in O(1): an array plus a map from value to index, removing by swapping with the last | the array and map after a remove |
| `lfu-cache` | 3 | least-frequently-used eviction in O(1): frequency lists and a minimum frequency (link /lru-cache/) | what is evicted |
| `rate-limiter` | 2 | fixed window, sliding log, sliding window counter, token bucket on the same request times | which requests pass |

**Patterns map**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `pattern-map` | 1 | a map of problem cues to patterns and pages (new and existing); pick a cue and follow it | which pattern fits this problem (our own problem statements) |

**Concurrency**

| id | Tier | What it shows | Practice |
|---|---|---|---|
| `race-condition` | 1 (slice) | `count = count + 1` in two threads is load, add, store; schedule them to lose an update; enumerate every interleaving and count the outcomes | a schedule's final count; how many outcomes lose an update |
| `mutex` | 1 | a lock around the critical section; waiting threads; the lost update gone; contention as a readout | who holds the lock after step t |
| `semaphore` | 1 | counting semaphores: limiting to n at once, and making threads take turns (printing in order, alternating) | a semaphore's value; the order printed |
| `producer-consumer` | 1 | a bounded buffer with a mutex and two condition variables (or two semaphores); why the wait sits in a loop | the buffer after step t; who is waiting |
| `deadlock` | 1 | two locks taken in opposite orders; the wait-for graph and its cycle; fixing it by one global order | is this schedule deadlocked; the cycle |
| `dining-philosophers` | 2 | everyone takes the left fork: deadlock; fixes: one philosopher takes the right first, or a waiter (a semaphore of n − 1) | deadlock or not |
| `readers-writers` | 2 | a read-write lock; readers-first starves writers; a writer-first variant | who may enter |
| `barrier` | 2 | a barrier and a grouping problem (two of one kind and one of another leave together) built from semaphores | who passes the barrier |
| `compare-and-swap` | 3 | a lock-free counter with compare-and-swap retries; the ABA problem | how many retries |

### 21.7 Order of work

1. **10A, slices:** shared pieces 1 to 4, `prefix-sum-hashmap` (the naive-against-pattern
   setting and "Spot it") and `race-condition` (the thread engine and lanes). Yusuf looks at both
   before anything else is built.
2. **10B, interview tier 1** (16 pages) and **10C, concurrency tier 1** (4 pages), agents in
   parallel as in waves 9B to 9D, each followed by an independent fact check.
3. **10D, tier 2** (14 pages), then **10E, tier 3** (3 pages).
4. A deploy only on "deploy"; each deploy adds one release, which is emailed.

### 21.8 Risks

- **LeetCode's content:** we cannot read it from here and must not copy it; we teach patterns
  with our own problems, which is also what makes the pages ours.
- **Concurrency code tabs** cannot test real thread interleavings deterministically; the drivers
  test the classes through deterministic calls and the model owns the interleavings (21.4).
- **Interleaving counts explode:** two threads of 3 steps have 20 interleavings, three threads
  of 4 have 34 650; keep programs small and cap the enumeration, saying so on the page.
- **Overlap with existing pages:** each new page links the existing one it extends (merge
  intervals against interval partitioning, fast and slow pointers against cycle detection).
- **Scope:** 39 pages; the tiers let us stop after any wave.

### 21.9 Questions for Yusuf

1. Scope: the two slices, then interview tier 1 and concurrency tier 1 (20 pages), then tiers 2
   and 3 as with the AI pathway? Recommended: yes.
2. Pathway name "Coding interviews", with Concurrency as one of its families? Or Concurrency as a
   sixth pathway of its own ("Systems"), where later pages (memory, file systems) could join it?
   Recommended: a family inside Coding interviews for now; move it if a systems pathway comes.
3. List the existing Techniques family (two pointers, sliding window, monotonic stack and queue)
   under Coding interviews too? Recommended: yes.
4. Concurrency texts: OSTEP and The Little Book of Semaphores (both free)? Recommended: yes.
5. Concurrency code tabs as in 21.4 (real primitives shown, tested through deterministic calls)?
   Recommended: yes.
6. Anything to add or drop from 21.6?

### 21.10 Answers (Yusuf, 14 November: "1-5 yes. 6 all looks good. Implement all and then merge and deploy")

All five recommendations stand, and 21.6 as written. The slice review in 21.7 is dropped: build
all 39 pages, merge them into `next`, then deploy once (with the footer fix already on `next`,
and one release, which is emailed).

### 21.11 How it is built

- **Catalog first** (the lead): the `interviews` pathway, its ten families with all 39 ids, and
  the Techniques family listed under it too.
- **Round 1, two agents:** the interview kit (`_patterns`) with `prefix-sum-hashmap`, and the
  concurrency kit (`_threads`, `src/layouts/lanes.ts`) with `race-condition`.
- **Round 2, five agents, then round 3, four agents,** each building two to six pages on those
  kits; `pattern-map` last, when every page it links is live.
- **A fact check per round,** then the full suites and e2e on the merged tree, then the deploy.

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
