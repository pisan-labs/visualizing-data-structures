# CLAUDE.md

Interactive data structure and algorithm visualizations (working name **Stepwise**). Read
`BRIEFING.md` for scope and decisions and `PLAN.md` for the roadmap. Log decisions and notable
changes in `CHANGES.md` (append-only, one line each: `YYYY-MM-DD [type] description`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | ESLint and Prettier check (`npm run format` fixes formatting) |
| `npm run check` | svelte-check / TypeScript, warnings fail |
| `npm test` | Vitest unit and property tests |
| `npm run e2e` | Playwright on desktop and phone viewports, with axe accessibility scans (builds first) |
| `npm run verify` | All of the above plus the build |

Before committing, run `npm run lint && npm run check && npm test`. Also run `npm run e2e` when
anything under `src/ui`, `src/render`, or a view changed. CI (`.github/workflows/ci.yml`) runs
everything on every push; Netlify builds and deploys `main` (`netlify.toml`).

`@playwright/test` is pinned to 1.63.0 to match the browsers preinstalled in cloud sessions, and
`overrides` pins `playwright-core` to the same version. Bump them together.

## Architecture

- `src/engine/`: framework-free core.
  - `types.ts`: `Step` (state snapshot, marks, narration, pseudocode lines, vars, detail level) and `VizDef`.
  - `timeline.ts`: runs operations (generators) into steps; handles history and detail levels.
  - `example.ts`: saved examples, link encoding, validation (`ExampleError` messages are shown to users).
  - `rng.ts`: seeded RNG; `storage.ts`: localStorage wrappers that never throw.
- `src/render/`: `Scene` of shapes with stable ids; `interpolate.ts` blends two scenes by id.
- `src/ui/`: Svelte 5 components. `session.svelte.ts` holds playback state. The timeline mutates
  in place, so read lists through `session.entries` (a fresh copy), never a cached array.
- `src/viz/<id>/`: one folder per visualization: `model.ts` (state, operations, pseudocode),
  `view.ts` (step to scene), `index.ts` (the `VizDef`), `explain.md` (concept page),
  `examples/*.json` (curated examples), tests. Register it in `src/viz/registry.ts`; the catalog
  is `src/viz/catalog.ts`.

## Adding a visualization (definition of done)

1. Operations are generators that yield steps. The last step of each operation must show the
   final state (the engine forces it to level 1).
2. Every mark id must match a shape id in the view. Give moving values identities (uids), so the
   animation follows the value, not the slot.
3. Where textbooks differ, add a setting (toggle). Default to CLRS conventions.
4. `src/viz/conformance.test.ts` checks every registered visualization automatically: narration,
   pseudocode ids, marks, unique shape ids, examples, and concept-page links. Add a
   model-specific property test against a reference implementation as well.
5. Concept page: write it in Yusuf's voice (use the `write-like-pisan` skill). No approval step
   is needed; he edits afterwards. Link examples as `[Title](#example:<id>)`.
6. At least 3 curated examples, each with `id`, `title`, and `notes`.
7. Add Playwright coverage for anything new in the UI.

## Conventions

- Site name and links live in `src/site.ts` (plus `<title>` in `index.html`).
- Routes are hash-based: `#/<viz-id>?ex=<code>&embed=1`.
- No analytics or tracking. No external fonts or CDNs.
- Code is MIT; written explanations are CC BY 4.0.
