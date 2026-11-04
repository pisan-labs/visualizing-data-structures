<script lang="ts">
  import type { AnyVizDef } from '../engine/types';
  import { REPO_URL, SITE_NAME } from '../site';
  import { loadViz } from '../viz/registry';
  import Catalog from './Catalog.svelte';
  import ComparePage from './ComparePage.svelte';
  import Logo from './Logo.svelte';
  import { parseLocation } from './route';
  import { notices, prefs, setPref, type Theme } from './state.svelte';
  import VizPage from './VizPage.svelte';

  const initial = parseLocation(location.pathname, location.hash);
  // Old links (/#/stack-array?ex=...) move to the page's own address.
  if (initial.kind === 'legacy') location.replace(initial.target);

  let route = $state(initial);
  const embed = $derived(route.kind === 'viz' && route.embed);

  // undefined while loading, null when there is no such page.
  let viz = $state<AnyVizDef | null | undefined>(undefined);
  $effect(() => {
    const r = route;
    if (r.kind !== 'viz') return;
    let live = true;
    viz = undefined;
    loadViz(r.id).then((def) => {
      if (live) viz = def ?? null;
    });
    return () => {
      live = false;
    };
  });

  // Compare mode loads a second page: undefined while loading, null when there is none.
  let vizB = $state<AnyVizDef | null | undefined>(undefined);
  $effect(() => {
    const r = route;
    vizB = undefined;
    if (r.kind !== 'viz' || !r.compare) return;
    let live = true;
    loadViz(r.compare).then((def) => {
      if (live) vizB = def ?? null;
    });
    return () => {
      live = false;
    };
  });

  // An embed may fix its theme (#...&theme=dark); otherwise the viewer's choice applies.
  const embedTheme = $derived(
    route.kind === 'viz' && route.embed && ['light', 'dark', 'contrast'].includes(route.theme ?? '')
      ? route.theme
      : null,
  );
  $effect(() => {
    const root = document.documentElement;
    const theme = embedTheme ?? prefs.theme;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  });

  const themes: { value: Theme; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'contrast', label: 'High contrast' },
  ];
</script>

<!-- Read the address the navigation went to, not the current one: a page that is being replaced
     could still rewrite it. -->
<svelte:window
  onhashchange={(e) => {
    const to = new URL(e.newURL);
    route = parseLocation(to.pathname, to.hash);
  }}
/>

{#if !embed}
  <a
    class="skip"
    href="#main"
    onclick={(e) => {
      e.preventDefault();
      document.getElementById('main')?.focus();
    }}>Skip to content</a
  >
  <header class="site">
    <a class="brand" href="/" aria-label="{SITE_NAME} home">
      <Logo size={30} />
      <span class="word">Step<span class="w">Wise</span></span>
    </a>
    <label class="theme">
      <span class="visually-hidden">Theme</span>
      <select
        class="field"
        value={prefs.theme}
        onchange={(e) => setPref('theme', e.currentTarget.value as Theme)}
      >
        {#each themes as t (t.value)}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
    </label>
  </header>
{/if}

<main id="main" tabindex="-1">
  {#if route.kind === 'catalog'}
    <Catalog />
  {:else if route.kind === 'viz'}
    {#if viz && route.compare}
      {#if vizB}
        {#key route.key}
          <ComparePage a={viz} b={vizB} code={route.code} codeB={route.codeB} />
        {/key}
      {:else if vizB === null}
        <div class="missing">
          <h1>Not here yet</h1>
          <p>There is no visualization called "{route.compare}" to compare with.</p>
          <p><a href="/{viz.id}/">Back to {viz.title}</a></p>
        </div>
      {:else}
        <p class="loading muted" aria-live="polite">Loading…</p>
      {/if}
    {:else if viz}
      {#key route.key}
        <VizPage
          def={viz}
          code={route.code}
          embed={route.embed}
          lesson={route.lesson}
          theme={route.theme}
          autoplay={route.autoplay}
          practice={route.practice}
          practiceCount={route.practiceCount}
        />
      {/key}
    {:else if viz === null}
      <div class="missing">
        <h1>Not here yet</h1>
        <p>There is no visualization called "{route.id}" on this site.</p>
        <p><a href="/">See all visualizations</a></p>
      </div>
    {:else}
      <p class="loading muted" aria-live="polite">Loading…</p>
    {/if}
  {/if}
</main>

{#if !embed}
  <footer class="site">
    <p>
      Code under the MIT license, text under CC BY 4.0. <a href={REPO_URL}>Source on GitHub</a>.
    </p>
    <p>
      Inspired by the visualizations of
      <a href="https://www.cs.usfca.edu/~galles/visualization/">David Galles</a> and
      <a href="https://cmps-people.ok.ubc.ca/ylucet/DS/Algorithms.html">Yves Lucet</a>.
    </p>
  </footer>
{/if}

<div class="notices" role="status" aria-live="polite">
  {#each notices as n (n.id)}
    <div class="notice" class:error={n.tone === 'error'}>{n.text}</div>
  {/each}
</div>

<style>
  .skip {
    position: absolute;
    left: -999px;
    top: 8px;
    z-index: 100;
    padding: 8px 12px;
    background: var(--surface);
  }

  .skip:focus {
    left: 8px;
  }

  header.site {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-weight: 800;
    font-size: 1.3rem;
    letter-spacing: -0.02em;
    color: var(--text);
    text-decoration: none;
  }

  .brand .w {
    color: var(--accent);
  }

  .theme select {
    min-height: 36px;
  }

  main:focus {
    outline: none;
  }

  .loading {
    max-width: 700px;
    margin: 0 auto;
    padding: 32px 16px;
  }

  .missing {
    max-width: 700px;
    margin: 0 auto;
    padding: 32px 16px;
  }

  footer.site {
    max-width: 1480px;
    margin: 0 auto;
    padding: 16px 16px 40px;
    font-size: 0.88rem;
    color: var(--text-2);
  }

  footer p {
    margin: 4px 0;
  }

  .notices {
    position: fixed;
    left: 50%;
    bottom: 84px;
    transform: translateX(-50%);
    display: grid;
    gap: 6px;
    width: min(92vw, 520px);
    z-index: 50;
    pointer-events: none;
  }

  .notice {
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--text);
    color: var(--bg);
    box-shadow: 0 4px 16px rgb(0 0 0 / 20%);
    font-size: 0.95rem;
  }

  .notice.error {
    background: var(--c-error);
    color: #fff;
  }
</style>
