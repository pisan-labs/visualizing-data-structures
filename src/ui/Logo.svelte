<script lang="ts">
  /** The StepWise mark: a staircase of array cells; the amber cell is "the current step". */
  let { size = 28 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <g class="cells">
    <rect x="4" y="44" width="16" height="16" rx="3.5" opacity=".55" />
    <rect x="24" y="44" width="16" height="16" rx="3.5" opacity=".78" />
    <rect x="24" y="24" width="16" height="16" rx="3.5" opacity=".78" />
    <rect x="44" y="44" width="16" height="16" rx="3.5" />
    <rect x="44" y="24" width="16" height="16" rx="3.5" />
  </g>
  <rect x="44" y="4" width="16" height="16" rx="3.5" class="current" />
</svg>

<style>
  .cells {
    fill: var(--accent);
  }

  .current {
    fill: #f5a524;
  }
</style>
