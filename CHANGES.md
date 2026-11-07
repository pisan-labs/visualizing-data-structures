# CHANGES

2026-11-04 [note] Surveyed cmps-people.ok.ubc.ca/ylucet/DS (Galles/Lucet): 50 pages, all load with no JS errors; controls inventoried in PLAN.md appendix A

2026-11-04 [plan] Drafted PLAN.md v0: own rebuild, step-snapshot engine, SVG, static hosting, Stack then BST as slices; 16 open questions before any code

2026-11-04 [decision] Answers recorded in BRIEFING.md and PLAN.md §11: Svelte 5, Netlify + <name>.pisan.me, MIT/CC BY 4.0, toggles (CLRS default), all additions, no deadlines

2026-11-04 [plan] Starting Phase 0 (scaffold, CI, Netlify config) and Phase 1 (Stack array vertical slice); working name Stepwise until a name is chosen

2026-11-04 [code] Phase 0: Svelte 5 + Vite + TS (strict), ESLint/Prettier, Vitest + fast-check, Playwright 1.63 + axe, netlify.toml, GitHub Actions CI

2026-11-04 [code] Phase 1 engine: generator ops yield snapshot steps; timeline with detail levels and history truncation; seeded RNG; examples as ops list in URL

2026-11-04 [code] Phase 1 UI: SVG scene tween by shape id, pan/zoom, transport, narration, pseudocode, variables, history, examples, learn tabs, themes, embed mode

2026-11-04 [code] Stack (array) live: top convention toggle (count vs index), capacity, layout; 6 curated examples; concept page in Yusuf's voice; 22 unit + 31 e2e tests

2026-11-04 [decision] Desktop layout puts narration, pseudocode and variables in a sticky right column so stage, controls and explanation fit at 1366x768

2026-11-04 [decision] Name is StepWise (capital W); final URL https://stepwise.pisan.me; Netlify site stepwise-pisan-labs connected, publishing locked by Yusuf for now

2026-11-04 [code] Prep for parallel agents: registry auto-discovers src/viz/*/index.ts, E2E_PORT env, browser test that covers every visualization, arrow head option

2026-11-04 [decision] Logo A (staircase of array cells, amber "current step" cell) applied after the 15-minute window; B and C kept in session notes; switch via public/favicon.svg and src/ui/Logo.svelte

2026-11-04 [note] stepwise.pisan.me set as primary domain on Netlify site stepwise-pisan-labs; Cloudflare CNAME created (DNS only) via claude-built-apps "Set Netlify domain" workflow

2026-11-04 [note] Three agents surveyed VisuAlgo, csvistool (Georgia Tech CS 1332) and Coddy; comparison and borrowed ideas in PLAN.md 3.3 (Coddy details are from search summaries: bot wall)

2026-11-04 [plan] PLAN v2: lessons, Big-O self-tests, practice sets, trace table, code tabs and URL proposals, build in waves of parallel agents; catalog grows to 108 pages (16 advanced)

2026-11-04 [decision] No answers to PLAN v2 questions within 15 minutes; all recommendations adopted (code tabs in 3 languages, per-page URLs, lessons, practice in wave 2, advanced in wave 4, English only, no code tracing, 4 agents, 2 pathways, feedback link, UTC+1)

2026-11-04 [code] Engine for wave 1: plain-English pseudocode, Big-O self-test rows, presets, code tabs (Python/Java/C++) run against the model in src/viz/code.test.ts; stricter conformance checks

2026-11-04 [code] UI for wave 1 features: Big-O tab (hidden answers, Watch it), code panel views (pseudocode, plain English, Python, Java, C++), presets (Start over with), Show me links, concept checks, lesson deep links (?lesson=)

2026-11-04 [code] Fix: long code lines widened the page on desktop (grid tracks now minmax(0, 1fr); cards may shrink); test covers it

2026-11-04 [code] Per-page URLs: /<id>/ pages prerendered with their own title, description, preview tags and canonical URL; state in the hash; old #/ links redirect; visualizations load on demand; sitemap and robots.txt

2026-11-04 [decision] Deploys only on request: work goes to dev (CI runs there), main = what Netlify publishes, moved with `git push origin dev:main` when Yusuf says deploy (15 credits each); adopted after the 15-minute window

2026-11-04 [code] Trace tab (one row per step, jump, copy as CSV or Markdown), prefilled GitHub feedback link on every page, catalog search with Data structures / Algorithms pathways, advanced and ready-only filters

2026-11-04 [code] Typed operation scripts in the History tab (edit and replay, line-numbered errors), -/+ speed keys, embed options (fixed theme, autoplay) in the link and the embed-code builder

2026-11-04 [code] Canonical versions of shared changes the agents duplicated: buttons with several values (ControlButton.args names), circles styled like cells, wrapped code blocks on concept pages; agents asked to merge dev

2026-11-04 [note] GitHub Issues turned on for pisan-labs/visualizing-data-structures; the per-page feedback link now works

2026-11-04 [code] Merged wave 1A: binary tree and traversals, BST (tidy binary-tree layout in src/layouts); "More operations" fold-out for less common buttons; desktop stage sized to keep playback in view; shared browser test race fixed; ESLint skips agent worktrees

2026-11-04 [code] Merged wave 1B: singly, doubly and circular linked lists, cycle detection (Floyd), linked-nodes layout in src/layouts/linked.ts; pointer dots drawn without a ring

2026-11-04 [code] Practice sets: seeded, browser-graded questions (choice, number, sequence) with Show me; assignment links (#practice=<seed>&n=); stack has 4 question kinds; shape drawing moved to Shapes.svelte; practice is part of the definition of done

2026-11-04 [code] Presentation mode: Present button hides site chrome, tabs and options, enlarges narration, code and variables, goes full screen; Escape leaves

2026-11-04 [code] Merged wave 1C: array queue and deque, dynamic array, sorted array, list-based stack, queue and deque (node-chain layout in src/layouts/node-chain.ts), with practice sets

2026-11-04 [code] Practice pictures crop to the drawn shapes (shapesBounds), so space a view reserves for animation no longer shows as blank bands; Vitest per-test timeout raised to 60 s for heavy property tests

2026-11-04 [code] Merged practice sets for binary-tree (traversals, level-order build, call-stack depth, queue size) and bst (height, delete replacement, select/rank, search path)

2026-11-04 [code] Fixed dev CI (red since the Practice tab): six tabs overflowed phones by 37 px with CI's wider font; tabs now go in rows of three in a narrow card, and the screen-fit test also runs with a wide font

2026-11-04 [code] Practice pictures scale to 0.8 to 1.25 px per unit where the screen allows: deep trees and tall stacks get more height, small lists are no longer blown up

2026-11-04 [code] Compare mode: /<page>/#compare=<other> runs the same operations on two pages side by side (each keeps its options; a side that finishes an operation waits); Compare menu lists same-family pages that can run this page's main operation

2026-11-04 [decision] Operations run while playback is going now queue after the last operation instead of replacing the queued ones; when paused they still replace what follows (as after an undo)

2026-11-04 [code] Merged wave 1D: linear and binary search (5 variants, refuses unsorted input), bubble, cocktail, selection, insertion, shell, merge, quick sort, quickselect; bars layout in src/layouts/bars.ts; all with practice

2026-11-04 [code] Scripts read a one-value, non-bulk operation the way its button does ("load 5 3 8 1" is one load); phones give the zoom buttons their own strip above the drawing

2026-11-04 [code] Merged wave 2E: AVL, red-black (CLRS cases, NIL leaves, black-height), splay (zig, zig-zig, zig-zag), treap (seeded or typed priorities); all with practice

2026-11-04 [decision] deriveSeed mixes the seed before the operation index: nearby seeds shared numbers (set 12346 repeated a question of set 12345). Random runs change; the two examples whose prose quotes random counts got new seeds that keep the same numbers

2026-11-04 [code] Long pseudocode scrolls inside the side column on desktop and follows the current line; long lines wrap at their indent instead of scrolling one by one on phones

2026-11-04 [code] Merged wave 2H: separate chaining, open addressing (linear, quadratic, double; tombstones), buckets, rehashing with amortized cost, LRU cache; all with practice

2026-11-04 [code] Fixed the intermittent doubly-linked-list conformance failure: insertAt at the end cited a sentinel-only pseudocode line with the sentinel off; regression test added

2026-11-04 [code] Presets receive the page's current settings (optional third argument), so a preset can suit them

2026-11-04 [code] Printable concept pages: a Print button on the Learn tab; print styles keep the title, explanation and checks in light colors and drop the drawing, controls and site chrome

2026-11-04 [doc] BRIEFING.md brought up to date: code tabs, practice sets and concept checks, instructor tools; the site is not published until the first deploy

2026-11-04 [decision] Yusuf approved session-relay (hourly reports only when there is news, daily handover check, fresh session when worthwhile); set up when wave 2 (G, F, I, J) is merged

2026-11-04 [decision] session-relay settings: Europe/Berlin; handover check 15:56, session start 16:52 (Yusuf's 5pm); hourly check at :46; HANDOFF.md at the repo root; the handoff is a commit on dev, not a PR

2026-11-04 [decision] All development moved from dev to main (consistent with Yusuf's other projects); dev retired; Yusuf deploys to Netlify by hand for now. session-relay's handoff commit goes on main

2026-11-04 [code] Merged wave 2F: B-tree (CLRS, t = 2 to 4, delete cases named), 2-4 tree (transfer, fusion), B+ tree (copy up vs push up, range over linked leaves), skip list (seeded coin flips); multiway layout in src/layouts/multiway.ts; all with practice

2026-11-04 [code] Fixed a B-tree conformance failure: a repeated insert with split-on-the-way-up returned the old state after showing the working copy; regression test added

2026-11-04 [code] Merged wave 2I: factorial (plain, tail, tail-call optimised), reversing a string, Fibonacci call tree with memo, recursion tree vs memoized DAG, N-Queens, backtracking (subsets, permutations, pruning); call stack and recursion tree layout in src/layouts/calls.ts; all with practice

2026-11-04 [code] Merged wave 2G: binary heap (CLRS max-heap, 1- or 0-based, two builds), leftist, skew, binomial queue, Fibonacci heap (consolidate, cascading cuts, potential), heap sort; heap and forest layouts; all with practice

2026-11-04 [code] Merged wave 2J: dynamic programming (Fibonacci, making change, LCS, edit distance, 0/1 knapsack) with a table layout in src/layouts/table.ts; counting, radix and bucket sort; all with practice

2026-11-04 [code] A page being replaced no longer rewrites the address after it is gone, and hash navigation reads the address it went to (a fast jump to #practice could lose the set); the B-tree readability test waits for animation to finish

2026-11-04 [doc] HANDOFF.md added for session-relay: hourly status report only when something is new, handover check 15:56 and session start 16:52 Europe/Berlin; routines trig_01YFFf7haBUVw55QnJE6zbfH, trig_019edEXqKvVwcMM1CsPVQpUD, trig_014pSjnKeCWEgQXUWgZECJGR

2026-11-04 [code] Merged wave 3K: graph model and one-line parser (edge list, adjacency list, matrix) in src/viz/_graph/, graph layout with state panels in src/layouts/graph.ts, graph representations, BFS and DFS; all with practice

2026-11-04 [decision] Compare mode pairs pages only when the second runs the first's main operation and one more from its main row ("clear" aside): sharing only "load" (a sort and a search, BFS and the representations page) no longer counts

2026-11-04 [code] The operation input widens on pages that take long input (graph text, strings to search)

2026-11-04 [code] CI run 31 failed on the skip list's "down" layout readability check on desktop (8.99994 px against 9 with CI's font); the check now applies on phones, which the layout is for. The short laptop stage is a known rough edge in HANDOFF.md

2026-11-05 [code] Merged wave 3L: brute-force search, KMP (prefix function or failure function), Boyer-Moore (Horspool or bad character plus good suffix), Rabin-Karp (rolling hash, spurious hits); alignment layout in src/layouts/align.ts; all with practice

2026-11-05 [code] Merged wave 3N: Dijkstra (CLRS decrease-key or lazy heap; refuses negative edges), Bellman-Ford (negative cycles drawn), DAG shortest and longest paths, Floyd-Warshall with path reconstruction; all with practice

2026-11-05 [code] Adjacency-matrix cells get their own id segment: a vertex named c or r made a cell's id equal a header's (found by the shortest-paths agent); regression test added

2026-11-05 [code] Merged wave 3R: prefix sums and sparse tables (range-queries), Fenwick tree (low bit shown in binary), segment tree with lazy propagation; columns layout in src/layouts/columns.ts; all with practice

2026-11-05 [code] Merged wave 3M: trie (pruning or lazy delete), compressed trie (splits and merges named), Huffman coding (forest priority queue, tie rule setting, encode and decode); trie layout in src/layouts/trie.ts; all with practice

2026-11-05 [code] The code-tab test's random scripts also try words that share prefixes, so word pages (tries) exercise edge splits in all three languages

2026-11-05 [decision] First handover moved to 06:50 at Yusuf's request (context at 80%, nothing running); the session-start routine now looks only for a marker commit made since 15:30 that day, so an early handover cannot start a second session at 16:52

2026-11-05 [note] Session session_01JyJzMZHCY1tEoov2vYAuJv took over the relay at 06:49 and moved the three StepWise routines; wave 4 started with four agents (13 pages), paused as WIP at the usage limit

2026-11-05 [code] Merged wave 4B: connected components (BFS, DFS or union-find), bipartite check (odd cycle drawn on failure), topological sort by in-degree (FIFO or smallest-first; cycle named); all with practice

2026-11-05 [code] Merged wave 4A: Prim (decrease-key or lazy), Kruskal (sorted edges, union-find forest, rejected edges dashed), disjoint sets (rank, size or naive; compression, halving or none); Prim and Kruskal share a start graph for compare mode

2026-11-05 [code] Merged wave 4D: memory model (frames, heap, aliasing; Python/Java or C++ setting), Big-O growth lab, recurrences and the Master theorem (recursion tree, CLRS or simplified cases), bitmasks and subsets

2026-11-05 [code] Merged wave 4C: topological sort by DFS (same start DAG as the in-degree page), SCC (Kosaraju or Tarjan, condensation graph), cut vertices and bridges (d/low, root rule); main now holds 87 of 108 pages

2026-11-05 [code] The "Show me" e2e checks share tests/e2e/helpers.ts showMe(): playback can end before the test looks for Pause (Boyer-Moore flaked in 4 agent runs), so a timeline that changed and stands at its end also counts

2026-11-05 [code] Merged wave 4H: convex hull (Graham, monotone chain, gift wrapping), polygon algorithms (shoelace, ray casting or winding, convexity), 2D change of coordinates, 2D rotation and scale; shared src/layouts/plane.ts; main holds 91 of 108 pages

2026-11-06 [code] Merged wave 4E (grid BFS, A* with heuristic and weight settings, suffix array with LCP; src/layouts/grid.ts), 4F (max flow and min cut, bipartite matching, min-cost flow; src/viz/_flow/) and 4G (Hungarian weighted matching, blossom general matching, 2-SAT); main holds 100 of 108 pages

2026-11-06 [code] The skip-list reference property test failed once on 5 November: no counterexample in 2000 more cases, but it takes 15 s alone and about 42 s under load against the 60 s default timeout; it now has an explicit 180 s budget

2026-11-06 [code] Merged wave 4J: suffix tree (naive insertion or Ukkonen with active point and suffix links), NP-completeness reductions map (five steppable reductions with certificate checks); main holds 102 of 108 pages

2026-11-06 [code] Merged wave 4K: traveling salesperson (tree walk, nearest neighbour, Held-Karp, 2-opt), minimum vertex cover (matching, greedy, exact), Steiner tree (metric-closure approximation, exact); src/viz/_approx/kit.ts; main holds 105 of 108 pages

2026-11-06 [code] tests/e2e/dfs.spec.ts readability check polls its text heights: right after stepping back, fading-in shapes measure 0 px (flaked once under full-suite load)

2026-11-06 [code] Merged wave 4I: 2D rotation and translation (homogeneous or 2x2 plus offset), 3D rotation and scale (isometric or oblique), 3D change of coordinates; src/layouts/space.ts; all 108 catalog pages are on main

2026-11-06 [code] Arrow lines take their role colour (found, new, done thicker, compare, visit, remove) with matching heads; the preset select cannot widen past the screen; sizes: [] hides the preset size select. The {A} leftover check stays strict: it also catches a missing $ such as {CAPACITY}

2026-11-06 [code] Eight group roles g1 to g8 (GroupRole, groupRole(k)) with their own colours in the light, dark and contrast themes; connected components, SCC and 2-SAT use them instead of cycling five state colours

2026-11-06 [code] Axe scans wait for the drawing to settle (tests/e2e/helpers.ts settled()): the factorial contrast scan failed once under load on phone, likely a shape caught mid-fade, and passed 8 of 8 alone; all 372 axe tests pass

2026-11-06 [code] A polygon shape kind (filled area, tinted by role, drawn behind lines; corners interpolate when their count matches); drawPolygon takes fill; the polygon page tints the polygon and each shoelace triangle

2026-11-07 [decision] Handover at Yusuf's request (context about 50%, no agents running); the previous session starts the next one at once

2026-11-07 [note] Session session_01JyJzMXcc2unSAwN88hsew5 took over at 08:00 and moved the three relay routines; Netlify auto-publishing is unlocked again (the live site still served a build from early 5 November)

2026-11-07 [decision] Small drawings on laptops: Yusuf chose option 3 (a taller desktop stage first, then views that lay out for the stage); stage 305 to 387 px, Options in the side column, view(step, settings, stage) used by the 26 graph pages

2026-11-07 [plan] Wave 5, automata and computability (PLAN.md section 13): 17 pages in three waves, Sipser conventions, a typed machine format; defaults taken at 08:45 with no answer

2026-11-07 [code] Automata groundwork: src/viz/_automata (model, subset construction, minimization, regex and Thompson, text format), state diagrams (src/layouts/automaton.ts), a tape layout, curved arrows (ArrowShape.via)

2026-11-07 [decision] Deploys: work goes to next; main (which Netlify publishes, 15 credits each) fast-forwards to next daily at 17:27 Europe/Berlin or when Yusuf says "deploy"

2026-11-07 [decision] Yusuf confirmed the automata defaults (PLAN.md decisions 29 to 33)

2026-11-07 [code] Merged wave 5A: dfa, nfa, nfa-to-dfa, dfa-minimization, regex-to-nfa, turing-machine (src/viz/_turing); the agents recommend moving their page kits (dfa/kit.ts, nfa-to-dfa/kit.ts) and label placement into the shared automata code

2026-11-07 [decision] Catalog thumbnails: Yusuf chose animated SVG drawn from data over GIF (all themes, about 1.5 KB a page), left of each title, play on hover or focus, text stripped; pilot family Trees

2026-11-07 [code] Trees thumbnails: VizDef.preview names an example; src/render/preview.ts strips it to shapes in one frame; prerender writes dist/previews.json and the dev server makes it on request

2026-11-07 [code] Thumbnails for all 108 pages; posters show the fullest frame; input and output boxes always hidden; no arrowheads in thumbnails; graph and geometry pages hide side tables and matrix brackets

2026-11-07 [code] Merged the grammar pages (cfg-derivation, cyk) and src/viz/_grammar (parser, CNF with stages, CYK, derivation search, Chomsky level of a grammar)

2026-11-07 [code] Option 3 step 2: 15 more pages arrange their parts for the stage (src/viz/_stage/arrange.ts, src/viz/_dp/strip.ts); 27 others left as they read fine or their layout sets the scale

2026-11-07 [code] Merged the consolidated automata code: shared page kit, panels, one label placement in drawAutomaton (label collisions on the six pages from thousands to 51), tape and trace layouts, regex and Thompson fixes, set notation allowed by the conformance check

2026-11-07 [code] Merged wave 5B: pda (src/viz/_automata/pda.ts, nondeterminism by breadth-first search with a 200-configuration cap) and chomsky-hierarchy (classify a grammar level by level, place 11 languages with their reasons); wave 5B is done

2026-11-07 [code] Merged main (catalog thumbnails, PR #1) into next; previews for the 10 automata and grammar pages; thumbnails drop arrowheads on curved arrows too

2026-11-07 [note] No handover at the 15:56 check: context about 18% after a compaction (the 55% first given was from before it)

2026-11-07 [note] The 17:27 daily deploy was blocked by the session's auto-mode permission check (production deploy); main stays at 92b03fe until Yusuf decides

2026-11-07 [code] Merged dfa-to-regex (wave 5C): state elimination through a GNFA; settings rip order (name, fewest paths first) and simplification (empty-set and epsilon identities, none)

2026-11-07 [code] Merged product-construction (wave 5C): union, intersection, difference, symmetric difference and complement of two DFAs, drawn as a grid of pairs; input A | B
