# visualizing-data-structures

Interactive visualizations of data structures and algorithms for university courses
(working name **Stepwise**). Every step is narrated, the running pseudocode line is
highlighted, and the variables are shown. You can step backwards through the whole history,
share your work as a link, embed it in Canvas, or save it as a file.

Status: Phase 1 (Stack, array implementation) is built. See `PLAN.md` for the roadmap.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run verify   # lint, type check, unit tests, build, end-to-end tests
```

## Licenses

- Code: MIT (`LICENSE`).
- Written explanations (`src/viz/**/explain.md`): CC BY 4.0 (`CONTENT-LICENSE.md`).

Inspired by the visualizations of David Galles (University of San Francisco) and Yves Lucet
(UBC Okanagan). No code was copied from them.
