<script lang="ts">
  import { onMount } from 'svelte';
  import { SITE_NAME, TAGLINE } from '../site';
  import { families, isLive } from '../viz/catalog';

  onMount(() => {
    document.title = `${SITE_NAME}: ${TAGLINE}`;
  });

  const total = families.reduce((n, f) => n + f.items.length, 0);
  const live = families.reduce((n, f) => n + f.items.filter((i) => isLive(i.id)).length, 0);
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

  <div class="families">
    {#each families as f (f.name)}
      <section class="family card" aria-labelledby="fam-{f.name}">
        <h2 id="fam-{f.name}">{f.name}</h2>
        <ul>
          {#each f.items as item (item.id)}
            {@const live = isLive(item.id)}
            <li class:live>
              {#if live}
                <a href="/{item.id}/">{item.title}</a>
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
    display: block;
  }

  li.live a {
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
