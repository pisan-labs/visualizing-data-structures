<script lang="ts">
  import type { Session } from './session.svelte';
  import { notify, prefs, setPref, type CodeView } from './state.svelte';

  let { session }: { session: Session } = $props();

  const code = $derived(session.def.code);
  const views = $derived<{ id: CodeView; label: string }[]>([
    { id: 'formal', label: 'Pseudocode' },
    { id: 'plain', label: 'Plain English' },
    ...(code
      ? ([
          { id: 'python', label: 'Python' },
          { id: 'java', label: 'Java' },
          { id: 'cpp', label: 'C++' },
        ] as const)
      : []),
  ]);
  // A saved choice of a language this page lacks falls back to pseudocode.
  const view = $derived(views.some((v) => v.id === prefs.codeView) ? prefs.codeView : 'formal');
  const isSource = $derived(view === 'python' || view === 'java' || view === 'cpp');
  const source = $derived(
    code && isSource ? code[view as 'python' | 'java' | 'cpp'].replace(/\s+$/, '') : '',
  );

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

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      notify('Code copied to the clipboard.');
    } catch {
      notify('Select the code and copy it by hand.', 'error');
    }
  }
</script>

<section class="code card" aria-labelledby="code-heading">
  <div class="head">
    <h2 id="code-heading">Code</h2>
    <label class="view">
      <span class="visually-hidden">Show the code as</span>
      <select
        class="field"
        value={view}
        onchange={(e) => setPref('codeView', e.currentTarget.value as CodeView)}
      >
        {#each views as v (v.id)}
          <option value={v.id}>{v.label}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if isSource}
    <p class="note muted">
      Real code, tested against this visualization on every change. It follows the default options
      and is not synced with the steps: the pseudocode is.
      <button class="btn small copy" onclick={copySource}>Copy</button>
    </p>
    <!-- Scrollable code must be reachable by keyboard (WCAG 2.1.1). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre
      class="source"
      role="region"
      tabindex="0"
      aria-label="{views.find((v) => v.id === view)?.label} code"><code
        >{#each source.split('\n') as line, i (i)}<span class="ln"
            >{line}
</span>{/each}</code
      ></pre>
  {:else}
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
    {#if block}
      <ol class="lines" class:plain={view === 'plain'}>
        {#each block.lines as l (l.id)}
          <li
            class:active={active.has(l.id)}
            class:error={isError && active.has(l.id)}
            aria-current={active.has(l.id) ? 'step' : undefined}
          >
            {#if view === 'plain'}
              <span class="text" style:padding-left="{l.indent * 1.5}ch">{l.plain}</span>
            {:else}
              <code style:padding-left="{l.indent * 2}ch">{l.text}</code>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</section>

<style>
  .code {
    padding: 12px 0 10px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 14px 8px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .view select {
    min-height: 34px;
  }

  .ops {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 14px 8px;
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

  .plain li {
    white-space: normal;
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

  .note {
    margin: 0 14px 8px;
    font-size: 0.85rem;
  }

  .copy {
    margin-left: 6px;
    min-height: 26px;
  }

  .source {
    margin: 0;
    padding: 6px 14px 6px 0;
    max-height: 420px;
    overflow: auto;
    font-size: 0.86rem;
    line-height: 1.45;
    counter-reset: src;
    background: var(--surface-2);
  }

  .source .ln {
    counter-increment: src;
  }

  .source .ln::before {
    content: counter(src);
    display: inline-block;
    width: 3em;
    padding-right: 0.8em;
    text-align: right;
    color: var(--text-2);
    user-select: none;
  }
</style>
