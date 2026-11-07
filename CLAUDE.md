# CLAUDE.md

Interactive data structure and algorithm visualizations (**StepWise**, capital W). Read
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

## Branches and deploys

- Work on `next` and push `next`; CI runs on every push to `next` and `main`.
- Every push to `main` publishes to production (Netlify builds `main`; each deploy costs 15
  credits). `main` only moves by fast-forwarding to `next`: once a day at 17:27 Europe/Berlin
  (a scheduled task), or when Yusuf says "deploy". Never commit to `main` directly. Never start,
  publish or roll back a Netlify deploy by other means.
- Agent worktrees branch from `next` and are merged back into `next` by the lead.

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
  `examples/*.json` (curated examples), `code/` (Python, Java, C++), tests. Pages are found
  automatically; the catalog of planned pages is `src/viz/catalog.ts`.

## Adding a visualization (definition of done)

`src/viz/stack-array/` is the reference implementation: copy its shape.

1. **Folder.** `src/viz/<id>/`, with `<id>` exactly as in `src/viz/catalog.ts`. `index.ts`
   default-exports the `VizDef`. The registry finds it by itself; never edit `registry.ts`.
2. **Operations** are generators that yield steps. Keep a step fine-grained where a learner
   would want to pause; use level 3 for very fine detail such as every comparison. The last step
   of each operation must show the final state (the engine forces it to level 1).
3. **Marks and identity.** Every mark id must match a shape id in the view. Give moving values
   identities (uids), so the animation follows the value, not the slot.
4. **Variants.** Where textbooks differ, add a setting (toggle), default to CLRS conventions, and
   make the pseudocode follow the settings.
5. **Pseudocode.** Every line has `text` (formal) and `plain` (plain English) with the same id.
6. **Counters and readouts** (comparisons, swaps, probes, rotations, N, height) go in `vars`.
7. **Big-O self-test.** `complexity` rows with best, average and worst cases, each with a
   one-line `why` and, where possible, the id of an example that shows it.
8. **Input.** `controls.input.sample` holds a valid input. Add `controls.presets` that suit the
   structure (random, sorted, reverse, nearly sorted, duplicates, skewed, best and worst cases).
9. **Examples.** At least 3 in `examples/*.json`, each with `id`, `title` and `notes`. Cover
   edge and worst cases. Name examples after the idea, never after a textbook figure number.
10. **Concept page** (`explain.md`), in Yusuf's voice: invoke the `anthropic-skills:write-like-pisan`
    skill first. Cover:
    - the idea, and the operations with their costs;
    - how it works and its variants;
    - when to use it and when to avoid it;
    - failure cases and common mistakes;
    - "Try this".

    Two link forms:
    - `[Title](#example:<id>)` loads an example;
    - `[Show me](#play:<id>)` loads it and plays.

    Each `##` section is a lesson with its own deep link. Add 1 or 2 concept checks per page:

    ````
    ```check
    Q: After push(1), push(2), what does pop() return?
    - 1
    * 2
    - Nothing, the stack is empty
    = The last value in is the first out.
    ```
    ````

    `-` marks a wrong option, `*` the right one, and `=` the explanation.
11. **Code tabs.** `code/python/`, `code/java/` and `code/cpp/` each hold:
    - the implementation shown to learners, imported with `?raw` into `code.python`, `code.java`
      and `code.cpp`;
    - a test driver: `main.py`, `Main.java` or `main.cpp`.

    The driver reads one operation per line from standard input and prints one line per
    result, nothing else. `code.script(calls, settings)` returns the driver input and the
    output our model expects. `src/viz/code.test.ts` runs all three on the curated examples and
    on random scripts. Code follows the default settings; keep it idiomatic and short.
    Toolchains: Java 17+ (switch arrows are fine) and C++17 (`-Wall -Wextra -Werror`).
12. **Practice.** Give `practice` 3 or 4 question kinds, following `src/viz/stack-array/practice.ts`.
    - Each kind is built from a seeded RNG.
    - The picture shows the state after `setup`; the prompt asks about operations that follow.
    - Compute every answer by running the model; never write one by hand.
    - Answers are a choice, a number, or a sequence.
    - Add `watch` operations so "Show me" can play the answer.
13. **Tests.**
    - `src/viz/conformance.test.ts` checks every page automatically: narration (no `{token}`
      or `undefined` leftovers), line ids, plain pseudocode, marks, unique shape ids, Big-O
      rows, presets, examples, links, and no placeholder text.
    - Add `<id>.test.ts` with a property-based test against a simple reference implementation,
      checking invariants on every step.
    - `tests/e2e/all-vizzes.spec.ts` runs every operation of every page on desktop and phone,
      with axe.
    - Run Playwright with your own `E2E_PORT` when several worktrees are running at once.

## Conventions

- Site name and links live in `src/site.ts` (plus `<title>` in `index.html`).
- Every visualization has its own page, `/<viz-id>/`, written by `scripts/prerender.mjs` after
  `vite build` (title, description, preview tags, canonical URL). The hash holds only state:
  `#ex=<code>&embed=1&lesson=<section>`. Old `/#/<viz-id>?...` links redirect.
- The app loads each visualization on demand (`src/viz/registry.ts`); tests and prerender use
  `src/viz/all.ts`.
- No analytics or tracking. No external fonts or CDNs.
- Code is MIT; written explanations are CC BY 4.0.
