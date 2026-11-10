# visualizing-data-structures

<img src="public/logo.svg" alt="StepWise" width="300">

[![CI](https://github.com/pisan-labs/visualizing-data-structures/actions/workflows/ci.yml/badge.svg)](https://github.com/pisan-labs/visualizing-data-structures/actions/workflows/ci.yml)

Interactive visualizations of data structures and algorithms for university courses
(**StepWise**, https://stepwise.hintwise.org). Every step is narrated, the running pseudocode line is
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
3. **Domain management → Add a domain**, enter `<name>.hintwise.org`, and add the DNS record
   Netlify shows (a `CNAME` from `<name>` to `<site>.netlify.app`) in Cloudflare, which serves
   DNS for `hintwise.org`. Set the record to "DNS only" (grey cloud), not proxied, so Netlify can
   issue the HTTPS certificate on its own.

Netlify builds and publishes every push to `main`; `main` only moves by fast-forwarding to
`next` (see `CLAUDE.md`). Tests run in GitHub Actions, not on Netlify.

## Offline app

StepWise installs as an app and works offline. The pieces:

- `src/pwa/sw.js` is the service worker, written by hand. `npm run build` (in
  `scripts/prerender.mjs`) writes it to `dist/sw.js` with a version (a hash of the files) and the
  list of files to precache: the home page, every page, the hashed assets, `previews.json`, the
  manifest and the icons (about 8.6 MB, 2.5 to 3 MB over the wire).
- Pages come from the network first, so a reader who is online always gets the latest deploy;
  the cached copy is used only when the network fails. Hashed files in `/assets/` come from the
  cache first. Requests to other sites (such as Supabase) are never intercepted or cached.
- The page registers the worker in production builds only (`src/pwa/offline.svelte.ts`). When a
  newer version is waiting, it shows "A new version is ready" with a Reload button; it never
  reloads by itself. Offline, it shows a small "Offline" note.
- `dist/manifest.webmanifest` is made from `src/site.ts` and the light theme (`src/pwa/manifest.ts`).
  The icons in `public/icons/` are made from `public/logo.svg`: after changing the logo, run
  `node scripts/icons.mjs` and commit the files it writes.
- `netlify.toml` serves `/sw.js` and the manifest with `Cache-Control: no-cache`, so browsers
  see a new deploy on the next visit.

### Kill switch

If the service worker ever misbehaves (pages stuck on an old version, broken offline copies),
replace it with one that removes itself:

1. `cp scripts/sw-kill.js public/sw.js`, commit to `next` and deploy. The build keeps a
   committed `public/sw.js` instead of writing its own (it prints a warning).
2. Each browser that has the old worker fetches `/sw.js` on its next visit, installs the kill
   switch, which takes over at once, deletes StepWise's caches and unregisters itself. From then
   on pages load from the network. Saved examples and settings (in `localStorage`) are kept.
3. Once the real worker is fixed, `git rm public/sw.js` and deploy again; the app comes back.

Do not use a `Clear-Site-Data` header for this: it would also delete readers' saved examples. To
clear one browser by hand, open the developer tools, then Application, Service workers,
Unregister (and Clear site data, which also clears saved examples).

## Licenses

- Code: MIT (`LICENSE`).
- Written explanations (`src/viz/**/explain.md`): CC BY 4.0 (`CONTENT-LICENSE.md`).

Inspired by the visualizations of David Galles (University of San Francisco) and Yves Lucet
(UBC Okanagan). No code was copied from them.
