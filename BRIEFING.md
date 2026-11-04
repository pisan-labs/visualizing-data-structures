# BRIEFING

## Scope

Interactive visualizations of data structures and algorithms for university data
structures and algorithms courses. The 50 pages of the Galles/Lucet site are the reference
for coverage; we add every candidate in `PLAN.md` question 10 and possibly more. We write
all code ourselves.

Every visualization explains itself: step narration, highlighted pseudocode, live
variables, a concept page, and curated examples. Examples can be shared as links, saved in
the browser, exported as files, and embedded in Canvas.

## Key decisions (2026-11-04)

- **Stack:** Svelte 5, TypeScript (strict), and Vite. Tests use Vitest, fast-check, and
  Playwright with axe-core.
- **Engine:** operations are generators that yield immutable snapshot steps (state, marks,
  narration, pseudocode lines, variables, detail level, optional quiz prompt). Views are
  pure functions from a step to a scene of shapes with stable ids. The renderer
  interpolates between scenes and draws them as SVG.
- **Saved example:** settings + seed + the list of operations, plus a format version.
  Share links compress it into the URL hash.
- **Hosting:** Netlify, custom domain `<name>.pisan.me`. GitHub Actions runs CI.
- **License:** MIT for code; CC BY 4.0 for written explanations.
- **Conventions:** toggles wherever textbooks differ; CLRS is the default.
- **Pseudocode:** first; one real language after Phase 2.
- **Quiz mode:** the engine supports it from Phase 1; the UI comes after Phase 5.
- **Explanations:** Claude writes them in Yusuf's voice with no approval step; Yusuf edits
  as needed.
- **Pace:** as fast as the quota allows; no external deadlines.
- **Name:** pending; working name **Stepwise**, set in `src/site.ts`.

## Non-goals (v1)

- Accounts or server-side storage
- LTI grade passback
- Copying Galles/Lucet code
- Old browsers
- Analytics or tracking
