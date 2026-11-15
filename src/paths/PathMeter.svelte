<script lang="ts">
  import type { PathProgress } from './paths';

  /** A path's progress: a bar, the percent, and the count of steps done. */
  let { state, compact = false }: { state: PathProgress; compact?: boolean } = $props();
</script>

<div class="meter" class:compact>
  <div
    class="bar"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={state.percent}
    aria-valuetext="{state.percent}% complete, {state.finished} of {state.total} steps done"
    aria-label="Path progress"
  >
    <span class="fill" style:width="{state.percent}%"></span>
  </div>
  <p class="text">
    <strong>{state.percent}%</strong>
    <span class="muted">· {state.finished} of {state.total} steps done</span>
  </p>
</div>

<style>
  .meter {
    display: grid;
    gap: 4px;
  }

  .bar {
    height: 10px;
    border-radius: 5px;
    background: var(--cell-empty);
    border: 1px solid var(--line);
    overflow: hidden;
  }

  .compact .bar {
    height: 6px;
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--c-done);
  }

  .text {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
