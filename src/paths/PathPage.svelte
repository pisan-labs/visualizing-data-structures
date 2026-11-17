<script lang="ts">
  import { onMount } from 'svelte';
  import { SITE_NAME } from '../site';
  import ProgressMark from '../ui/ProgressMark.svelte';
  import { progress } from '../ui/progress.svelte';
  import { vizHref } from '../ui/route';
  import { summaryText } from '../progress/progress';
  import { findPath, pathProgress, vizTitle } from './paths';
  import PathMeter from './PathMeter.svelte';

  /**
   * A learning path's page (/path/<id>/): who it is for, how far the reader is, a button to the
   * next step, and the steps by stage, each with its note and the page's progress mark.
   */
  let { id }: { id: string } = $props();

  const path = $derived(findPath(id));
  const state = $derived(path ? pathProgress(progress.current, path) : undefined);

  onMount(() => {
    document.title = path ? `${path.title} · ${SITE_NAME}` : `Not here yet · ${SITE_NAME}`;
  });

  const stepHref = (viz: string) => vizHref(viz, { path: id });
</script>

{#if !path || !state}
  <div class="missing">
    <h1>Not here yet</h1>
    <p>There is no learning path called "{id}" on this site.</p>
    <p><a href="/">See all visualizations</a></p>
  </div>
{:else}
  <article class="path">
    <p class="crumb"><a href="/">← All visualizations</a></p>
    <header>
      <p class="audience">{path.audience}</p>
      <h1>{path.title}</h1>
      <p class="intro">{path.intro}</p>
    </header>

    <section class="where card" aria-label="Your progress on this path">
      <PathMeter {state} />
      {#if state.next}
        <a class="btn primary" href={stepHref(state.next.step.viz)}>
          {state.finished || state.started ? 'Continue' : 'Start'}: step {state.next.n},
          {vizTitle(state.next.step.viz)}
        </a>
      {:else}
        <p class="done">All {state.total} steps done.</p>
      {/if}
    </section>

    {#each path.stages as stage, si (stage.title)}
      <section class="stage" aria-labelledby="stage-{si}">
        <h2 id="stage-{si}">{stage.title}</h2>
        <ol>
          {#each stage.steps as step (step.viz)}
            {@const s = state.steps.find((x) => x.step === step)!}
            <li class="card" class:next={state.next === s} class:finished={s.summary.finished}>
              <span class="n" aria-hidden="true">{s.n}</span>
              <div class="body">
                <a class="title" href={stepHref(step.viz)}>{vizTitle(step.viz)}</a>
                <p class="note">{step.note}</p>
                <p class="status muted">
                  {#if s.summary.finished}
                    Done
                  {:else if s.summary.started}
                    {summaryText(s.summary)}
                  {:else}
                    Not started
                  {/if}
                </p>
              </div>
              {#if s.summary.started}<ProgressMark summary={s.summary} />{/if}
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  </article>
{/if}

<style>
  .path,
  .missing {
    max-width: var(--col-path);
    margin: 0 auto;
    padding: 20px 16px 32px;
  }

  .crumb {
    margin: 0 0 8px;
  }

  .audience {
    margin: 0;
    color: var(--text-2);
    font-size: 0.9rem;
  }

  h1 {
    margin: 2px 0 8px;
  }

  .intro {
    margin: 0 0 16px;
  }

  .where {
    display: grid;
    gap: 12px;
    padding: 14px 16px;
  }

  .where {
    grid-template-columns: minmax(0, 1fr);
  }

  /* The button names the next page, which can be long: let it wrap on a phone. */
  .where .btn {
    justify-self: start;
    max-width: 100%;
    white-space: normal;
    text-align: left;
  }

  .done {
    margin: 0;
    font-weight: 700;
  }

  .stage h2 {
    font-size: 1.05rem;
    margin: 22px 0 8px;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  li {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 14px;
  }

  li.next {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  .n {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    font-weight: 700;
    font-size: 0.9rem;
  }

  li.finished .n {
    background: var(--c-done);
    border-color: var(--c-done);
    color: var(--surface);
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .note,
  .status {
    margin: 2px 0 0;
  }

  .status {
    font-size: 0.85rem;
  }
</style>
