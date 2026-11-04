<script lang="ts">
  import type { Session } from './session.svelte';

  let { session }: { session: Session } = $props();

  const blocks = $derived(session.def.pseudocode(session.settings));
  const f = $derived(session.current);
  const currentOp = $derived(f.op >= 0 ? session.timeline.entries[f.op]!.call[0] : null);

  // The learner can look at another operation's code; it snaps back when the step changes.
  let picked = $state<string | null>(null);
  $effect(() => {
    void session.cursor;
    picked = null;
  });

  const shownOp = $derived(picked ?? currentOp ?? blocks[0]?.op);
  const block = $derived(blocks.find((b) => b.op === shownOp) ?? blocks[0]);
  const active = $derived(new Set(shownOp === currentOp ? f.step.lines : []));
  const isError = $derived(f.step.marks.some((m) => m.role === 'error'));
</script>

<section class="code card" aria-labelledby="code-heading">
  <div class="head">
    <h2 id="code-heading">Pseudocode</h2>
    <div class="ops" role="group" aria-label="Show the code for">
      {#each blocks as b (b.op)}
        <button
          class="btn small"
          class:current={b.op === shownOp}
          aria-pressed={b.op === shownOp}
          onclick={() => (picked = b.op)}>{b.op}</button
        >
      {/each}
    </div>
  </div>
  {#if block}
    <ol class="lines">
      {#each block.lines as l (l.id)}
        <li
          class:active={active.has(l.id)}
          class:error={isError && active.has(l.id)}
          aria-current={active.has(l.id) ? 'step' : undefined}
        >
          <code style:padding-left="{l.indent * 2}ch">{l.text}</code>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .code {
    padding: 12px 0 10px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 14px 8px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .ops {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .ops .btn {
    font-family: var(--mono);
    min-height: 28px;
    padding: 0 8px;
  }

  .ops .btn.current {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .lines {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: line;
    font-size: 0.95rem;
  }

  li {
    counter-increment: line;
    display: flex;
    gap: 10px;
    padding: 3px 14px;
    border-left: 4px solid transparent;
    white-space: pre;
    overflow-x: auto;
  }

  li::before {
    content: counter(line);
    min-width: 1.5em;
    text-align: right;
    color: var(--text-2);
    font-family: var(--mono);
    font-size: 0.85em;
    padding-top: 0.1em;
  }

  li.active {
    background: var(--code-hl);
    border-left-color: var(--c-active);
    font-weight: 700;
  }

  li.error {
    border-left-color: var(--c-error);
    background: color-mix(in srgb, var(--c-error) 16%, var(--surface));
  }
</style>
