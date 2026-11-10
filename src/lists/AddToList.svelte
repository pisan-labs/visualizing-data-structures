<script lang="ts">
  import { onMount } from 'svelte';
  import { asAccountError } from '../account/backend';
  import { LIST_LIMITS } from '../account/lists';
  import { listsHref } from '../ui/route';
  import { notify } from '../ui/state.svelte';
  import type { ListShelf } from './shelf.svelte';

  /**
   * "Add to a lesson list" for one example saved in the account (AccountExamples.svelte): pick
   * one of the reader's lists, or name a new one, and the example goes at its end.
   */
  let {
    shelf,
    exampleId,
    title,
    onclose,
  }: { shelf: ListShelf; exampleId: string; title: string; onclose: () => void } = $props();

  const NEW = 'new';
  let choice = $state('');
  let newTitle = $state('');
  let busy = $state(false);

  // The reader's lists load the first time a picker opens.
  onMount(() => void shelf.ensure());
  // The most recently changed list is picked; with none, a new one.
  $effect(() => {
    if (shelf.status === 'ready' && !choice) choice = shelf.lists[0]?.id ?? NEW;
  });

  const focus = (node: HTMLElement) => node.focus();

  async function add(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      let target = shelf.lists.find((l) => l.id === choice);
      if (!target) {
        if (!newTitle.trim()) {
          notify('Give the new list a name first.', 'error');
          document.getElementById(`new-list-${exampleId}`)?.focus();
          return;
        }
        target = await shelf.create(newTitle);
      }
      await shelf.add(target.id, exampleId);
      notify(`Added "${title}" to "${target.title || 'Untitled list'}".`);
      onclose();
    } catch (err) {
      notify(asAccountError(err).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<form class="add-to-list" onsubmit={add} aria-label="Add {title} to a lesson list">
  {#if shelf.status === 'error'}
    <p class="problem" role="alert">{shelf.problem}</p>
  {:else if shelf.status === 'loading' && !shelf.lists.length}
    <p class="muted" role="status">Loading your lesson lists…</p>
  {:else}
    {#if shelf.lists.length}
      <label for="pick-list-{exampleId}">Lesson list</label>
      <select id="pick-list-{exampleId}" class="field" bind:value={choice} use:focus>
        {#each shelf.lists as l (l.id)}
          <option value={l.id}>{l.title || 'Untitled list'} ({l.count})</option>
        {/each}
        <option value={NEW}>A new list…</option>
      </select>
    {/if}
    {#if choice === NEW || !shelf.lists.length}
      <label for="new-list-{exampleId}">Name of the new list</label>
      <input
        id="new-list-{exampleId}"
        class="field"
        bind:value={newTitle}
        maxlength={LIST_LIMITS.title}
        placeholder="For example: Week 3, stacks"
        use:focus
      />
    {/if}
  {/if}
  <span class="buttons">
    <button class="btn small" type="submit" disabled={busy || shelf.status !== 'ready'}>
      {choice === NEW || !shelf.lists.length ? 'Make the list and add' : 'Add'}
    </button>
    <button class="btn small" type="button" onclick={onclose}>Cancel</button>
    <a class="small" href={listsHref}>My lesson lists</a>
  </span>
</form>

<style>
  /* A select is as wide as its longest list name: let it shrink instead of widening the page. */
  .add-to-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    padding: 6px 0 2px;
  }

  label {
    font-size: 0.88rem;
    font-weight: 600;
  }

  select,
  input {
    flex: 1 1 180px;
    width: 0;
    min-width: 0;
    max-width: 100%;
    min-height: 32px;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  p {
    margin: 0;
    font-size: 0.88rem;
  }

  .problem {
    color: var(--c-error);
    font-weight: 600;
  }

  .small {
    font-size: 0.88rem;
  }
</style>
