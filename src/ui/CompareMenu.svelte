<script lang="ts">
  import { canCompare } from '../engine/compare';
  import { encodeExample } from '../engine/example';
  import type { AnyVizDef } from '../engine/types';
  import { families, isLive } from '../viz/catalog';
  import { loadViz } from '../viz/registry';
  import { vizHref } from './route';
  import type { Session } from './session.svelte';

  /** Lists the pages this one can be compared with and opens compare mode on one of them. */
  let { session }: { session: Session } = $props();

  const def = $derived(session.def);
  // null until the menu is first opened: pages load only when someone asks.
  let options = $state<AnyVizDef[] | null>(null);

  async function load() {
    const family = families.find((f) => f.items.some((i) => i.id === def.id));
    const ids = (family?.items ?? []).map((i) => i.id).filter(isLive);
    if (!ids.includes(def.id)) ids.push(def.id);
    const defs = await Promise.all(ids.map((id) => loadViz(id)));
    // This page first: the same page with other options is always a fair comparison.
    options = [def, ...defs.filter((d): d is AnyVizDef => !!d && d.id !== def.id)].filter((d) =>
      canCompare(def, d),
    );
  }

  // Carry the current work over, so the comparison starts from what is on the screen.
  async function go(e: MouseEvent, other: AnyVizDef) {
    e.preventDefault();
    const ex = session.timeline.entries.length
      ? await encodeExample(session.toExample())
      : undefined;
    location.hash = vizHref(def.id, { compare: other.id, ex }).split('#')[1] ?? '';
  }
</script>

<details
  class="compare-menu"
  ontoggle={(e) => {
    if ((e.currentTarget as HTMLDetailsElement).open && !options) load();
  }}
>
  <summary class="btn small">Compare</summary>
  <div class="menu card">
    <p class="muted">Run the same operations on two pages, side by side.</p>
    {#if options === null}
      <p class="muted">Loading…</p>
    {:else}
      <ul>
        {#each options as d (d.id)}
          <li>
            <a href={vizHref(def.id, { compare: d.id })} onclick={(e) => go(e, d)}>
              {d.id === def.id ? `${d.title} with other options` : d.title}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</details>

<style>
  .compare-menu {
    position: relative;
  }

  summary {
    list-style: none;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    width: min(320px, calc(100vw - 32px));
    padding: 10px 14px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  }

  .menu p {
    margin: 0 0 6px;
    font-size: 0.9rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
  }

  a {
    display: block;
    padding: 8px 4px;
    min-height: 24px;
  }
</style>
