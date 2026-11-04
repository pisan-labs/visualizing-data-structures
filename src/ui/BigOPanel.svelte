<script lang="ts">
  import { validateExample } from '../engine/example';
  import type { CostCase } from '../engine/types';
  import type { Session } from './session.svelte';
  import { notify } from './state.svelte';

  let { session }: { session: Session } = $props();

  const rows = $derived(session.def.complexity);
  const cases = ['best', 'average', 'worst'] as const;
  const labels = { best: 'Best', average: 'Average', worst: 'Worst' } as const;

  let shown = $state<Record<string, boolean>>({});
  const key = (r: number, c: string) => `${r}:${c}`;
  const allShown = $derived(rows.every((_, r) => cases.every((c) => shown[key(r, c)])));

  function toggleAll() {
    const next = !allShown;
    const s: Record<string, boolean> = {};
    rows.forEach((_, r) => cases.forEach((c) => (s[key(r, c)] = next)));
    shown = s;
  }

  function watch(id: string) {
    const ex = session.def.examples.find((e) => e.id === id);
    if (!ex) return;
    session.load(validateExample(session.def, ex));
    notify(`Loaded "${ex.title}". Press play or step through it.`);
    document.getElementById('stage-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const cell = (row: (typeof rows)[number], c: (typeof cases)[number]): CostCase => row[c];
</script>

<div class="bigo">
  <div class="top">
    <p class="muted">
      Guess each cost before you reveal it. Every answer comes with a reason, and most with an
      example you can watch.
    </p>
    <button class="btn small" onclick={toggleAll}>{allShown ? 'Hide all' : 'Show all'}</button>
  </div>

  {#each rows as row, r (row.op)}
    <section class="row" aria-labelledby="bigo-op-{r}">
      <h3 id="bigo-op-{r}"><code>{row.op}</code></h3>
      <div class="cases">
        {#each cases as c (c)}
          {@const v = cell(row, c)}
          <div class="case">
            <span class="label">{labels[c]}</span>
            {#if shown[key(r, c)]}
              <strong class="cost">{v.cost}</strong>
              <span class="why">{v.why}</span>
              {#if v.example}
                <button class="link" onclick={() => watch(v.example!)}>Watch it</button>
              {/if}
            {:else}
              <button
                class="btn small reveal"
                onclick={() => (shown[key(r, c)] = true)}
                aria-label="Reveal the {labels[c].toLowerCase()} case for {row.op}">Reveal</button
              >
            {/if}
          </div>
        {/each}
      </div>
      {#if row.note}<p class="note muted">{row.note}</p>{/if}
    </section>
  {/each}
</div>

<style>
  .bigo {
    display: grid;
    gap: 12px;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .top p {
    margin: 0;
    flex: 1 1 240px;
    font-size: 0.92rem;
  }

  .row {
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 0.95rem;
  }

  .cases {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .case {
    display: grid;
    align-content: start;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    min-height: 64px;
  }

  .label {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-2);
  }

  .cost {
    font-family: var(--mono);
    font-size: 1.05rem;
  }

  .why {
    font-size: 0.88rem;
  }

  .reveal {
    justify-self: start;
    margin-top: 4px;
  }

  .link {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    font-size: 0.88rem;
  }

  .note {
    margin: 6px 0 0;
    font-size: 0.86rem;
  }

  @media (max-width: 560px) {
    .cases {
      grid-template-columns: 1fr;
    }

    .case {
      min-height: 0;
    }
  }
</style>
