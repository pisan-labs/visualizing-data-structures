<script lang="ts">
  import { tick } from 'svelte';
  import { account } from '../account/account.svelte';
  import { pageSummary } from '../progress/progress';
  import { families, isLive, pathways } from '../viz/catalog';
  import { progress } from './progress.svelte';
  import { notify } from './state.svelte';

  /**
   * The catalog's progress line: per course pathway, how many of its pages the reader has
   * started and finished, and "Reset my progress". Nothing shows until there is progress.
   */
  const counts = $derived(
    pathways.map((pw) => {
      const ids = [
        ...new Set(
          families
            .filter((f) => f.pathways.includes(pw.id))
            .flatMap((f) => f.items.map((i) => i.id))
            .filter(isLive),
        ),
      ];
      const summaries = ids.map((id) => pageSummary(progress.current, id));
      return {
        ...pw,
        total: ids.length,
        started: summaries.filter((s) => s.started).length,
        finished: summaries.filter((s) => s.finished).length,
      };
    }),
  );
  const any = $derived(counts.some((c) => c.started > 0));

  let confirming = $state(false);
  let keep: HTMLButtonElement | undefined = $state();

  async function ask() {
    confirming = true;
    await tick();
    keep?.focus();
  }

  function reset() {
    progress.reset();
    confirming = false;
    document.getElementById('main')?.focus({ preventScroll: true });
    notify('Your progress is reset.');
  }
</script>

{#if any}
  <section class="progress" aria-labelledby="progress-title">
    <h2 id="progress-title">Your progress</h2>
    <ul>
      {#each counts as c (c.id)}
        <li>
          <span class="name">{c.label}:</span>
          <span class="count"
            >{c.started} of {c.total} pages started{c.finished
              ? `, ${c.finished} finished`
              : ''}</span
          >
        </li>
      {/each}
    </ul>
    <div class="reset">
      <p class="muted">
        {account.user ? 'Kept in this browser and in your account.' : 'Kept in this browser only.'}
      </p>
      {#if !confirming}
        <button class="btn small" onclick={ask}>Reset my progress</button>
      {:else}
        <div class="confirm" role="group" aria-labelledby="reset-question">
          <p id="reset-question">
            Clear the lessons read, checks answered and practice scores on every page?
          </p>
          <button class="btn small danger" onclick={reset}>Reset</button>
          <button class="btn small" bind:this={keep} onclick={() => (confirming = false)}
            >Keep my progress</button
          >
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .progress {
    margin-top: 18px;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 6px;
  }

  .name {
    font-weight: 600;
  }

  .count {
    color: var(--text-2);
  }

  .reset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin-top: 6px;
  }

  .reset p {
    margin: 0;
    font-size: 0.88rem;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }

  .confirm p {
    flex-basis: 100%;
    color: var(--text);
  }

  .danger {
    border-color: var(--c-error);
    color: var(--c-error);
  }
</style>
