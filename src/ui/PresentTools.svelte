<script lang="ts">
  import { INK_COLORS, type Ink, type InkTool } from './ink.svelte';

  /** Present mode's toolbar: pointer, pen, its colors, undo, clear and "Keep ink". */
  let { ink }: { ink: Ink } = $props();

  const tools: { tool: InkTool; label: string; name: string; title: string }[] = [
    {
      tool: 'pointer',
      label: 'Pointer',
      name: 'Pointer',
      title: 'A dot that follows the mouse (L)',
    },
    { tool: 'pen', label: 'Pen', name: 'Pen', title: 'Draw over the picture (P)' },
    { tool: 'off', label: 'Off', name: 'Tools off', title: 'Pointer and pen off (Esc)' },
  ];
  const empty = $derived(ink.strokes.length === 0);
</script>

<div class="present-tools" role="group" aria-label="Pointer and pen">
  <div class="seg">
    {#each tools as t (t.tool)}
      <button
        type="button"
        class="btn small"
        aria-pressed={ink.tool === t.tool}
        aria-label={t.name}
        title={t.title}
        onclick={() => ink.setTool(t.tool)}>{t.label}</button
      >
    {/each}
  </div>
  <div class="colors" role="group" aria-label="Ink color">
    {#each INK_COLORS as c (c.value)}
      <button
        type="button"
        class="swatch"
        aria-pressed={ink.color === c.value}
        aria-label="{c.name} ink"
        title="{c.name} ink"
        onclick={() => ink.pick(c.value)}
      >
        <span style:background={c.value}></span>
      </button>
    {/each}
  </div>
  <div class="seg">
    <button
      type="button"
      class="btn small"
      disabled={empty}
      aria-label="Undo last stroke"
      title="Undo the last stroke (U)"
      onclick={() => ink.undo()}>Undo</button
    >
    <button
      type="button"
      class="btn small"
      disabled={empty}
      aria-label="Clear ink"
      title="Clear all ink (C)"
      onclick={() => ink.clear()}>Clear</button
    >
    <label class="keep" title="Keep the ink when the step changes">
      <input type="checkbox" bind:checked={ink.keep} />
      Keep ink
    </label>
  </div>
</div>

<style>
  .present-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }

  /* Each group wraps as a whole on a narrow screen. */
  .seg {
    display: flex;
    align-items: center;
    gap: 4px 6px;
  }

  .btn[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .colors {
    display: flex;
    gap: 2px;
  }

  .swatch {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background: none;
  }

  .swatch span {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--line-strong);
    forced-color-adjust: none;
  }

  .swatch[aria-pressed='true'] {
    border-color: var(--text);
  }

  .keep {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .keep input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--accent);
  }
</style>
