# visualizing-data-structures

[![CI](https://github.com/pisan-labs/visualizing-data-structures/actions/workflows/ci.yml/badge.svg)](https://github.com/pisan-labs/visualizing-data-structures/actions/workflows/ci.yml)

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

## Deploy (Netlify)

One-time setup, done in the Netlify web UI:

1. **Add new site → Import an existing project → GitHub**, then pick
   `pisan-labs/visualizing-data-structures`. Netlify may ask you to grant its GitHub app access
   to the `pisan-labs` organization.
2. Leave the build settings alone. `netlify.toml` sets the build command (`npm run build`), the
   publish folder (`dist`), and Node 22. Deploy.
3. **Domain management → Add a domain**, enter `<name>.pisan.me`, and add the DNS record Netlify
   shows (a `CNAME` from `<name>` to `<site>.netlify.app`) at the DNS provider for `pisan.me`.
   Netlify issues the HTTPS certificate on its own.

After that, every push to `main` deploys, and every pull request gets a preview link. Tests run
in GitHub Actions, not on Netlify.

## Licenses

- Code: MIT (`LICENSE`).
- Written explanations (`src/viz/**/explain.md`): CC BY 4.0 (`CONTENT-LICENSE.md`).

Inspired by the visualizations of David Galles (University of San Francisco) and Yves Lucet
(UBC Okanagan). No code was copied from them.
