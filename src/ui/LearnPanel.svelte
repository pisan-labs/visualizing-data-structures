<script lang="ts">
  import { marked } from 'marked';
  import { validateExample } from '../engine/example';
  import type { Session } from './session.svelte';
  import { notify } from './state.svelte';

  let { session }: { session: Session } = $props();

  // The page already shows the title, so drop the Markdown's first heading.
  const html = $derived(
    marked.parse(session.def.explain.replace(/^# .*\n+/, ''), { async: false }) as string,
  );

  let article: HTMLElement | undefined = $state();

  // Links like [Try it](#example:lifo) load a curated example instead of navigating.
  $effect(() => {
    const el = article;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a');
      const href = a?.getAttribute('href') ?? '';
      if (!href.startsWith('#example:')) return;
      e.preventDefault();
      const ex = session.def.examples.find((x) => x.id === href.slice('#example:'.length));
      if (!ex) return;
      session.load(validateExample(session.def, ex));
      notify(`Loaded "${ex.title}". Press play or step through it.`);
      document
        .getElementById('stage-anchor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  });
</script>

<!-- Our own Markdown, rendered at runtime. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<article class="learn" bind:this={article}>{@html html}</article>

<p class="license muted">Text licensed under CC BY 4.0.</p>

<style>
  .learn {
    line-height: 1.6;
  }

  .learn :global(h2) {
    font-size: 1.05rem;
    margin: 1.2em 0 0.4em;
  }

  .learn :global(p),
  .learn :global(li) {
    margin: 0.4em 0;
  }

  .learn :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.92rem;
  }

  .learn :global(th),
  .learn :global(td) {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }

  .learn :global(code) {
    background: var(--surface-2);
    padding: 1px 4px;
    border-radius: 4px;
  }

  .learn :global(ul) {
    padding-left: 1.2em;
  }

  /* Wrap long lines (concept checks before they become widgets) so phones never scroll sideways. */
  .learn :global(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .license {
    font-size: 0.8rem;
    margin-top: 16px;
  }
</style>
