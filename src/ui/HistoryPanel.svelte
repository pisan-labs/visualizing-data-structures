<script lang="ts">
  import { formatCall, type Session } from './session.svelte';

  let { session }: { session: Session } = $props();

  const entries = $derived(session.entries);
  const current = $derived(session.current.op);
</script>

<div class="history">
  <p class="muted">
    Click an operation to jump to its result. Running a new operation from an earlier point replaces
    everything after it.
  </p>
  <ol>
    <li>
      <button
        class:current={current === -1}
        aria-current={current === -1 ? 'step' : undefined}
        onclick={() => session.jump(0)}
      >
        Start
      </button>
    </li>
    {#each entries as e, k (k)}
      <li>
        <button
          class:current={current === k}
          aria-current={current === k ? 'step' : undefined}
          onclick={() => session.jump(session.timeline.endOf(k))}
        >
          <span class="n">{k + 1}.</span> <code>{formatCall(e.call)}</code>
        </button>
      </li>
    {/each}
  </ol>
  <div class="actions">
    <button class="btn small" onclick={() => session.undoLast()} disabled={entries.length === 0}>
      Undo last operation
    </button>
    <button
      class="btn small"
      onclick={() => session.clearHistory()}
      disabled={entries.length === 0}
    >
      Clear history
    </button>
  </div>
</div>

<style>
  ol {
    list-style: none;
    margin: 8px 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
  }

  li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    border: 0;
    border-left: 4px solid transparent;
    border-radius: 6px;
    background: none;
  }

  li button:hover {
    background: var(--surface-2);
  }

  li button.current {
    border-left-color: var(--accent);
    background: var(--code-hl);
    font-weight: 700;
  }

  .n {
    color: var(--text-2);
    display: inline-block;
    min-width: 2.2em;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  p {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
