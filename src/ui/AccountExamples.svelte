<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { connect } from '../account/account.svelte';
  import { asAccountError, exampleOf, type AccountExample } from '../account/backend';
  import { copyBrowserExamples, notYetCopied } from '../account/library';
  import { AccountShelf } from '../account/shelf.svelte';
  import { ExampleError, validateExample } from '../engine/example';
  import type { LibraryItem } from '../engine/storage';
  import { vizHref } from './route';
  import type { Session } from './session.svelte';
  import { notify } from './state.svelte';

  /**
   * "Saved in your account": this page's examples in the reader's account, and copying the
   * browser's saved examples into it. ExamplesPanel loads this component only for a signed-in
   * reader, so a signed-out visit never downloads it.
   */
  let {
    session,
    userId,
    library,
    browser,
  }: {
    session: Session;
    userId: string;
    library: LibraryItem[];
    /** The panel's "Saved in this browser" list, shown above the button that copies it. */
    browser?: Snippet;
  } = $props();

  // A new list for each page and each account.
  const shelf = $derived(new AccountShelf(session.def.id));
  $effect(() => {
    void userId;
    void shelf.refresh();
  });

  /** Save the page's work in the account (the panel's Save button). Throws AccountError. */
  export async function save(title: string): Promise<void> {
    await shelf.save(title, session.toExample());
  }

  // The browser's examples (every page's) not yet copied into this account.
  let copiedTick = $state(0);
  const toCopy = $derived.by(() => {
    void copiedTick;
    return notYetCopied(userId, library);
  });
  let copying = $state(false);

  async function copyToAccount() {
    copying = true;
    try {
      const { copied, left, error } = await copyBrowserExamples(await connect(), userId, library);
      const n = (k: number) => `${k} ${k === 1 ? 'example' : 'examples'}`;
      if (error) {
        notify(
          copied ? `Copied ${n(copied)}; ${n(left)} still to go. ${error.message}` : error.message,
          'error',
        );
      } else {
        notify(`Copied ${n(copied)} to your account.`);
      }
      if (copied) void shelf.refresh();
    } catch (e) {
      notify(asAccountError(e).message, 'error');
    } finally {
      copying = false;
      copiedTick++;
    }
  }

  let editing = $state<string | null>(null);
  let draft = $state('');
  let confirming = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let linkText = $state('');

  const focus = (node: HTMLElement) => node.focus();

  async function refocus(id: string) {
    await tick();
    document.getElementById(id)?.focus();
  }

  /** Run a change to one item; a failure shows its message and leaves the list as it was. */
  async function act(item: AccountExample, work: () => Promise<void>) {
    busy = item.id;
    try {
      await work();
    } catch (e) {
      notify(asAccountError(e).message, 'error');
    } finally {
      busy = null;
    }
  }

  function open(item: AccountExample) {
    try {
      session.load(validateExample(session.def, exampleOf(item)));
      notify(`Opened "${item.title}". Press play or step through it.`);
    } catch (e) {
      notify(e instanceof ExampleError ? e.message : 'That example could not be opened.', 'error');
    }
  }

  function startRename(item: AccountExample) {
    confirming = null;
    editing = item.id;
    draft = item.title;
  }

  function stopRename(item: AccountExample) {
    editing = null;
    void refocus(`rename-${item.id}`);
  }

  function rename(e: SubmitEvent, item: AccountExample) {
    e.preventDefault();
    const name = draft.trim();
    if (!name || name === item.title) return stopRename(item);
    void act(item, async () => {
      await shelf.rename(item.id, name);
      notify(`Renamed it "${name}".`);
      stopRename(item);
    });
  }

  function remove(item: AccountExample) {
    void act(item, async () => {
      await shelf.remove(item.id);
      confirming = null;
      notify(`Deleted "${item.title}" from your account.`);
    });
  }

  function share(item: AccountExample, box: HTMLInputElement) {
    const on = box.checked;
    void act(item, async () => {
      try {
        await shelf.setShared(item.id, on);
      } catch (e) {
        box.checked = item.shared;
        throw e;
      }
      notify(
        on
          ? `"${item.title}" is shared: anyone with its link can open it.`
          : `"${item.title}" is private again. Its link no longer opens it.`,
      );
    });
  }

  function copyLink(item: AccountExample) {
    void act(item, async () => {
      // A private example's link opens for nobody, so copying the link shares it.
      const turnedOn = !item.shared;
      if (turnedOn) await shelf.setShared(item.id, true);
      const url = location.origin + vizHref(item.viz, { saved: item.id });
      linkText = url;
      const shared = turnedOn ? 'Sharing is on: anyone with the link can open it. ' : '';
      try {
        await navigator.clipboard.writeText(url);
        notify(`${shared}Link copied to the clipboard.`);
      } catch {
        notify(`${shared}Copy the link from the box below.`);
      }
    });
  }
</script>

<h4 id="account-list-heading">Saved in your account</h4>
{#if shelf.status === 'error'}
  <div class="problem">
    <p role="alert">{shelf.problem}</p>
    <button class="btn small" onclick={() => shelf.refresh()}>Try again</button>
  </div>
{:else if shelf.status === 'loading' && !shelf.items.length}
  <p class="muted small" role="status">Loading your examples…</p>
{:else if !shelf.items.length}
  <p class="muted small">
    Nothing from this page in your account yet. Name your work and press Save.
  </p>
{:else}
  <ul class="mine" aria-labelledby="account-list-heading">
    {#each shelf.items as item (item.id)}
      <li aria-busy={busy === item.id}>
        {#if editing === item.id}
          <form class="rename" onsubmit={(e) => rename(e, item)}>
            <label class="visually-hidden" for="name-{item.id}">New name for {item.title}</label>
            <input
              id="name-{item.id}"
              class="field grow"
              bind:value={draft}
              maxlength="200"
              use:focus
              onkeydown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  stopRename(item);
                }
              }}
            />
            <span class="buttons">
              <button class="btn small" type="submit" disabled={busy === item.id}>Save name</button>
              <button class="btn small" type="button" onclick={() => stopRename(item)}
                >Cancel</button
              >
            </span>
          </form>
        {:else if confirming === item.id}
          <span class="title">Delete "{item.title}" from your account? This cannot be undone.</span>
          <span class="buttons">
            <button
              class="btn small danger"
              onclick={() => remove(item)}
              disabled={busy === item.id}
              use:focus>Delete it</button
            >
            <button
              class="btn small"
              onclick={() => {
                confirming = null;
                void refocus(`delete-${item.id}`);
              }}>Keep it</button
            >
          </span>
        {:else}
          <span class="title">{item.title}</span>
          <span class="buttons">
            <button class="btn small" onclick={() => open(item)}>Open</button>
            <button
              id="rename-{item.id}"
              class="btn small"
              onclick={() => startRename(item)}
              aria-label="Rename {item.title}">Rename</button
            >
            <button
              class="btn small"
              onclick={() => copyLink(item)}
              disabled={busy === item.id}
              aria-label="Copy link to {item.title}">Copy link</button
            >
            <label class="toggle">
              <input
                type="checkbox"
                checked={item.shared}
                disabled={busy === item.id}
                aria-label="Shared: {item.title}"
                onchange={(e) => share(item, e.currentTarget)}
              />
              Shared
            </label>
            <button
              id="delete-{item.id}"
              class="btn small"
              onclick={() => {
                editing = null;
                confirming = item.id;
              }}
              aria-label="Delete {item.title}">Delete</button
            >
          </span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
{#if linkText}
  <label class="visually-hidden" for="account-link">Link to the shared example</label>
  <input
    id="account-link"
    class="field share"
    readonly
    value={linkText}
    onfocus={(e) => e.currentTarget.select()}
  />
{/if}

{@render browser?.()}
{#if toCopy.length}
  <button class="btn small copy-all" onclick={copyToAccount} disabled={copying}>
    {toCopy.length === 1
      ? 'Copy the example saved in this browser to your account'
      : `Copy the ${toCopy.length} examples saved in this browser to your account`}
  </button>
{/if}

<style>
  h4 {
    margin: 10px 0 4px;
    font-size: 0.9rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }

  .title {
    overflow-wrap: anywhere;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .rename {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
  }

  .grow {
    flex: 1 1 160px;
    min-width: 0;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 4px;
    font-size: 0.9rem;
  }

  .toggle input {
    width: 18px;
    height: 18px;
    margin: 0;
  }

  .danger {
    border-color: var(--c-error);
    color: var(--c-error);
    font-weight: 600;
  }

  .problem {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .problem p {
    margin: 0;
    color: var(--c-error);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .small {
    font-size: 0.82rem;
    margin: 0;
  }

  /* A long label on a phone: let it wrap rather than widen the page. */
  .copy-all {
    margin-top: 10px;
    padding-block: 5px;
    white-space: normal;
    text-align: left;
  }

  .share {
    width: 100%;
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 0.8rem;
  }
</style>
