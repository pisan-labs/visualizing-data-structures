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
