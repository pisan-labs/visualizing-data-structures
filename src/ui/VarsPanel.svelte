<script lang="ts">
  import type { Scalar } from '../engine/types';
  import type { Session } from './session.svelte';

  let { session }: { session: Session } = $props();
  // Unique per instance: a compare page shows two of these.
  const uid = $props.id();

  const vars = $derived(Object.entries(session.current.step.vars ?? {}));
  const before = $derived.by(() => {
    const p = session.timeline.prev(session.cursor, session.detail);
    return p === null ? {} : (session.timeline.at(p).step.vars ?? {});
  });
  const fmt = (v: Scalar) => (typeof v === 'string' ? `"${v}"` : String(v));
</script>

<section class="vars card" aria-labelledby="{uid}-vars">
  <h2 id="{uid}-vars">Variables</h2>
  {#if vars.length}
    <dl>
      {#each vars as [name, value] (name)}
        <div class:changed={name in before && before[name] !== value}>
          <dt><code>{name}</code></dt>
          <dd><code>{fmt(value)}</code></dd>
        </div>
      {/each}
    </dl>
  {:else}
    <p class="muted">No variables at this step.</p>
  {/if}
</section>

<style>
  .vars {
    padding: 12px 14px;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 1rem;
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
  }

  dl > div {
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }

  dl > div.changed {
    border-color: var(--c-active);
    box-shadow: inset 0 0 0 1px var(--c-active);
  }

  dt::after {
    content: ' =';
    color: var(--text-2);
  }

  dd {
    margin: 0;
    font-weight: 700;
  }

  p {
    margin: 0;
  }
</style>
