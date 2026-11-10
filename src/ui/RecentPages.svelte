<script lang="ts">
  import { onMount } from 'svelte';
  import { readJson, writeJson } from '../engine/storage';
  import { parseRecent, RECENT_KEY, timeAgo, type RecentPage } from '../progress/recent';
  import type { PreviewPoster } from '../render/preview';
  import { isLive } from '../viz/catalog';
  import PreviewThumb from './PreviewThumb.svelte';
  import { vizHref } from './route';

  /**
   * "Pick up where you left off" on the home page: the last pages the reader opened, each
   * reopening at the example and step they left (RecentTracker.svelte stores them). Nothing
   * shows on a first visit.
   */
  let { posters }: { posters: Record<string, PreviewPoster> } = $props();

  const load = () =>
    parseRecent(readJson<unknown>(RECENT_KEY, [])).filter((r: RecentPage) => isLive(r.id));
  let pages = $state(load());
  let time = $state(Date.now());

  onMount(() => {
    // Coming back with the Back button can show this page from the browser's cache, from
    // before the reader opened the page they just left.
    const refresh = () => {
      pages = load();
      time = Date.now();
    };
    addEventListener('pageshow', refresh);
    const timer = setInterval(() => (time = Date.now()), 60_000);
    return () => {
      removeEventListener('pageshow', refresh);
      clearInterval(timer);
    };
  });

  function clear() {
    writeJson(RECENT_KEY, []);
    pages = [];
    document.getElementById('main')?.focus({ preventScroll: true });
  }
</script>

{#if pages.length}
  <section class="recent" aria-labelledby="recent-title">
    <div class="head">
      <h2 id="recent-title">Pick up where you left off</h2>
      <button class="btn small" onclick={clear} aria-label="Clear recent pages">Clear</button>
    </div>
    <ul>
      {#each pages as r (r.id)}
        {@const poster = posters[r.id]}
        <li class="card">
          <a href={vizHref(r.id, { ex: r.code ?? undefined })}>
            {#if poster}<PreviewThumb id={r.id} {poster} />{:else}<span class="blank"></span>{/if}
            <span class="text">
              <span class="title">{r.title}</span>
              <span class="when">
                <time datetime={r.at}>{timeAgo(r.at, time)}</time>{r.steps > 1
                  ? `, step ${r.step} of ${r.steps}`
                  : ''}
              </span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .recent {
    margin-top: 18px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  ul {
    display: grid;
    /* Three columns at most (there are three cards at most), one on a phone. */
    grid-template-columns: repeat(
      auto-fill,
      minmax(min(100%, max(250px, calc((100% - 20px) / 3))), 1fr)
    );
    gap: 10px;
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 8px 12px;
    color: var(--text);
    text-decoration: none;
    border-radius: var(--radius);
  }

  a:hover .title {
    text-decoration: underline;
  }

  .text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .title {
    font-weight: 700;
    color: var(--accent);
    overflow-wrap: anywhere;
  }

  .when {
    font-size: 0.85rem;
    color: var(--text-2);
  }

  /* The catalog's thumbnail, a little larger. */
  a :global(svg.thumb),
  .blank {
    flex: none;
    width: 96px;
    height: 58px;
  }

  .blank {
    border: 1px solid var(--line);
    border-radius: 6px;
  }
</style>
