<script lang="ts">
  import { parseScript, toScript } from '../engine/script';
  import { formatCall, type Session } from './session.svelte';
  import { notify } from './state.svelte';

  let { session }: { session: Session } = $props();

  const entries = $derived(session.entries);
  const current = $derived(session.current.op);

  // The script box starts as the current history; editing it does not change anything until run.
  let script = $state('');
  let edited = $state(false);
  let error = $state('');
  $effect(() => {
    const text = toScript(entries.map((e) => e.call));
    if (!edited) script = text;
  });

  function runScript(mode: 'append' | 'restart') {
    const r = parseScript(session.def, script);
    if ('error' in r) {
      error = r.error;
      return;
    }
    error = '';
    edited = false;
    if (mode === 'restart') {
      session.fill(r.calls);
      notify(`Started over with ${r.calls.length} operations.`);
    } else {
      session.run(r.calls);
    }
  }
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

  <details class="script">
    <summary>Type a script</summary>
    <p class="muted">
      One operation per line, or separated by <code>;</code>. For example
      <code>push 10 20; pop</code>. Lines starting with <code>#</code> are comments. It starts as your
      history, so you can edit and replay it.
    </p>
    <label class="visually-hidden" for="script-text">Script</label>
    <textarea
      id="script-text"
      class="field"
      rows="6"
      spellcheck="false"
      bind:value={script}
      oninput={() => (edited = true)}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? 'script-error' : undefined}></textarea>
    {#if error}<p id="script-error" class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button class="btn small" onclick={() => runScript('restart')}
        >Start over with this script</button
      >
      <button class="btn small" onclick={() => runScript('append')}
        >Run after the current step</button
      >
    </div>
  </details>
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

  .script {
    margin-top: 14px;
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }

  .script summary {
    font-weight: 600;
    cursor: pointer;
  }

  .script textarea {
    width: 100%;
    min-height: 120px;
    padding: 8px 10px;
    font-family: var(--mono);
    font-size: 0.9rem;
    resize: vertical;
  }

  .error {
    color: var(--c-error);
    font-weight: 600;
    margin: 6px 0;
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
