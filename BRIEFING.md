# BRIEFING

## Scope

Interactive visualizations of data structures and algorithms for university data
structures and algorithms courses. The 50 pages of the Galles/Lucet site are the reference
for coverage. The plan adds the candidates from VisuAlgo, csvistool and Coddy (`PLAN.md`
Appendix B): 108 planned pages in `src/viz/catalog.ts`, 16 of them marked advanced. We write
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
- **Hosting:** Netlify site `stepwise-pisan-labs`, domain `stepwise.hintwise.org` (`stepwise.pisan.me` redirects to it). All work goes to
  `main`, as in Yusuf's other projects, and Yusuf deploys to Netlify by hand for now. GitHub
  Actions runs CI on every push.
- **License:** MIT for code; CC BY 4.0 for written explanations.
- **Conventions:** toggles wherever textbooks differ; CLRS is the default.
- **Code:** pseudocode in formal and plain-English forms, synced with the steps, plus static
  Python, Java and C++ tabs that CI runs against the model.
- **Self-testing:** concept checks on the concept pages, a Big-O self-test, and seeded practice
  sets graded in the browser; an assignment link gives everyone the same set.
- **Instructor tools:** embeds, presentation mode, compare mode (two pages on the same
  operations) and printable concept pages.
- **Explanations:** Claude writes them in Yusuf's voice with no approval step; Yusuf edits
  as needed.
- **Pace:** as fast as the quota allows; no external deadlines.
- **Name:** **StepWise** (capital W), set in `src/site.ts`. It will live at
  `https://stepwise.hintwise.org` (Netlify site `stepwise-pisan-labs`); nothing is published until the
  first deploy.

- **Optional accounts (2026-11-10, Yusuf):** sign in with Google or a magic link (Supabase) to
  save examples on the server, sync preferences and hear about new pages. Signing in is never
  required; signed out, the site works as before and sends nothing. `PLAN.md` section 18.

## Non-goals (v1)

- LTI grade passback
- Copying Galles/Lucet code
- Old browsers
- Analytics or tracking
