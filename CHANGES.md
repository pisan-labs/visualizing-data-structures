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
