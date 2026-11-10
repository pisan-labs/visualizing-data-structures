<script lang="ts">
  import { families } from '../viz/catalog';
  import { goToItem, type ListPlay } from './player.svelte';

  /**
   * The quiet bar over a page while a lesson list plays: where the class is in the list, the
   * note for this example, Previous and Next (to the next example's page) and a way out. It
   * stays in Present mode, on one compact line. The keys < and > move too (VizPage).
   */
  let { play, presenting, onleave }: { play: ListPlay; presenting: boolean; onleave: () => void } =
    $props();

  const pageTitle = (viz: string) =>
    families.flatMap((f) => f.items).find((i) => i.id === viz)?.title ?? viz;

  const name = (title: string) => title || 'Untitled example';

  const before = $derived(play.list?.items[play.n - 2]);
  const after = $derived(play.list?.items[play.n]);

  /** Go to the example before (-1) or after (+1), if there is one. */
  export function move(dir: -1 | 1): void {
    const to = play.n + dir;
    if (!play.list || to < 1 || to > play.total) return;
    goToItem(play.id, play.list, to, presenting);
  }
</script>

<nav class="list-bar" class:compact={presenting} aria-label="Lesson list">
  {#if play.status === 'loading'}
    <p class="where muted" role="status">Opening the lesson list…</p>
  {:else if play.status === 'error' || !play.list}
    <p class="where problem" role="alert">{play.problem}</p>
    <div class="buttons">
      <button type="button" class="btn small" onclick={onleave}>Leave the list</button>
    </div>
  {:else if !play.item}
    <p class="where">
      <span class="label">Lesson list:</span> <strong>{play.list.title}</strong>. It has no examples
      yet.
    </p>
    <div class="buttons">
      <button type="button" class="btn small" onclick={onleave}>Leave the list</button>
    </div>
  {:else}
    <p class="where">
      <span class="label">Lesson list:</span>
      <strong>{play.list.title || 'Untitled list'}</strong>, {play.n} of {play.total}:
      <span class="example">{name(play.item.title)}</span>
    </p>
    <div class="buttons">
      <button
        type="button"
        class="btn small"
        disabled={!before}
        title={before
          ? `Previous: ${pageTitle(before.viz)}, ${name(before.title)} (<)`
          : 'This is the first example'}
        onclick={() => move(-1)}>← Previous</button
      >
      <button
        type="button"
        class="btn small"
        disabled={!after}
        title={after
          ? `Next: ${pageTitle(after.viz)}, ${name(after.title)} (>)`
          : 'This is the last example'}
        onclick={() => move(1)}>Next →</button
      >
      <button type="button" class="btn small" onclick={onleave}>Leave the list</button>
    </div>
    {#if play.item.note}<p class="note">{play.item.note}</p>{/if}
    {#if play.list.notes && !presenting}
      <details class="about">
        <summary>About this list</summary>
        <p>{play.list.notes}</p>
      </details>
    {/if}
  {/if}
</nav>

<style>
  .list-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    margin-top: 8px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    background: var(--surface);
    font-size: 0.92rem;
  }

  p {
    margin: 0;
  }

  .where {
    flex: 1 1 260px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .label {
    color: var(--text-2);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .note {
    flex-basis: 100%;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .about {
    flex-basis: 100%;
    color: var(--text-2);
  }

  .about summary {
    cursor: pointer;
    width: fit-content;
  }

  .about p {
    margin-top: 4px;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .problem {
    color: var(--c-error);
    font-weight: 600;
  }

  /* Present mode: one quiet line over the picture. */
  .compact {
    margin-top: 0;
    padding: 4px 8px;
    font-size: 0.95rem;
  }

  .compact .note {
    font-size: 1.15rem;
  }
</style>
