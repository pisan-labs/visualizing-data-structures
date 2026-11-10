<script lang="ts">
  import { marked } from 'marked';
  import { tick } from 'svelte';
  import { makeExample } from '../engine/example';
  import { answerText, isCorrect, practiceSet } from '../engine/practice';
  import { randomSeed } from '../engine/rng';
  import type { PracticeQuestion } from '../engine/types';
  import { attemptKey, pageSummary, recordAttempt } from '../progress/progress';
  import { now, progress } from './progress.svelte';
  import type { Session } from './session.svelte';
  import { notify } from './state.svelte';
  import Thumbnail from './Thumbnail.svelte';
  import Worksheet from './Worksheet.svelte';
  import { assignmentLink, practiceScene } from './worksheet';

  let {
    session,
    seed: initialSeed = null,
    count: initialCount = 5,
  }: { session: Session; seed?: number | null; count?: number } = $props();

  // Seeds are kept short so they are easy to read out in class.
  const newSeed = () => (randomSeed() % 90000) + 10000;
  // svelte-ignore state_referenced_locally
  let seed = $state(initialSeed ?? newSeed());
  // svelte-ignore state_referenced_locally
  let count = $state([3, 5, 10].includes(initialCount) ? initialCount : 5);

  const def = $derived(session.def);
  const items = $derived(practiceSet(def, seed, count));

  let responses = $state<string[]>([]);
  let checked = $state<boolean[]>([]);
  $effect(() => {
    void items;
    responses = items.map(() => '');
    checked = items.map(() => false);
  });

  const results = $derived(
    items.map((it, i) => checked[i] && isCorrect(it.question.answer, responses[i] ?? '')),
  );
  const done = $derived(checked.filter(Boolean).length);
  const right = $derived(results.filter(Boolean).length);

  const inline = (s: string) => marked.parseInline(s, { async: false }) as string;

  // The reader's first tries on this page, kept in the browser (src/progress/progress.ts).
  const record = $derived(pageSummary(progress.current, def.id));

  function check(i: number) {
    checked[i] = true;
    const right = isCorrect(items[i]!.question.answer, responses[i] ?? '');
    progress.update((p) => recordAttempt(p, def.id, attemptKey(seed, i), right, now()));
  }

  // A worksheet to print: this set's questions, 5 or 10 of them, with an answer key.
  // svelte-ignore state_referenced_locally
  let sheetCount = $state(count === 10 ? 10 : 5);
  let sheetKey = $state(true);
  let printing = $state<{ count: number; key: boolean } | null>(null);

  async function printWorksheet() {
    printing = { count: sheetCount, key: sheetKey };
    await tick();
    const root = document.documentElement;
    const title = document.title;
    // The title names the file when the sheet is saved as a PDF.
    document.title = `${def.title} worksheet, set ${seed}`;
    root.classList.add('printing-worksheet');
    addEventListener(
      'afterprint',
      () => {
        root.classList.remove('printing-worksheet');
        document.title = title;
        printing = null;
      },
      { once: true },
    );
    print();
  }

  function watch(q: PracticeQuestion) {
    const settings = { ...def.defaults, ...q.settings };
    const ops = [...q.setup, ...(q.watch ?? [])];
    session.load(makeExample(def.id, settings, 1, ops, { op: q.setup.length - 1, step: 1e6 }));
    document.getElementById('stage-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    session.play();
  }

  async function copyAssignment() {
    const link = assignmentLink(location.origin, def.id, seed, count);
    try {
      await navigator.clipboard.writeText(link);
      notify('Assignment link copied. Everyone who opens it gets this same set.');
    } catch {
      notify(`Copy this link: ${link}`);
    }
  }
</script>

<div class="practice">
  <div class="top">
    <p class="muted">
      Answer from the picture, then check. Each set comes from a number, so the same link gives
      everyone the same questions.
    </p>
    {#if record.practiceTried}
      <p class="record">
        Your first tries on this page so far: {record.practiceRight} of {record.practiceTried}
        right.
      </p>
    {/if}
    <div class="row">
      <label>
        Questions
        <select class="field" bind:value={count}>
          {#each [3, 5, 10] as n (n)}
            <option value={n}>{n}</option>
          {/each}
        </select>
      </label>
      <span class="seed">Set <code>{seed}</code></span>
      <button class="btn small" onclick={() => (seed = newSeed())}>New set</button>
      <button class="btn small" onclick={copyAssignment}>Copy assignment link</button>
    </div>
    {#if items.length}
      <details class="sheet">
        <summary class="btn small">Print a worksheet</summary>
        <div class="sheet-form">
          <fieldset>
            <legend>How many questions</legend>
            {#each [5, 10] as n (n)}
              <label><input type="radio" value={n} bind:group={sheetCount} /> {n}</label>
            {/each}
          </fieldset>
          <label><input type="checkbox" bind:checked={sheetKey} /> Answer key on its own page</label
          >
          <p class="muted">
            The questions come from this set's number, so they match the assignment link's. The
            sheet shows the number and the link.
          </p>
          <button class="btn small primary" onclick={printWorksheet}>Print the worksheet</button>
        </div>
      </details>
    {/if}
  </div>

  {#if printing}
    <Worksheet {def} {seed} count={printing.count} key={printing.key} />
  {/if}

  {#if items.length === 0}
    <p class="muted">There are no practice questions for this page yet.</p>
  {/if}

  {#each items as it, i (i)}
    {@const q = it.question}
    <section class="question card" aria-labelledby="q-{i}">
      <h3 id="q-{i}">
        <span class="n">{i + 1}.</span>
        {it.kind.title}
      </h3>
      <!-- Inline Markdown written by our own generators. -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <p class="prompt">{@html inline(q.prompt)}</p>
      <Thumbnail scene={practiceScene(def, q)} />
      <form
        class="answer"
        onsubmit={(e) => {
          e.preventDefault();
          check(i);
        }}
      >
        {#if q.answer.kind === 'choice'}
          <fieldset>
            <legend class="visually-hidden">Choose one</legend>
            {#each q.answer.options as option, k (k)}
              <label class="choice">
                <input
                  type="radio"
                  name="q{i}"
                  value={String(k)}
                  bind:group={responses[i]}
                  disabled={checked[i]}
                />
                {option}
              </label>
            {/each}
          </fieldset>
        {:else}
          <label class="visually-hidden" for="a-{i}">Your answer</label>
          <input
            id="a-{i}"
            class="field"
            inputmode={q.answer.kind === 'number' ? 'numeric' : 'text'}
            autocomplete="off"
            placeholder={q.answer.kind === 'number' ? 'A number' : 'Values separated by spaces'}
            bind:value={responses[i]}
            disabled={checked[i]}
          />
        {/if}
        <div class="buttons">
          {#if !checked[i]}
            <button class="btn small primary" type="submit">Check</button>
          {:else}
            <button
              class="btn small"
              type="button"
              onclick={() => {
                checked[i] = false;
                responses[i] = '';
              }}>Try again</button
            >
          {/if}
          {#if checked[i] && q.watch?.length}
            <button class="btn small" type="button" onclick={() => watch(q)}>Show me</button>
          {/if}
        </div>
      </form>
      <div aria-live="polite">
        {#if checked[i]}
          <p class="feedback" class:ok={results[i]}>
            <strong
              >{results[i] ? 'Yes.' : `Not quite. The answer is ${answerText(q.answer)}.`}</strong
            >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html inline(q.explain)}
          </p>
        {/if}
      </div>
    </section>
  {/each}

  {#if items.length}
    <p class="score" aria-live="polite">
      {#if done === items.length}
        <strong>{right} of {items.length} right.</strong>
        {right === items.length ? 'All of them.' : 'Try a new set, or watch the ones you missed.'}
      {:else}
        {done} of {items.length} checked.
      {/if}
    </p>
  {/if}
</div>

<style>
  .practice {
    display: grid;
    gap: 14px;
  }

  .top p {
    margin: 0 0 8px;
    font-size: 0.92rem;
  }

  .top .record {
    font-size: 0.85rem;
    color: var(--text-2);
  }

  .sheet {
    margin-top: 10px;
  }

  .sheet summary::after {
    content: '▾';
    font-size: 0.8em;
  }

  .sheet[open] summary::after {
    content: '▴';
  }

  .sheet-form {
    display: grid;
    justify-items: start;
    gap: 8px;
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  .sheet-form fieldset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
  }

  .sheet-form legend {
    float: left;
    margin-right: 6px;
    padding: 0;
  }

  .sheet-form label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
  }

  .sheet-form p {
    margin: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .row label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .row select {
    min-height: 32px;
  }

  .question {
    padding: 12px 14px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 1rem;
  }

  .n {
    color: var(--text-2);
  }

  .prompt {
    margin: 0 0 8px;
  }

  .answer {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }

  .answer .field {
    max-width: 320px;
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  .feedback {
    margin: 8px 0 0;
  }

  .feedback strong {
    color: var(--c-error);
  }

  .feedback.ok strong {
    color: var(--c-new);
  }

  .score {
    margin: 0;
  }
</style>
