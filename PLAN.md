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
- **To add:**
  - presentation mode;
  - compare mode, moved earlier to wave 2 (BST vs AVL, Kruskal vs Prim, heap as array vs tree);
  - printable concept pages;
  - assignment links (see 4.7);
  - catalog pathways ("Data structures", "Algorithms").

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
| 24 | Feedback | Prefilled GitHub issue link on every page; needs issues turned on (12.10) |
| 25 | Time zone | UTC+1 assumed for reports (12.11) |
| 26 | Deploys | Work goes to `dev` (CI runs there); `main` is what Netlify publishes and moves only when Yusuf says "deploy" (`git push origin dev:main`). Each production deploy costs 15 Netlify credits |

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
