# StepWise handoff

The closing handoff of the session of 13 to 15 November 2026 (`session_01JyJzMZ3W1yMJWwuFJ1PTXM`),
written before it is archived. No session takes over and nothing is scheduled. Times are Lisbon
time (Yusuf's choice of 10 November; Lisbon is on UTC in November).

## What is live

https://stepwise.hintwise.org/ (Netlify site `stepwise-pisan-labs`) serves `main`. This handoff
goes out with the last deploy of the session; `CHANGES.md` logs its commit and live check.

- **275 visualizations in five pathways**, every page in `src/viz/catalog.ts`, each with a
  concept page, curated examples, practice, code tabs (Python, Java, C++) tested against the
  model, and a catalog thumbnail:
  - Data structures, Algorithms, Theory of computation (203 pages, built by 11 November);
  - **AI and LLMs** (33 pages, `PLAN.md` section 20, live since 14 November 09:49): tokenizers,
    language models and decoding, inside the transformer, training, serving, retrieval;
  - **Coding interviews** (39 pages, `PLAN.md` section 21, live since 14 November 22:08): array,
    interval, linked-list, heap, search, bit and DP patterns, design pages, concurrency, and the
    pattern map. Every pattern page sets the naive approach beside the pattern with work
    counters, and says where the pattern loses at small sizes.
- **Six learning paths** (`src/paths/`, live since 15 November 12:45): guided routes at
  `/path/<id>/`, linked from cards on the home page: a 10-step tour for the curious, then a first
  data structures course, an algorithms course, coding interview prep, how LLMs work and theory
  of computation (15 to 20 steps each). A step is done when its page is finished (every lesson
  read, every check right); practice scores do not count. No release was added for them, so no
  email went out.
- Every page of the three new waves was fact-checked by an independent agent (seven reviews);
  their fixes are in `CHANGES.md`.
- **The opt-in email about new pages is live** (the platform's app-notify, registered 14
  November): it reads `notify-feed.json` daily at 15:17 UTC and emails each new release id to
  readers with `notify_new_pages` on. The first run only seeded, so the AI release
  (`2026-11-14-ai-and-llms`) was never emailed; the `2026-11-14-coding-interviews` release names
  both pathways and is the first one emailed (15 November 15:17 UTC). **Adding a release to
  `src/releases.ts` sends an email; never change a published id.**
- The HintWise footer (with the HintWise mark since 14 November) on every page, and our own
  footer line: "Created by Yusuf Pisan, inspired by the visualizations of David Galles and Yves
  Lucet".
- Accounts, saved and shared examples, lesson lists, sync, Present tools, worksheets, progress,
  the offline app: as in `PLAN.md` sections 18 and 19, unchanged this session.

## How deploys work

`main` moves only when Yusuf says "deploy" (or approves a merge to `main`): fast-forward it to a
commit on `next` whose CI is green (`git merge-base --is-ancestor origin/main <sha>`, then
`git push origin <sha>:refs/heads/main`). Each deploy costs 15 Netlify credits. Since 17 November a
push that only changes root `*.md` notes or `docs/` runs no CI: such a commit counts as green when
the last commit before it that changed anything else is green.

- CI (`.github/workflows/ci.yml`) now takes about 100 minutes: lint 2, check 1, unit tests 17 and
  e2e about 80. A newer push to the same branch cancels the older run (the concurrency group),
  so do not push `next` while waiting for a run you mean to deploy.
- The live check: the bundle name in https://stepwise.hintwise.org/ equals a local
  `npm run build` made with the `VITE_` values from `netlify.toml`; every sitemap address returns
  200 with `data-site-footer` once and `class="mark"` once; the new pages draw in a headless
  browser; `notify-feed.json` is `application/json` with no redirect; an ordinary visit sends
  nothing to `auth.hintwise.org` except `POST /functions/v1/app-events` (the first-party analytics
  beacons, since 17 November). The scripts used are simple loops over `dist/sitemap.xml`
  with curl and Playwright; rewrite them as needed.
- On 14 November the permission system refused, once, a push to `next` that carried a release
  when a timer (not Yusuf) started it. Pushes that lead to an email need a person's yes in the
  session.

## To do

None of these blocks anything; all pages are built.

**Shared code** (suggested by the page agents; none was made, since agents were told not to edit
shared files):

1. `src/viz/code.test.ts`: random scripts cannot make structured arguments ("x,y", a vector),
   so the search operations of `hnsw`, `ivf-index` and `product-quantization` are code-tested on
   the curated examples only. Generate such arguments from each page's presets.
2. `VarsPanel.svelte` quotes string values and shows ±Infinity as `Infinity` (perplexity,
   unreachable goals): show ∞.
3. A `number` setting takes whole numbers only, so decimals (learning rates, k₁, b) became long
   choice lists: add a decimal setting or a dropdown for long choices.
4. Previews repeat every static shape in every frame (contour plots made the largest previews):
   a static layer shared by all frames.
5. `pickLayout` compares scale only, which is unfair when arrangements draw the main picture at
   different sizes; `lanes.ts` prefers its first arrangement within 5%, which hurts tall side
   panels on a laptop.
6. `controls.random.make` gets no settings, unlike presets.
7. `_matrix` panels could take a font size (multi-head-attention is 9.0 px on a phone with 7
   words); `table.ts` could take per-cell corner labels, and its `valueSize` counts "−∞" as two
   characters.
8. `src/layouts/linked.ts`: a link from a node that is not last in its row to a later row runs
   through the nodes after it (`_lists2` reroutes it; move the fix into the layout).
9. Duplication to fold back: `_threads3/page.ts` repeats much of `_threads2/page.ts` (let
   `_threads2` run on rows); `_heaps2` has its own heap because the binary-heap page's sift is not
   exported; `trie.ts` edge labels crowd near a root with many children.
10. `src/viz/_patterns/patterns.ts` has no entries for `grid-bfs` or for counting with DP
    (`dp-subset-sum`, coin change), so some "spot it" look-alikes had no right answer.

**Pages:**

11. `state-space-bfs` opens on a bare start state: give it an `opening` example.
12. `two-heaps-median` defaults the even-count median to the mean, with CLRS's lower median as
    a setting; `CLAUDE.md` says default to CLRS. Decide and, if CLRS, change the default and its
    examples.
13. A learner's own input at the size limits can draw text below the 11 px laptop minimum on a
    few pages (backpropagation with 5 variables and 6 operations; prefix-sum-hashmap with 12
    values naive): the checks cover curated examples only.

**People:**

14. Yusuf: skim the 72 new concept pages (written in his voice by agents, fact-checked by other
    agents); the catalog keeps the generic titles "Min stack" and "Combination sum (backtracking)".
15. Check with the Plabs session that the first email (15 November 15:17 UTC) went out.

**Process:**

16. CI is close to 100 minutes: shard the e2e step across jobs if it grows further.

## Branches

Only `main`, `next` and this session's `claude/keen-pascal-m2i3lo` are on origin. The session
branch is merged into `main` with this handoff and can be deleted after archiving:

```
git push origin --delete claude/keen-pascal-m2i3lo
```

## Waiting on others

- The platform side (the Supabase project, the sign-in-link service, the email hook, app-notify,
  the footer markup) belongs to the Plabs session for `pisanuw/claude-built-apps`, now
  `session_01JyJzMVhQhwQ7Ea3HMyJ3FN`. It was told on 15 November that the footer mark is live
  and that the coding-interviews release is first in the feed.
- Self-service deletion of a whole HintWise account is a platform feature; "Delete my StepWise
  data" already removes StepWise's rows.

## Not verified

- **The factorial axe scan:** on 8 November it found one color-contrast node, once, then passed
  every run since. Every axe check prints the failing elements, so a failure would show the
  cause.
- SLP3's August 2026 chapter 2 could not be fetched (Stanford returned 503), so the BPE page says
  "SLP3's 2026 drafts" rather than naming one.

## Starting again

Start a session at https://claude.ai/code with `pisan-labs/visualizing-data-structures` on the
branch `next`. Read `CLAUDE.md` (commands, definition of done, branches), `BRIEFING.md`, the end
of `CHANGES.md`, `PLAN.md` sections 20 and 21, then this file. Work on `next`; before committing
run `npm run lint && npm run check && npm test`, and `npm run e2e` when `src/ui`, `src/render` or
a view changed.

- New pages follow the wave pattern of sections 20 and 21: a slice first, then agents in
  parallel in worktrees (each told not to edit shared files and to report needed changes), a
  fact check per wave, the full suites, one release, CI, then the deploy.
- The SQL tests (`supabase/tests/`) need a local PostgreSQL 16 with
  `supabase/tests/supabase-stub.sql`; `supabase/README.md` has the steps. New migrations go in
  `supabase/migrations/0004_...`; never edit an applied one.
- A cloud clone can be shallow: run `git fetch --unshallow origin` before comparing branches.
