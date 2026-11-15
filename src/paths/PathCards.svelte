<script lang="ts">
  import { progress } from '../ui/progress.svelte';
  import { pathHref, pathProgress, paths } from './paths';
  import PathMeter from './PathMeter.svelte';

  /** The home page's learning paths: one card each, with the reader's progress once started. */
  const cards = $derived(paths.map((p) => ({ path: p, state: pathProgress(progress.current, p) })));
</script>

<section class="paths" aria-labelledby="paths-title">
  <h2 id="paths-title">Learning paths</h2>
  <p class="muted lead">Not sure where to start? Pick a path and follow it one page at a time.</p>
  <ul>
    {#each cards as { path, state } (path.id)}
      <li class="card">
        <a href={pathHref(path.id)}>
          <span class="audience">{path.audience}</span>
          <span class="title">{path.title}</span>
          <span class="blurb">{path.blurb}</span>
        </a>
        {#if state.started}
          <PathMeter {state} compact label="{path.title}: progress" />
        {:else}
          <p class="muted steps">{state.total} steps</p>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .paths {
    margin-top: 18px;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .lead {
    margin: 2px 0 0;
  }

  ul {
    display: grid;
    /* Three paths a row on a wide screen (six paths, two even rows). */
    grid-template-columns: repeat(
      auto-fill,
      minmax(min(100%, max(240px, calc((100% - 20px) / 3))), 1fr)
    );
    gap: 10px;
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  li {
    display: grid;
    align-content: space-between;
    gap: 8px;
    padding: 12px 14px;
  }

  a {
    display: grid;
    gap: 2px;
    color: var(--text);
    text-decoration: none;
  }

  a:hover .title {
    text-decoration: underline;
  }

  .audience {
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .title {
    font-weight: 700;
    color: var(--accent);
  }

  .blurb {
    font-size: 0.9rem;
  }

  .steps {
    margin: 0;
    font-size: 0.85rem;
  }
</style>
