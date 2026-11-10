<script lang="ts">
  import { onMount } from 'svelte';
  import { accountSettled } from '../account/sync.svelte';
  import { latestRelease, releasesSince, type Release } from '../releases';
  import { families, isLive } from '../viz/catalog';
  import { markSeen, noteFirstVisit, seen } from './new-since.svelte';

  /**
   * "New since your last visit" on the home page: the releases (src/releases.ts) after the last
   * one the reader saw, with links to their new pages, and Dismiss. A first visit records the
   * latest release and shows nothing.
   */
  const fresh = $derived(releasesSince(seen.last));

  onMount(() => void noteFirstVisit(accountSettled()));

  const titles = new Map(families.flatMap((f) => f.items.map((i) => [i.id, i.title] as const)));
  const pagesOf = (r: Release) =>
    r.pages.filter(isLive).map((id) => ({ id, title: titles.get(id) ?? id }));

  /** Long lists fold away behind their count. */
  const OPEN_UP_TO = 12;

  const thisYear = new Date().getFullYear();
  const day = (date: string) => {
    const d = new Date(`${date}T12:00:00Z`);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(d.getUTCFullYear() === thisYear ? {} : { year: 'numeric' }),
      timeZone: 'UTC',
    });
  };

  function dismiss() {
    markSeen(latestRelease().id);
    document.getElementById('main')?.focus({ preventScroll: true });
  }
</script>

{#snippet links(pages: { id: string; title: string }[])}
  <ul class="pages">
    {#each pages as p (p.id)}
      <li><a href="/{p.id}/">{p.title}</a></li>
    {/each}
  </ul>
{/snippet}

{#if fresh.length}
  <section class="new-since" aria-labelledby="new-since-title">
    <div class="head">
      <h2 id="new-since-title">New since your last visit</h2>
      <button class="btn small" onclick={dismiss} aria-label="Dismiss what is new">Dismiss</button>
    </div>
    <ul class="releases">
      {#each fresh as r (r.id)}
        {@const pages = pagesOf(r)}
        <li>
          <p class="what">
            <time datetime={r.date}>{day(r.date)}</time>
            <strong>{r.title}</strong>
          </p>
          <p class="note">{r.note}</p>
          {#if pages.length > OPEN_UP_TO}
            <details>
              <summary>The {pages.length} new pages</summary>
              {@render links(pages)}
            </details>
          {:else if pages.length}
            {@render links(pages)}
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .new-since {
    margin-top: 18px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
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
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .releases {
    display: grid;
    gap: 10px;
    margin-top: 8px;
  }

  .releases > li + li {
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }

  p {
    margin: 0;
    max-width: 75ch;
  }

  .what {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
  }

  time {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin-top: 2px;
    color: var(--text-2);
    font-size: 0.92rem;
  }

  details {
    margin-top: 4px;
  }

  summary {
    cursor: pointer;
    color: var(--accent);
    font-size: 0.92rem;
    font-weight: 600;
  }

  .pages {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    margin-top: 4px;
    font-size: 0.92rem;
  }

  .pages a {
    overflow-wrap: anywhere;
  }
</style>
