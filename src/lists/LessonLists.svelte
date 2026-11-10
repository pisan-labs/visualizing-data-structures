<script lang="ts">
  import { tick } from 'svelte';
  import { asAccountError } from '../account/backend';
  import { LIST_LIMITS, type LessonList, type LessonListSummary } from '../account/lists';
  import { listHref, vizHref } from '../ui/route';
  import { notify } from '../ui/state.svelte';
  import { families } from '../viz/catalog';
  import { ListShelf } from './shelf.svelte';

  /**
   * "My lesson lists" (/#lists): make, rename, annotate, reorder, share and delete the reader's
   * lesson lists. Examples go into a list from each page's Examples tab ("Add to list"). Loaded
   * only for a signed-in reader (ListsRoute.svelte).
   */
  let { userId }: { userId: string } = $props();

  // A new shelf for each account.
  const shelf = $derived.by(() => {
    void userId;
    return new ListShelf();
  });
  $effect(() => {
    void shelf.refresh();
  });

  const pageTitle = (viz: string) =>
    families.flatMap((f) => f.items).find((i) => i.id === viz)?.title ?? viz;
  const name = (l: { title: string }) => l.title || 'Untitled list';
  const examples = (n: number) => `${n} ${n === 1 ? 'example' : 'examples'}`;

  let newTitle = $state('');
  let creating = $state(false);
  /** The list open for editing. */
  let editing = $state<string | null>(null);
  let confirming = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let linkText = $state('');
  // The editor's fields for the open list, and each item's note.
  let draftTitle = $state('');
  let draftNotes = $state('');
  let notes = $state<Record<string, string>>({});

  const focus = (node: HTMLElement) => node.focus();

  async function refocus(...ids: string[]) {
    await tick();
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLButtonElement | null;
      if (el && !el.disabled) return el.focus();
    }
  }

  /**
   * Run a change; a failure shows its message and leaves the lists as they were. Its buttons are
   * off meanwhile, so `then` (focus to put back) runs once they are on again.
   */
  async function act(key: string, work: () => Promise<void>, then?: () => void) {
    busy = key;
    try {
      await work();
    } catch (e) {
      notify(asAccountError(e).message, 'error');
    } finally {
      busy = null;
      then?.();
    }
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      notify('Give the list a name first.', 'error');
      document.getElementById('new-list')?.focus();
      return;
    }
    creating = true;
    try {
      const list = await shelf.create(title);
      newTitle = '';
      notify(`Made the list "${name(list)}".`);
      await open(list);
    } catch (err) {
      notify(asAccountError(err).message, 'error');
    } finally {
      creating = false;
    }
  }

  async function open(list: LessonListSummary) {
    confirming = null;
    editing = list.id;
    draftTitle = list.title;
    draftNotes = list.notes;
    try {
      const full = await shelf.load(list.id);
      notes = Object.fromEntries(full.items.map((i) => [i.id, i.note]));
    } catch (e) {
      notify(asAccountError(e).message, 'error');
      if (editing === list.id) editing = null;
    }
  }

  function toggle(list: LessonListSummary) {
    if (editing === list.id) {
      shelf.close(list.id);
      editing = null;
    } else void open(list);
  }

  function saveDetails(e: SubmitEvent, list: LessonListSummary) {
    e.preventDefault();
    void act(list.id, async () => {
      const changed = await shelf.change(list.id, { title: draftTitle, notes: draftNotes });
      draftTitle = changed.title;
      draftNotes = changed.notes;
      notify(`Saved the name and notes of "${name(changed)}".`);
    });
  }

  function share(list: LessonListSummary, box: HTMLInputElement) {
    const on = box.checked;
    void act(list.id, async () => {
      try {
        await shelf.change(list.id, { shared: on });
      } catch (e) {
        box.checked = list.shared;
        throw e;
      }
      notify(
        on
          ? `"${name(list)}" is shared: anyone with its link can play it.`
          : `"${name(list)}" is private again. Its link no longer opens it.`,
      );
    });
  }

  function copyLink(list: LessonListSummary) {
    void act(list.id, async () => {
      // A private list's link plays for nobody but its owner, so copying the link shares it.
      const turnedOn = !list.shared;
      if (turnedOn) await shelf.change(list.id, { shared: true });
      const url = location.origin + listHref(list.id);
      linkText = url;
      const shared = turnedOn ? 'Sharing is on: anyone with the link can play the list. ' : '';
      try {
        await navigator.clipboard.writeText(url);
        notify(`${shared}Link copied to the clipboard.`);
      } catch {
        notify(`${shared}Copy the link from the box below.`);
      }
    });
  }

  function remove(list: LessonListSummary) {
    void act(list.id, async () => {
      await shelf.remove(list.id);
      confirming = null;
      if (editing === list.id) editing = null;
      notify(`Deleted the list "${name(list)}". Its examples are still in your account.`);
      void refocus('new-list');
    });
  }

  function move(list: LessonList, itemId: string, dir: -1 | 1) {
    void act(
      itemId,
      () => shelf.move(list.id, itemId, dir),
      // The moved item keeps the focus; at either end, its other button.
      () =>
        void refocus(
          `${dir < 0 ? 'up' : 'down'}-${itemId}`,
          `${dir < 0 ? 'down' : 'up'}-${itemId}`,
        ),
    );
  }

  function removeItem(list: LessonList, itemId: string, title: string) {
    const items = list.items;
    const i = items.findIndex((x) => x.id === itemId);
    const neighbour = items[i + 1] ?? items[i - 1];
    void act(
      itemId,
      async () => {
        await shelf.removeItem(list.id, itemId);
        notify(`Took "${title}" out of the list. It is still in your account.`);
      },
      () =>
        void refocus(`remove-${itemId}`, neighbour ? `remove-${neighbour.id}` : `edit-${list.id}`),
    );
  }

  function saveNote(e: SubmitEvent, list: LessonList, itemId: string) {
    e.preventDefault();
    void act(itemId, async () => {
      const item = await shelf.setNote(list.id, itemId, notes[itemId] ?? '');
      notes[itemId] = item.note;
      notify(item.note ? 'Saved the note.' : 'Took the note off.');
    });
  }
</script>

<div class="lesson-lists">
  <h1>My lesson lists</h1>
  <p>
    A lesson list puts examples saved in your account, from any pages, in the order you teach them.
    Play it in class: each example opens on its own page, with Previous and Next, in Present mode
    too.
  </p>
  <p class="muted small">
    To add an example, open its page, then Examples, and under "Saved in your account" press "Add to
    list". Deleting a saved example also takes it out of every list. A shared list's link plays
    every example in it, also ones you have not shared on their own.
  </p>

  <form class="create" onsubmit={create}>
    <label for="new-list">New list</label>
    <div class="row">
      <input
        id="new-list"
        class="field grow"
        placeholder="Name it, for example: Week 3, stacks and queues"
        bind:value={newTitle}
        maxlength={LIST_LIMITS.title}
      />
      <button class="btn small" type="submit" disabled={creating}>Make the list</button>
    </div>
  </form>

  {#if shelf.status === 'error'}
    <div class="problem">
      <p role="alert">{shelf.problem}</p>
      <button class="btn small" onclick={() => shelf.refresh()}>Try again</button>
    </div>
  {:else if shelf.status === 'loading' && !shelf.lists.length}
    <p class="muted" role="status">Loading your lesson lists…</p>
  {:else if !shelf.lists.length}
    <p class="muted">No lesson lists yet. Name one above to start.</p>
  {:else}
    <ul class="lists" aria-label="Your lesson lists">
      {#each shelf.lists as list (list.id)}
        {@const full = shelf.open[list.id]}
        <li class="card" aria-busy={busy === list.id}>
          <div class="head">
            <h2>{name(list)}</h2>
            <span class="muted small">
              {examples(list.count)} · {list.shared ? 'Shared' : 'Private'}
            </span>
          </div>
          {#if list.notes && editing !== list.id}<p class="notes">{list.notes}</p>{/if}

          {#if confirming === list.id}
            <div class="confirm">
              <span>Delete the list "{name(list)}"? Its examples stay in your account.</span>
              <span class="buttons">
                <button
                  class="btn small danger"
                  onclick={() => remove(list)}
                  disabled={busy === list.id}
                  use:focus>Delete it</button
                >
                <button
                  class="btn small"
                  onclick={() => {
                    confirming = null;
                    void refocus(`delete-${list.id}`);
                  }}>Keep it</button
                >
              </span>
            </div>
          {:else}
            <div class="buttons">
              <a class="btn small" href={listHref(list.id)} aria-label="Play {name(list)}">Play</a>
              <button
                id="edit-{list.id}"
                class="btn small"
                aria-expanded={editing === list.id}
                aria-controls="editor-{list.id}"
                aria-label="Edit {name(list)}"
                onclick={() => toggle(list)}>{editing === list.id ? 'Close' : 'Edit'}</button
              >
              <button
                class="btn small"
                onclick={() => copyLink(list)}
                disabled={busy === list.id}
                aria-label="Copy link to {name(list)}">Copy link</button
              >
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={list.shared}
                  disabled={busy === list.id}
                  aria-label="Shared: {name(list)}"
                  onchange={(e) => share(list, e.currentTarget)}
                />
                Shared
              </label>
              <button
                id="delete-{list.id}"
                class="btn small"
                onclick={() => (confirming = list.id)}
                aria-label="Delete {name(list)}">Delete</button
              >
            </div>
          {/if}

          {#if editing === list.id}
            <div id="editor-{list.id}" class="editor">
              <form class="details" onsubmit={(e) => saveDetails(e, list)}>
                <label for="title-{list.id}">Name</label>
                <input
                  id="title-{list.id}"
                  class="field"
                  bind:value={draftTitle}
                  maxlength={LIST_LIMITS.title}
                />
                <label for="notes-{list.id}">Notes about the list</label>
                <textarea
                  id="notes-{list.id}"
                  class="field"
                  rows="3"
                  bind:value={draftNotes}
                  maxlength={LIST_LIMITS.notes}></textarea>
                <div>
                  <button class="btn small" type="submit" disabled={busy === list.id}
                    >Save name and notes</button
                  >
                </div>
              </form>

              <h3 id="items-{list.id}">Examples, in the order they play</h3>
              {#if !full}
                <p class="muted small" role="status">Loading the examples…</p>
              {:else if !full.items.length}
                <p class="muted small">
                  No examples yet. Open a page, then Examples, and under "Saved in your account"
                  press "Add to list".
                </p>
              {:else}
                <ol class="items" aria-labelledby="items-{list.id}">
                  {#each full.items as it, i (it.id)}
                    {@const title = it.title || 'Untitled example'}
                    <li aria-busy={busy === it.id}>
                      <div class="item-head">
                        <span class="what">
                          <span class="num">{i + 1}.</span>
                          <span class="page">{pageTitle(it.viz)}:</span>
                          {title}
                        </span>
                        <span class="buttons">
                          <button
                            id="up-{it.id}"
                            class="btn small"
                            disabled={i === 0 || busy === it.id}
                            aria-label="Move {title} up"
                            onclick={() => move(full, it.id, -1)}>↑ Up</button
                          >
                          <button
                            id="down-{it.id}"
                            class="btn small"
                            disabled={i === full.items.length - 1 || busy === it.id}
                            aria-label="Move {title} down"
                            onclick={() => move(full, it.id, 1)}>↓ Down</button
                          >
                          <a
                            class="btn small"
                            href={vizHref(it.viz, { list: list.id, item: i + 1 })}
                            aria-label="Play from {title}">Play from here</a
                          >
                          <button
                            id="remove-{it.id}"
                            class="btn small"
                            disabled={busy === it.id}
                            aria-label="Take {title} out of the list"
                            onclick={() => removeItem(full, it.id, title)}>Remove</button
                          >
                        </span>
                      </div>
                      <form class="note" onsubmit={(e) => saveNote(e, full, it.id)}>
                        <label for="note-{it.id}">Note while it plays</label>
                        <input
                          id="note-{it.id}"
                          class="field grow"
                          bind:value={notes[it.id]}
                          maxlength={LIST_LIMITS.note}
                          placeholder="Optional: what to say or ask here"
                        />
                        <button
                          class="btn small"
                          type="submit"
                          disabled={busy === it.id || (notes[it.id] ?? '') === it.note}
                          aria-label="Save the note for {title}">Save note</button
                        >
                      </form>
                    </li>
                  {/each}
                </ol>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if linkText}
    <label class="visually-hidden" for="list-link">Link to the lesson list</label>
    <input
      id="list-link"
      class="field share"
      readonly
      value={linkText}
      onfocus={(e) => e.currentTarget.select()}
    />
  {/if}
</div>

<style>
  .lesson-lists {
    display: grid;
    gap: 10px;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4vw, 2rem);
    line-height: 1.2;
  }

  p {
    max-width: 70ch;
    margin: 0;
  }

  .small {
    font-size: 0.88rem;
  }

  .create {
    display: grid;
    gap: 4px;
    margin-top: 4px;
  }

  label {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .row,
  .buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .grow {
    flex: 1 1 220px;
    min-width: 0;
  }

  ul,
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .lists {
    display: grid;
    gap: 12px;
  }

  .lists > li {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    overflow-wrap: anywhere;
  }

  .notes {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 4px;
    font-weight: 400;
    font-size: 0.9rem;
  }

  .toggle input {
    width: 18px;
    height: 18px;
    margin: 0;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    overflow-wrap: anywhere;
  }

  .danger {
    border-color: var(--c-error);
    color: var(--c-error);
    font-weight: 600;
  }

  .editor {
    display: grid;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }

  .details {
    display: grid;
    gap: 4px;
  }

  textarea {
    padding: 8px 10px;
    font: inherit;
    color: var(--text);
    resize: vertical;
  }

  h3 {
    margin: 6px 0 0;
    font-size: 1rem;
  }

  .items > li {
    display: grid;
    gap: 6px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }

  .item-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }

  .what {
    overflow-wrap: anywhere;
  }

  .num {
    font-weight: 700;
  }

  .page {
    color: var(--text-2);
  }

  .note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .note label {
    font-weight: 400;
    color: var(--text-2);
  }

  .problem {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .problem p {
    color: var(--c-error);
    font-weight: 600;
  }

  .share {
    width: 100%;
    font-family: var(--mono);
    font-size: 0.8rem;
  }
</style>
