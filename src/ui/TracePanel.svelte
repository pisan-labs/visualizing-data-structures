<script lang="ts">
  import type { Scalar } from '../engine/types';
  import { formatCall, type Session } from './session.svelte';
  import { notify } from './state.svelte';

  let { session }: { session: Session } = $props();

  // One row per step shown at the current detail level, built from each step's variables.
  const rows = $derived.by(() => {
    const t = session.timeline;
    return t.visibleIndices(session.detail).map((i, n) => {
      const f = t.at(i);
      return {
        i,
        n: n + 1,
        op: f.op >= 0 ? formatCall(t.entries[f.op]!.call) : 'Start',
        say: f.step.say,
        vars: f.step.vars ?? {},
      };
    });
  });
  const columns = $derived([...new Set(rows.flatMap((r) => Object.keys(r.vars)))]);

  const fmt = (v: Scalar | undefined) =>
    v === undefined ? '' : typeof v === 'string' ? `"${v}"` : String(v);

  function table(): string[][] {
    return [
      ['#', 'operation', ...columns, 'what happened'],
      ...rows.map((r) => [String(r.n), r.op, ...columns.map((c) => fmt(r.vars[c])), r.say]),
    ];
  }

  const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const mdCell = (s: string) => s.replace(/\|/g, '\\|');

  async function copy(kind: 'csv' | 'md') {
    const t = table();
    const text =
      kind === 'csv'
        ? t.map((row) => row.map(csvCell).join(',')).join('\n')
        : [
            `| ${t[0]!.map(mdCell).join(' | ')} |`,
            `|${t[0]!.map(() => '---').join('|')}|`,
            ...t.slice(1).map((row) => `| ${row.map(mdCell).join(' | ')} |`),
          ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify(kind === 'csv' ? 'Trace copied as CSV.' : 'Trace copied as Markdown.');
    } catch {
      notify('This browser did not allow copying.', 'error');
    }
  }
</script>

<div class="trace">
  <div class="top">
    <p class="muted">
      One row per step at the current detail level. Pick a row to jump there. Paste a copy into a
      spreadsheet or your notes.
    </p>
    <div class="actions">
      <button class="btn small" onclick={() => copy('csv')}>Copy as CSV</button>
      <button class="btn small" onclick={() => copy('md')}>Copy as Markdown</button>
    </div>
  </div>
  <!-- Wide tables scroll sideways; the region must be reachable by keyboard (WCAG 2.1.1). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="wrap" role="region" aria-label="Trace table" tabindex="0">
    <table>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Operation</th>
          {#each columns as c (c)}
            <th scope="col"><code>{c}</code></th>
          {/each}
          <th scope="col">What happened</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.i)}
          <tr class:current={r.i === session.cursor}>
            <td>
              <button
                class="jump"
                aria-current={r.i === session.cursor ? 'step' : undefined}
                aria-label="Jump to step {r.n}"
                onclick={() => session.jump(r.i)}>{r.n}</button
              >
            </td>
            <td><code>{r.op}</code></td>
            {#each columns as c (c)}
              <td class="num"><code>{fmt(r.vars[c])}</code></td>
            {/each}
            <td class="say">{r.say}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  .top p {
    margin: 0;
    flex: 1 1 260px;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .wrap {
    max-height: 420px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.86rem;
  }

  th,
  td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    z-index: 1;
  }

  td.say {
    white-space: normal;
    min-width: 260px;
  }

  tr.current td {
    background: var(--code-hl);
  }

  .jump {
    min-width: 32px;
    min-height: 28px;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--surface);
    font-family: var(--mono);
  }
</style>
