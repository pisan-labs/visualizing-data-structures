<script lang="ts">
  import { progress } from '../ui/progress.svelte';
  import { vizHref } from '../ui/route';
  import { pathHref, pathProgress, pathSteps, stepOf, vizTitle, type PathDef } from './paths';
  import PathMeter from './PathMeter.svelte';

  /**
   * The bar over a visualization page reached from a learning path: which step this is, the
   * path's progress, its note, and links to the steps either side and back to the path.
   */
  let { path, viz, onleave }: { path: PathDef; viz: string; onleave: () => void } = $props();

  const at = $derived(stepOf(path, viz));
  const steps = $derived(pathSteps(path));
  const state = $derived(pathProgress(progress.current, path));
  const before = $derived(at ? steps[at.n - 2] : undefined);
  const after = $derived(at ? steps[at.n] : undefined);
  const done = $derived(at ? state.steps[at.n - 1]!.summary.finished : false);
</script>

<nav class="path-bar" aria-label="Learning path">
  <p class="where">
    <span class="label">Path:</span>
    <a href={pathHref(path.id)}><strong>{path.title}</strong></a>{#if at}, step {at.n} of
      {steps.length}{#if done}<span class="tick"> (done)</span>{/if}{/if}
  </p>
  <div class="meter"><PathMeter {state} compact /></div>
  <div class="buttons">
    {#if before}
      <a
        class="btn small"
        href={vizHref(before.viz, { path: path.id })}
        title="Previous: {vizTitle(before.viz)}">← Previous</a
      >
    {/if}
    {#if after}
      <a
        class="btn small"
        class:primary={done}
        href={vizHref(after.viz, { path: path.id })}
        title="Next: {vizTitle(after.viz)}">Next: {vizTitle(after.viz)} →</a
      >
    {:else if at}
      <a class="btn small" href={pathHref(path.id)}>Back to the path</a>
    {/if}
    <button type="button" class="btn small" onclick={onleave}>Leave the path</button>
  </div>
  {#if at}
    <p class="note">
      {at.step.note}
      {#if !done}<span class="muted">
          This step is done when every lesson under Learn is read and every check is right.</span
        >{/if}
    </p>
  {/if}
</nav>

<style>
  .path-bar {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 6px 12px;
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--c-done);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .where,
  .note {
    margin: 0;
  }

  .label {
    color: var(--text-2);
  }

  .meter {
    min-width: 160px;
  }

  .buttons {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .note {
    grid-column: 1 / -1;
    font-size: 0.9rem;
  }

  @media (max-width: 560px) {
    .path-bar {
      grid-template-columns: 1fr;
    }
  }
</style>
