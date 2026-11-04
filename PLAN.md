# Visualizing Data Structures: Plan

Draft v0, 2026-11-04. Status: **waiting on answers to the open questions (section 11)**.
No code has been written yet. Once the questions are answered, the decisions move to
`BRIEFING.md` and this plan gets a v1.

---

## 1. Goal

Build our own interactive data-structure and algorithm visualizations. We use the
Galles/Lucet site (<https://cmps-people.ok.ubc.ca/ylucet/DS/Algorithms.html>, based on
<https://www.cs.usfca.edu/~galles/visualization>) as a reference for coverage and behavior,
and we fix its main weaknesses:

| Weakness today | What we build instead |
|---|---|
| Looks dated; fixed 1000×500 canvas | Modern UI that scales from phone to lecture projector, with light/dark/high-contrast themes |
| Not responsive | Layout that adapts to screen size; pan/zoom and pinch on the drawing |
| Examples cannot be saved | Share links, a saved-examples library, file export/import, embed mode, and curated examples |
| Little explanation | Step-by-step narration, highlighted pseudocode, live variables, a concept page per topic, and "predict the next step" questions |
| Missing features | See section 4 |

The long-term target is every visualization on the existing site (50 pages, section 3.1),
plus additions you choose (question 10).

## 2. Proposed non-goals (for v1)

- User accounts or server-side storage. Saving works without a server; see 4.3.
- LMS grade passback (LTI). An iframe embed in Canvas is in scope; graded integration is not.
- Copying Galles/Lucet code. We write our own and use their site only to see which
  operations and options exist and how they behave.
- Old browsers. We target current Chrome, Edge, Firefox and Safari, including iOS and Android.
- Analytics or tracking (question 13).

## 3. What the existing site taught us

### 3.1 Inventory

I checked the site on 2026-11-04. It has **50 pages, and all of them load with no
JavaScript errors.** The comparison-sort page holds 6 algorithms, so there are 55
algorithms in all. Appendix A lists every page with its controls.

| Family | Pages |
|---|---|
| Basics | Stack (array, linked list), Queue (array, linked list) |
| Recursion | Factorial, Reverse string, N-Queens |
| Indexing | BST, AVL, Red-Black, Splay, Skip list, Open hash, Closed hash, Closed hash with buckets, B-tree, B+ tree |
| Sorting | Comparison sorts (bubble, selection, insertion, shell, merge, quick), Bucket, Counting, Radix, Heap sort |
| Strings | Boyer-Moore, KMP, Trie, Compressed trie, Huffman |
| Heap-like | Binary heap, Binomial queue, Fibonacci heap, Leftist heap, Skew heap |
| Graphs | BFS, DFS, Connected components, Dijkstra, Prim, Topological sort (indegree, DFS), Floyd-Warshall, Kruskal |
| Dynamic programming | Fibonacci, Making change, LCS |
| Geometry | 2D rotate/scale, 2D rotate/translate, 2D change of coordinates, 3D rotate/scale, 3D change of coordinates |
| Other | Disjoint sets |

### 3.2 Features worth keeping

- Full undo history. Step back can walk back through every earlier operation, not only the current one.
- Play/pause, step forward/back, skip, and a speed slider.
- Variant switches that teach something:
  - Red-black: show null leaves.
  - Leftist heap: show null path lengths.
  - B-tree: max degree 3–7, and preemptive split/merge.
  - Disjoint sets: path compression, union by rank, and two rank definitions.
  - Closed hashing: linear, quadratic, or double hashing.
  - Binomial and Fibonacci heaps: logical vs internal representation.
- Graph pages show the same graph three ways: drawn, adjacency list, and adjacency matrix.
- DP pages run the same problem three ways: recursive, memoized, and table, plus greedy for making change.
- Skip list lets the student type the coin flips, so its "random" behavior can be reproduced.

### 3.3 Problems to fix

- **Algorithm logic is mixed with drawing.** Each operation emits drawing commands with
  pixel coordinates, for example `cmd("Move", id, xpos, ypos)` in `StackArray.push`.
  Layout is hand-placed per page, the code can't be tested without a canvas, and every
  command needs a hand-written undo.
- **String comparison everywhere.** The FAQ admits that "-2" sorts before "-3". We give
  numeric keys numeric order and make string keys an explicit choice.
- **Fixed canvas.** Per the FAQ, phone users must type in a smaller canvas size, which is
  then stored in a cookie. Sorting pages need 900 px of width and graphs need 1000 px.
- **No narration or pseudocode.** Only a few on-canvas labels, such as "Pushing Value:".
- **Limited input.** One value per operation, with no bulk entry and no random fill for
  trees. Graphs come only from "New Graph" (random); students can't build their own graph.
- **No saving or sharing.** All work is lost on reload.
- **Small gaps in coverage.** The array stack has a fixed capacity of 30 and no resizing.
  There is no general linked list, no deque, and no rehashing.

## 4. Features

### 4.1 Core experience (every visualization)

- A timeline over the whole session history, with:
  - play/pause, step back/forward, and jump to the start or end of an operation;
  - a scrubber you can drag;
  - a speed setting.
- **Detail level.** Each step is tagged as a milestone, normal, or fine detail (for
  example, every comparison). Students choose how deep to go, and coarse playback skips
  the fine steps.
- **History panel.** A list of the operations done so far. Clicking one jumps to it;
  editing and replaying the list makes "what if I had inserted 40 first?" quick to try.
- **Counters** where they mean something: comparisons, swaps, array accesses, rotations,
  probes.
- **Invariant overlays** you can toggle:
  - BST order, AVL balance factors, red-black properties, heap order, B-tree fill;
  - violations are highlighted during the rebalancing steps.
- Keyboard shortcuts: Space toggles play/pause; ← and → step; PageUp/PageDown also step,
  so a presentation clicker can drive the animation.

### 4.2 Explanation layer

- **Narration** on every step, for example: "15 < 20, so go to the left child." It is
  also read out to screen readers.
- A **pseudocode panel** that highlights the line currently running. Pseudocode comes
  first; a C++ (or other language) toggle is question 2.
- A **variables panel** showing values such as `top`, `i`, `j`, `pivot`, `lo`, `hi`, and
  `current`.
- A **concept page** per visualization:
  - the idea in a few paragraphs;
  - operations with their best, average, and worst cost;
  - invariants and common mistakes;
  - related structures;
  - "try this" prompts that each link to a prepared example.
- **Predict the next step** (quiz mode): at decision points the animation pauses and
  asks, for example, "Which node becomes the new root?" The student answers by clicking,
  then gets feedback. The engine supports this from day one; when the UI gets built is
  question 11.

### 4.3 Saving and sharing (no server needed)

1. **Share link.** The example is compressed into the URL, which works in Canvas,
   Discord, and email. Large examples fall back to a file.
2. **My examples.** Named examples saved in the browser. The UI warns that clearing
   site data deletes them.
3. **Export/import** of examples as `.json` files. This is the durable copy.
4. **Embed mode** (`?embed=1`): minimal controls for an iframe in Canvas pages or slides.
5. **Curated examples.** Instructor-written examples stored in the repo and shown in a
   per-visualization gallery, for example "AVL double rotation" or "delete a node with
   two children."
6. **Image export** of the current step as PNG or SVG. Animated GIF/video comes later.

An example stores the starting settings and the list of operations, not pictures, so the
files stay small:

```json
{
  "format": 1,
  "viz": "bst",
  "title": "Delete a node with two children",
  "settings": { "keys": "number", "deleteWith": "successor" },
  "seed": 42,
  "ops": [["insert", 50], ["insert", 30], ["insert", 70], ["insert", 60], ["delete", 50]],
  "at": { "op": 4, "step": 0 },
  "notes": "Watch where 60 ends up."
}
```

Randomness (skip-list coin flips, random graphs, shuffled arrays) comes from a seeded
generator, so every replay is identical. The `format` field lets old links keep working
after the code changes, and CI replays every curated example to catch breakage.

### 4.4 Input

- **Key type**: numbers, which sort numerically (the default), or strings, which sort
  alphabetically.
- **Bulk entry** (`50 30 70 20 40`), **random fill** with a chosen size, and **presets**
  such as sorted, reverse-sorted, and many duplicates. Presets matter for showing worst
  cases.
- A **graph editor**:
  - click to add vertices, drag to connect them, edit weights;
  - directed or undirected;
  - import and export as an edge list;
  - sample graphs.
- Clicking nodes and cells in the drawing to act on them, as well as typing values.

### 4.5 Responsive and accessible

- Wide screens show the drawing with side panels. Phones stack them, and the panels
  become tabs.
- The drawing scales to its container, with pan, zoom, and fit-to-screen.
- WCAG 2.2 AA:
  - every control works from the keyboard;
  - color is never the only signal (labels and shapes as well);
  - motion respects `prefers-reduced-motion`;
  - narration goes to an ARIA live region.
- Light, dark, and high-contrast themes.

### 4.6 Instructor features

- **Presentation mode**: large type, full screen, hidden extra controls, clicker-friendly.
- **Compare mode** (later): two visualizations side by side on the same input, such as
  BST vs AVL, or quicksort vs merge sort racing.
- Embed and curated examples, as described in 4.3.

## 5. Architecture

### 5.1 Step model

Each operation is a TypeScript generator over an immutable model of the data structure.
It yields one step per moment a student can pause on:

```ts
interface Step<S> {
  state: S;                       // snapshot of the data structure at this moment
  marks: Mark[];                  // element ids + role: compare | visit | swap | new | remove | found | error
  say: string;                    // narration
  lines: string[];                // pseudocode line ids to highlight
  vars?: Record<string, Scalar>;  // top, i, j, pivot ...
  level: 1 | 2 | 3;               // milestone, normal, fine detail
  ask?: Prompt;                   // optional "predict the next step" question
}

type Operation<S, A extends unknown[]> =
  (state: S, ...args: A) => Generator<Step<S>, S>;
```

The timeline runs the operations and stores their steps. Stepping back means moving to
the previous step, so there is no undo code to write.

Each view is a pure function, `view(state, marks) → Scene`. A scene is a list of shapes
(cells, nodes, edges, labels, pointers), each with a **stable id**. The animator matches
shapes between two scenes by id:

- shapes in both scenes slide or recolor;
- new shapes fade or grow in;
- removed shapes fade out.

### 5.2 Why steps instead of the legacy command lists

| | Command list (Galles/Lucet) | Steps (proposed) |
|---|---|---|
| Algorithm code | Mixed with drawing commands and pixel coordinates | Only about the data structure |
| Step back / undo | Each command needs an inverse | Go to the previous snapshot |
| Testing | Needs a canvas | Plain unit tests on states |
| Narration and pseudocode | Not supported | Built into every step |
| Layout | Hand-placed per page | Shared layout engines (5.4) |
| Special motions (a value flying along a path) | Easy | Need transient "ghost" elements in the step |
| Memory | Small | One snapshot per step: fine at teaching sizes, with structural sharing if ever needed |

### 5.3 Rendering: SVG

SVG is sharp at any size, follows the CSS themes, and is easy to click on. Its elements
can also carry accessible names. Canvas would only pay off with thousands of elements,
far beyond teaching sizes. The 3D geometry pages, if kept, would use a separate WebGL
renderer (Three.js).

### 5.4 Shared layout engines

| Layout | Used by |
|---|---|
| Array / cells (with wraparound, circular view, bars) | Array stack and queue, dynamic array, all sorts, hashing tables, counting/radix/bucket sort |
| Linked nodes and pointers | Linked-list stack and queue, linked lists, separate chaining, skip list |
| Binary tree (tidy layout) | BST, AVL, red-black, splay, heaps, leftist, skew, Huffman |
| Multiway tree / forest | B-tree, B+ tree, trie, compressed trie, binomial, Fibonacci, disjoint sets |
| Graph (placed or preset positions) plus adjacency list and matrix | All graph algorithms |
| Table / matrix | DP tables, KMP failure function, Boyer-Moore tables, Floyd-Warshall |
| Call stack and recursion tree | Factorial, reverse, N-Queens, recursive DP |
| Board | N-Queens |
| 2D/3D coordinate space | Geometry pages |

The roadmap is ordered so that each phase adds one layout engine and then reuses it.

### 5.5 Tech stack

Common to every option:

- TypeScript (strict) and Vite;
- Vitest, fast-check (property-based tests), and Playwright with axe-core;
- ESLint and Prettier;
- GitHub Actions for CI;
- static hosting.

The UI framework is an open choice (question 4):

| Option | Pros | Cons |
|---|---|---|
| **Svelte 5** | Small output; SVG with keyed lists is natural; simple to read | Fewer students know it; smaller ecosystem |
| **React** | Most familiar to students and contributors; biggest ecosystem | Heavier; its rendering model is a poor fit for per-frame animation (we would bypass it in the animator) |
| **Vanilla TS + Web Components** | No framework churn; longest shelf life | More hand-written plumbing for ~50 control panels |

**Recommendation: Svelte 5.** Choose React if you expect students to contribute. The
engine and layouts are plain TypeScript either way, so switching frameworks later would
only mean rewriting the UI layer.

Hosting (question 5):

| Option | Pros | Cons |
|---|---|---|
| **GitHub Pages** | Free; lives with the code; deploys from Actions | No built-in preview link per pull request |
| Cloudflare Pages / Netlify | Free tier; preview link per pull request | Another account to manage |

**Recommendation: GitHub Pages.** Routing uses the URL hash (`#/bst?ex=...`), so no
server rewrite rules are needed.

### 5.6 Repository layout

```
src/
  engine/      step model, timeline, seeded RNG, example (de)serialization
  render/      scene diff and tween, SVG shapes, pan/zoom
  layouts/     array, linked, binary-tree, multiway-tree, graph, table, call-stack
  ui/          app shell, catalog page, control bar, panels, settings, themes
  viz/
    stack-array/
      model.ts           state type and operations (generators)
      view.ts            state → scene
      pseudocode.ts      lines with ids
      Controls.svelte    operation inputs
      explain.md         concept page
      examples/*.json    curated examples
      stack-array.test.ts
tests/e2e/     Playwright
```

## 6. Quality

- **Unit tests** for every visualization:
  - each operation's final state matches a simple reference implementation;
  - invariants hold on **every** step, not just at the end;
  - property-based tests run random sequences of operations.
- **Shared checks** across all visualizations:
  - every step has narration;
  - every pseudocode line id exists;
  - every curated example replays.
- **End-to-end tests:**
  - a smoke test per visualization at desktop and phone sizes;
  - a share-link round trip;
  - a keyboard-only run;
  - an axe accessibility scan.
- **Performance targets.** These are goals I have not yet measured:
  - first load of the shell plus one visualization under 150 KB gzipped;
  - each visualization loaded on demand;
  - smooth animation with up to ~200 shapes on a mid-range phone.
- **CI** runs lint, type check, unit tests, and end-to-end tests on every push. Pushes to
  `main` deploy automatically.

## 7. Roadmap

Sizes are relative (S < M < L < XL). I have no calendar estimates yet; the first two
phases will show the real pace.

| Phase | Content | Adds | Size |
|---|---|---|---|
| 0 | Repo setup, CI, deploy pipeline, `BRIEFING.md` | | S |
| **1** | **Vertical slice: Stack (array)** | Engine, timeline, array layout, panels, saving, responsive shell | L |
| ✔ | **Checkpoint: you review it live** | | |
| **2** | **Second slice: BST** (insert, delete, find, min/max, four traversals, bulk/random fill) | Binary tree layout, subtree motion | M–L |
| ✔ | **Checkpoint: review; freeze engine API v1** | | |
| 3 | Linear: Stack (linked list), Queue (circular array), Queue (linked list); additions: linked lists, dynamic array | Linked layout | M |
| 4 | Sorting: 6 comparison sorts, counting, radix, bucket; counters; race mode | Bars, counters | L |
| 5 | Balanced trees: AVL, red-black, splay | Rotations, invariant overlays | L |
| 6 | Heaps: binary heap (array and tree views), heap sort, leftist, skew, binomial, Fibonacci | Multiway forest | L |
| 7 | Hashing: chaining, open addressing (3 probe types), buckets; addition: rehashing | | M |
| 8 | Recursion: factorial, reverse, N-Queens | Call stack, recursion tree, board | M |
| 9 | Graphs: editor and 3 views, BFS, DFS, components, both topological sorts, Dijkstra, Prim, disjoint sets, Kruskal, Floyd-Warshall | Graph layout and editor | XL |
| 10 | Multiway and strings: B-tree, B+ tree, trie, compressed trie, skip list, Huffman, KMP, Boyer-Moore | | XL |
| 11 | DP: Fibonacci, making change, LCS (plus additions) | Table and recursion tree together | M |
| 12 | Geometry, 2D and 3D (if in scope, question 9) | WebGL renderer | L |
| 13 | Ongoing: quiz mode everywhere, compare mode, GIF/video export, more curated examples | | — |

The order follows reuse of the layout engines and a typical data-structures course.
Question 8 is whether to reorder it to match your course calendar.

### Phase 1 exit criteria (vertical slice)

The Stack (array) visualization is live at a public URL and has:

- push, pop, peek, and clear, with an overflow message at capacity;
- play/pause, step back and forward across the whole history, scrubber, speed, and detail level;
- narration, highlighted pseudocode, and a variables panel;
- share link, My examples, JSON export/import, and embed mode;
- correct behavior at 375 px phone width and on a 1920 px projector, plus dark mode,
  keyboard shortcuts, and reduced motion;
- a concept page for stacks and three curated examples;
- unit, end-to-end, and accessibility tests passing in CI;
- a catalog page listing what exists.

## 8. Definition of done (per visualization)

1. Operations implemented as step generators that follow the chosen textbook's
   conventions (question 12).
2. Unit tests: comparison against a reference implementation, invariants on every step,
   and property-based tests.
3. Every step narrated and mapped to pseudocode lines.
4. A concept page with the idea, a cost table, invariants, common mistakes, and
   "try this" prompts.
5. At least 3 curated examples, one for each tricky case.
6. Works at phone and projector sizes and from the keyboard alone; the axe scan is clean.
7. Share link and embed covered by end-to-end tests.
8. Listed in the catalog with a thumbnail.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Tree and graph animations look jumpy or the layout shifts unexpectedly | BST comes second, to test this early; stable ids; tidy-tree layout; review checkpoint |
| Narration and concept pages for 50+ visualizations are a lot of text | I draft from a template and you review; per-visualization checklist |
| Scope creep (50 pages + additions + features) | Phase exit criteria; additions wait until the original 50 are done unless you rank them higher |
| Saved links break when an algorithm changes | Format version field; CI replays every curated example |
| Big graphs and B-trees are too large for phones | Pan, zoom, fit-to-screen; smaller presets on phones |
| Browser storage gets cleared and saved examples vanish | Share links and file export are the durable copies, and the UI says so |
| Framework churn over the years | Engine and layouts in plain TypeScript; thin UI layer |

## 10. Licensing and credit

We write our own code. The Galles/Lucet code is under the FreeBSD license, so copying it
would be allowed with their notice, but we don't need to. The About page will credit
both projects as inspiration. For our own license, see question 6.

## 11. Open questions

Questions marked **[blocks slice]** need an answer before Phase 1 starts. The rest can wait.

1. **Audience.** Which courses and levels is this for? This sets the depth of the
   explanations and which families come first. *(No recommendation; I need to know.)*
2. **[blocks slice] Code panel language.** Pseudocode only, or pseudocode plus C++ (or
   Java or Python)? Each extra language has to be mapped step by step and kept in sync.
   *Recommendation: pseudocode now; add one real language after Phase 2 if your courses
   need it.*
3. **[blocks slice] Saving scope.** Is the no-server approach in 4.3 enough for v1? Or do
   you need accounts and cloud storage, or a way for students to submit saved work to you?
   *Recommendation: no server in v1.*
4. **[blocks slice] UI framework.** Svelte 5, React, or vanilla (5.5)? Do you expect
   student contributors? *Recommendation: Svelte 5, or React if students will contribute.*
5. **[blocks slice] Hosting.** GitHub Pages on `pisan-labs`? Is the repo public, or may
   it become public? Do you want a custom domain? *Recommendation: public repo, GitHub
   Pages, no custom domain for now.*
6. **[blocks slice] License.** *Recommendation: MIT for code, CC BY 4.0 for written
   explanations.*
7. **[blocks slice] Slices.** Stack (array) first, then BST, with a review after each?
   *Recommendation: yes.*
8. **Order and deadlines.** Should the phases after the slices follow your course
   calendar? Is there a date by which a specific set must be live, such as the start of
   a quarter? *(No recommendation; depends on your schedule.)*
9. **Geometry pages** (5 pages on 2D/3D matrix transforms): in scope? They are graphics
   rather than data structures. *Recommendation: keep them, but last.*
10. **Additions** beyond the existing 50 pages. Candidates: singly and doubly linked
    lists, dynamic array resizing, deque, binary search, treap, hash rehashing,
    Bellman-Ford, strongly connected components, A*, edit distance, 0/1 knapsack,
    quickselect. *Recommendation: linked lists, dynamic array, and rehashing early
    (Phases 3 and 7); the rest after the original set.*
11. **Quiz mode timing.** *Recommendation: engine support in Phase 1, UI after Phase 5,
    when there are enough decision-heavy visualizations (rotations, sorts) to use it.*
12. **Textbook conventions.** Which textbook should behavior match? This decides choices
    like the BST delete rule (successor or predecessor), min- or max-heap, how B-tree
    degree is defined, and which red-black variant to use. *Recommendation: name your
    textbook; otherwise CLRS conventions, with toggles where variants matter.*
13. **Analytics.** *Recommendation: none, for student privacy.*
14. **Name and look.** A site name? UW colors or neutral? *Recommendation: a neutral
    look with its own palette; you pick the name.*
15. **Canvas embedding** in v1? *Recommendation: yes; it is cheap once share links exist.*
16. **Who writes explanations?** *Recommendation: I draft from a template and you review
    and edit.*

---

## Appendix A: Existing pages and their controls

Captured from the live site on 2026-11-04.

| Page | Controls today |
|---|---|
| StackArray | value; Push, Pop, Clear (fixed capacity 30) |
| StackLL | value; Push, Pop, Clear |
| QueueArray | value; Enqueue, Dequeue, Clear |
| QueueLL | value; Enqueue, Dequeue, Clear |
| RecFact | n; Factorial |
| RecReverse | string; Reverse |
| RecQueens | board size 1–8; Queens |
| BST | Insert, Delete, Find (one value each); Print |
| AVLtree | Insert, Delete, Find; Print |
| RedBlack | Insert, Delete, Find; Print; show null leaves |
| SplayTree | Insert, Delete, Find; Print |
| SkipList | key, coin flips (e.g. 110100); Lookup, Insert, Remove |
| OpenHash | Insert, Delete, Find; hash integers or strings |
| ClosedHash | Insert, Delete, Find; integers or strings; linear, quadratic, or double hashing |
| ClosedHashBucket | Insert, Delete, Find; integers or strings |
| BTree | Insert, Delete, Find, Print, Clear; max degree 3–7; preemptive split/merge (even degrees) |
| BPlusTree | Insert, Delete, Find, Print, Clear; max degree 3–7 |
| ComparisonSort | Randomize, Change size; Insertion, Selection, Bubble, Quick, Merge, Shell |
| BucketSort | Randomize; Bucket sort |
| CountingSort | Randomize; Counting sort |
| RadixSort | Randomize; Radix sort |
| HeapSort | Randomize; Heap sort |
| BoyerMoore | text, pattern; Search, Reset |
| KnuthMorrisPratt | text, pattern; Build failure function, Search, Reset |
| Trie | key; Lookup, Insert, Remove |
| CompressedTrie | key; Lookup, Insert, Remove |
| Huffman | text; Build tree, Reset |
| Heap | value; Insert, Remove smallest, Clear, BuildHeap |
| BinomialQueue | value; Insert, Remove smallest, Clear; logical or internal view |
| FibonacciHeap | value; Insert, Remove smallest, Clear; logical or internal view |
| LeftistHeap | value; Insert, Remove smallest, Clear; show null path lengths |
| SkewHeap | value; Insert, Remove smallest, Clear |
| BFS | start vertex; Run; New graph; directed or undirected; small or large; drawn, adjacency list, or matrix view |
| DFS | same as BFS |
| ConnectedComponent | Run; New graph; small or large; 3 views |
| Dijkstra | same as BFS |
| Prim | start vertex; Run; New graph; small or large; 3 views |
| TopoSortIndegree | Run; New graph; small or large; 3 views |
| TopoSortDFS | Run; New graph; small or large; 3 views |
| Floyd | Run; New graph; directed or undirected; small or large; 3 views |
| Kruskal | Run; New graph; small or large; 3 views |
| DPFib | n; Recursive, Table, Memoized |
| DPChange | amount; Recursive, Table, Memoized, Greedy; coins [1,5,10,25] or [1,4,6,10] |
| DPLCS | S1, S2; Recursive, Table, Memoized |
| RotateScale2D | angle, scale x/y; Transform; row or column major; +y up or down; rotate-then-scale or scale-then-rotate; Change shape |
| RotateTranslate2D | angle, translate x/y; Transform; row or column major; +y up or down; Change shape |
| ChangingCoordinates2D | x, y; Transform point; hand→world or world→hand; row or column major; show all axes; Move objects |
| RotateScale3D | x/y/z angle; Rotate; x/y/z scale; Scale; row or column major; Change shape |
| ChangingCoordinates3D | x, y, z; Transform point; hand→world or world→hand; row or column major; show all axes; Move objects |
| DisjointSets | Find, Union; path compression; union by rank; rank = number of nodes or estimated height |
