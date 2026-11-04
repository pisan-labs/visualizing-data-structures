<script module lang="ts">
  export interface Check {
    question: string;
    options: { text: string; correct: boolean }[];
    explain: string;
  }
</script>

<script lang="ts">
  import { marked } from 'marked';

  let { check, n }: { check: Check; n: number } = $props();

  let picked = $state<number | null>(null);
  const inline = (s: string) => marked.parseInline(s, { async: false }) as string;
  const correct = $derived(picked !== null && check.options[picked]!.correct);
</script>

<!-- Inline Markdown from our own concept pages. -->
<div class="check" role="group" aria-labelledby="check-q-{n}">
  <p class="q" id="check-q-{n}">
    <span class="tag">Check yourself</span>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html inline(check.question)}
  </p>
  <div class="options">
    {#each check.options as o, i (i)}
      <button
        class="opt"
        class:right={picked !== null && o.correct}
        class:wrong={picked === i && !o.correct}
        aria-pressed={picked === i}
        disabled={picked !== null && picked !== i && !o.correct}
        onclick={() => (picked = i)}
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html inline(o.text)}
      </button>
    {/each}
  </div>
  <div aria-live="polite">
    {#if picked !== null}
      <p class="result" class:ok={correct}>
        <strong>{correct ? 'Yes.' : 'Not quite.'}</strong>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html inline(check.explain)}
      </p>
      <button class="btn small" onclick={() => (picked = null)}>Try again</button>
    {/if}
  </div>
</div>

<style>
  .check {
    margin: 14px 0;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-left: 5px solid var(--c-found);
    border-radius: 10px;
    background: var(--surface-2);
  }

  .q {
    margin: 0 0 8px;
  }

  .tag {
    display: inline-block;
    margin-right: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--c-found);
  }

  .options {
    display: grid;
    gap: 6px;
  }

  .opt {
    text-align: left;
    padding: 8px 12px;
    min-height: 40px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
  }

  .opt:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .opt.right {
    border-color: var(--c-new);
    box-shadow: inset 0 0 0 2px var(--c-new);
  }

  .opt.right::after {
    content: ' ✓';
    color: var(--c-new);
    font-weight: 700;
  }

  .opt.wrong {
    border-color: var(--c-error);
    box-shadow: inset 0 0 0 2px var(--c-error);
  }

  .opt.wrong::after {
    content: ' ✗';
    color: var(--c-error);
    font-weight: 700;
  }

  .opt:disabled {
    opacity: 0.6;
  }

  .result {
    margin: 10px 0 6px;
  }

  .result.ok strong {
    color: var(--c-new);
  }
</style>
