<script lang="ts">
  import { summaryText, type PageSummary } from '../progress/progress';

  /**
   * A page's mark in the catalog: a small pie that fills as its lessons are read, and a check
   * mark once every lesson is read and every check answered right. The words are there for
   * screen readers and as a tooltip.
   */
  let { summary }: { summary: PageSummary } = $props();

  const text = $derived(summaryText(summary));
  // Started counts for something even before a lesson is read (a check, a practice question).
  const share = $derived(
    Math.min(
      0.999,
      Math.max(0.125, summary.lessonsTotal ? summary.lessonsRead / summary.lessonsTotal : 0),
    ),
  );
  // A slice from the top, clockwise, for the share of lessons read.
  const slice = $derived.by(() => {
    const a = share * 2 * Math.PI;
    const x = 8 + 6 * Math.sin(a);
    const y = 8 - 6 * Math.cos(a);
    return `M8 8V2A6 6 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`;
  });
</script>

<span class="mark" title={text}>
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    {#if summary.finished}
      <circle cx="8" cy="8" r="7.5" class="done" />
      <path d="M4.5 8.2l2.3 2.3 4.7-4.9" class="tick" />
    {:else}
      <circle cx="8" cy="8" r="6.75" class="rim" />
      <path d={slice} class="slice" />
    {/if}
  </svg>
  <span class="visually-hidden">{summary.finished ? 'Finished' : 'Started'}: {text}.</span>
</span>

<style>
  .mark {
    display: inline-flex;
    flex: none;
  }

  .rim {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 1.5;
  }

  .slice {
    fill: var(--accent);
  }

  .done {
    fill: var(--c-new);
  }

  .tick {
    fill: none;
    stroke: var(--surface);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
