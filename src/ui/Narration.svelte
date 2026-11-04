<script lang="ts">
  import { formatCall, type Session } from './session.svelte';

  let { session }: { session: Session } = $props();

  const f = $derived(session.current);
  const visible = $derived(session.timeline.visibleIndices(session.detail));
  const pos = $derived(Math.max(0, visible.filter((v) => v <= session.cursor).length - 1));
  const op = $derived(f.op >= 0 ? formatCall(session.timeline.entries[f.op]!.call) : 'Start');
  const isError = $derived(f.step.marks.some((m) => m.role === 'error'));
</script>

<section class="narration card" class:error={isError} aria-label="What is happening">
  <div class="meta">
    <span class="chip"><code>{op}</code></span>
    <span class="muted">Step {pos + 1} of {visible.length}</span>
  </div>
  <p aria-live="polite">{f.step.say}</p>
</section>

<style>
  .narration {
    padding: 12px 16px;
    border-left: 5px solid var(--accent);
  }

  .narration.error {
    border-left-color: var(--c-error);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
  }

  .chip {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-2);
  }

  p {
    margin: 6px 0 2px;
    font-size: 1.08rem;
    line-height: 1.5;
    min-height: 3em;
  }
</style>
