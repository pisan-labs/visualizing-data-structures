<script lang="ts">
  import { onMount } from 'svelte';
  import { SITE_NAME, TAGLINE } from '../site';
  import type { PreviewPoster } from '../render/preview';
  import { pageSummary } from '../progress/progress';
  import { families, isLive, pathways, type Pathway } from '../viz/catalog';
  import PreviewThumb from './PreviewThumb.svelte';
  import ProgressMark from './ProgressMark.svelte';
  import ProgressOverview from './ProgressOverview.svelte';
  import { progress } from './progress.svelte';
  import RecentPages from './RecentPages.svelte';

  // Thumbnails are made at build time (scripts/prerender.mjs; the dev server makes them on
  // request). Without them the catalog is a plain list, so a failed fetch is ignored.
  let posters = $state.raw<Record<string, PreviewPoster>>({});
  let playing = $state<string | null>(null);

  onMount(() => {
    document.title = `${SITE_NAME}: ${TAGLINE}`;
    fetch('/previews.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((p: Record<string, PreviewPoster>) => (posters = p))
      .catch(() => {});
  });

  const stop = (id: string) => {
    if (playing === id) playing = null;
  };

  const total = families.reduce((n, f) => n + f.items.length, 0);
  const live = families.reduce((n, f) => n + f.items.filter((i) => isLive(i.id)).length, 0);

  let query = $state('');
  let pathway = $state<Pathway | 'all'>('all');
  let showAdvanced = $state(true);
  let readyOnly = $state(false);

  const words = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
  const shown = $derived(
    families
      .filter((f) => pathway === 'all' || f.pathways.includes(pathway))
      .map((f) => ({
        ...f,
        items: f.items.filter(
          (i) =>
            (showAdvanced || !i.advanced) &&
            (!readyOnly || isLive(i.id)) &&
            words.every((w) => `${i.title} ${f.name}`.toLowerCase().includes(w)),
        ),
      }))
      .filter((f) => f.items.length > 0),
  );
  const count = $derived(shown.reduce((n, f) => n + f.items.length, 0));

  // A mark beside each page the reader has started (src/progress/progress.ts).
  const started = $derived(
    Object.fromEntries(
      Object.keys(progress.current.pages)
        .map((id) => [id, pageSummary(progress.current, id)] as const)
        .filter(([, s]) => s.started),
    ),
  );
</script>

<div class="catalog">
  <section class="intro">
    <h1>{TAGLINE}</h1>
    <p>
      Pick a data structure and run operations on it. Every step comes with an explanation, the
      pseudocode line that is running, and the values of the variables. Step backwards as far as you
      like. Share what you built with a link.
    </p>
    <p class="muted">{live} of {total} visualizations are ready. The rest are on the way.</p>
  </section>

  <RecentPages {posters} />
  <ProgressOverview />

  <form class="filters" role="search" onsubmit={(e) => e.preventDefault()}>
    <label class="search">
      <span class="visually-hidden">Search the catalog</span>
      <input
        class="field"
        type="search"
        placeholder="Search, e.g. tree, sort, graph"
        bind:value={query}
      />
    </label>
    <fieldset class="pathways">
      <legend class="visually-hidden">Course pathway</legend>
      <label class:on={pathway === 'all'}
        ><input type="radio" name="pathway" value="all" bind:group={pathway} /> Everything</label
      >
      {#each pathways as p (p.id)}
        <label class:on={pathway === p.id}
          ><input type="radio" name="pathway" value={p.id} bind:group={pathway} /> {p.label}</label
        >
      {/each}
    </fieldset>
    <label class="check"><input type="checkbox" bind:checked={showAdvanced} /> Show advanced</label>
    <label class="check"><input type="checkbox" bind:checked={readyOnly} /> Ready only</label>
  </form>
  <p class="count muted" aria-live="polite">
    {count === 0 ? 'Nothing matches.' : `Showing ${count} of ${total}.`}
  </p>

  <div class="families">
    {#each shown as f (f.name)}
      <section class="family card" aria-labelledby="fam-{f.name}">
        <h2 id="fam-{f.name}">{f.name}</h2>
        <ul>
          {#each f.items as item (item.id)}
            {@const live = isLive(item.id)}
            <li class:live>
              {#if live}
                {@const poster = posters[item.id]}
                <a
                  href="/{item.id}/"
                  onpointerenter={() => (playing = item.id)}
                  onpointerleave={() => stop(item.id)}
                  onfocus={() => (playing = item.id)}
                  onblur={() => stop(item.id)}
                >
                  {#if poster}<PreviewThumb
                      id={item.id}
                      {poster}
                      playing={playing === item.id}
                    />{/if}
                  <span>{item.title}</span>
                </a>
                {#if started[item.id]}<ProgressMark summary={started[item.id]!} />{/if}
              {:else}
                <span class="planned">{item.title}</span>
                <span class="tag">{item.advanced ? 'advanced, planned' : 'planned'}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>

<style>
  .catalog {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px 16px 32px;
  }

  .intro h1 {
    margin: 0 0 8px;
    font-size: clamp(1.5rem, 4vw, 2.2rem);
    line-height: 1.2;
  }

  .intro p {
    max-width: 62ch;
    margin: 0 0 8px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    margin-top: 16px;
  }

  .search input {
    width: min(100%, 320px);
    min-height: 42px;
  }

  .search {
    flex: 1 1 240px;
  }

  .pathways {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border: 0;
    margin: 0;
    padding: 0;
  }

  .pathways label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    cursor: pointer;
  }

  .pathways label.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    font-weight: 600;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
  }

  .count {
    margin: 8px 0 0;
  }

  .families {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 14px;
    margin-top: 20px;
  }

  .family {
    padding: 14px 16px;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 1.05rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 8px;
    padding: 5px 0;
    border-top: 1px solid var(--line);
  }

  li.live {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
  }

  li.live a {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 10px;
    font-weight: 700;
  }

  .planned {
    color: var(--text-2);
  }

  .tag {
    font-size: 0.75rem;
    color: var(--text-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 8px;
  }
</style>
