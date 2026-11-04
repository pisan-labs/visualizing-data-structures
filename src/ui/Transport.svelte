<script lang="ts">
  import type { Level } from '../engine/types';
  import Icon from './Icon.svelte';
  import type { Playback } from './pair.svelte';
  import type { Session } from './session.svelte';
  import { setPref } from './state.svelte';

  // `session` plays (one page, or a compare page's pair); `scrub`, when given, adds a timeline
  // slider for that one session.
  let { session, scrub }: { session: Playback; scrub?: Session } = $props();

  const visible = $derived(scrub ? scrub.timeline.visibleIndices(scrub.detail) : []);
  const pos = $derived.by(() => {
    let p = 0;
    visible.forEach((v, i) => {
      if (scrub && v <= scrub.cursor) p = i;
    });
    return p;
  });
  const speeds = [0.25, 0.5, 1, 1.5, 2, 4];
</script>

<div class="transport card" role="group" aria-label="Playback">
  <div class="buttons">
    <button
      class="icon-btn"
      onclick={() => session.prevOp()}
      disabled={session.atStart}
      aria-label="Back to the previous operation"
      title="Previous operation"
    >
      <Icon name="op-back" />
    </button>
    <button
      class="icon-btn"
      onclick={() => session.stepBack()}
      disabled={session.atStart}
      aria-label="Step back"
      title="Step back (Left arrow)"
    >
      <Icon name="step-back" />
    </button>
    <button
      class="icon-btn primary play"
      onclick={() => session.toggle()}
      aria-label={session.playing ? 'Pause' : 'Play'}
      title="Play or pause (Space)"
    >
      <Icon name={session.playing ? 'pause' : 'play'} size={24} />
    </button>
    <button
      class="icon-btn"
      onclick={() => session.stepForward()}
      disabled={session.atEnd}
      aria-label="Step forward"
      title="Step forward (Right arrow)"
    >
      <Icon name="step-forward" />
    </button>
    <button
      class="icon-btn"
      onclick={() => session.nextOp()}
      disabled={session.atEnd}
      aria-label="Forward to the next operation"
      title="Next operation"
    >
      <Icon name="op-forward" />
    </button>
  </div>

  {#if scrub}
    <input
      class="scrub"
      type="range"
      min="0"
      max={Math.max(0, visible.length - 1)}
      value={pos}
      disabled={visible.length < 2}
      aria-label="Timeline"
      aria-valuetext="Step {pos + 1} of {visible.length}"
      oninput={(e) => scrub.jump(visible[Number(e.currentTarget.value)] ?? 0)}
    />
  {/if}

  <div class="selects">
    <label>
      <span>Speed</span>
      <select
        class="field"
        value={session.speed}
        onchange={(e) => {
          const v = Number(e.currentTarget.value);
          session.setSpeed(v);
          setPref('speed', v);
        }}
      >
        {#each speeds as s (s)}
          <option value={s}>{s}×</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Detail</span>
      <select
        class="field"
        value={session.detail}
        onchange={(e) => {
          const v = Number(e.currentTarget.value) as Level;
          session.setDetail(v);
          setPref('detail', v);
        }}
      >
        <option value={1}>Milestones</option>
        <option value={2}>Normal</option>
        <option value={3}>Every detail</option>
      </select>
    </label>
  </div>
</div>

<style>
  .transport {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    padding: 10px 12px;
  }

  .buttons {
    display: flex;
    gap: 6px;
  }

  .play {
    width: 52px;
  }

  .scrub {
    flex: 1 1 180px;
    min-width: 140px;
    accent-color: var(--accent);
    height: 32px;
  }

  .selects {
    display: flex;
    gap: 12px;
  }

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    color: var(--text-2);
  }

  select {
    min-height: 36px;
    color: var(--text);
  }

  @media (max-width: 520px) {
    .buttons {
      width: 100%;
      justify-content: space-between;
    }
    .selects {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
