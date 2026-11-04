<script lang="ts">
  import { encodeExample, exampleViz, validateExample } from '../engine/example';
  import {
    deleteFromLibrary,
    loadLibrary,
    saveToLibrary,
    type LibraryItem,
  } from '../engine/storage';
  import type { SavedExample } from '../engine/types';
  import { SITE_NAME } from '../site';
  import { liveIds } from '../viz/registry';
  import { vizHref } from './route';
  import type { Session } from './session.svelte';
  import { notify } from './state.svelte';

  let { session }: { session: Session } = $props();

  let library = $state<LibraryItem[]>(loadLibrary());
  const mine = $derived(library.filter((i) => i.example.viz === session.def.id));
  let title = $state('');
  let shareText = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  async function linkFor(ex: SavedExample, embed = false): Promise<string> {
    const options = embed
      ? { theme: embedTheme === 'auto' ? null : embedTheme, autoplay: embedAutoplay }
      : {};
    return location.origin + vizHref(ex.viz, { ex: await encodeExample(ex), embed, ...options });
  }

  // Options for the embed code.
  let embedTheme = $state<'auto' | 'light' | 'dark' | 'contrast'>('auto');
  let embedAutoplay = $state(false);

  async function copy(text: string, what: string) {
    shareText = text;
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied to the clipboard.`);
    } catch {
      notify(`Copy the ${what.toLowerCase()} from the box below.`);
    }
  }

  async function copyLink() {
    await copy(await linkFor(session.toExample()), 'Link');
  }

  async function copyEmbed() {
    const url = await linkFor(session.toExample(), true);
    const html = `<iframe src="${url}" title="${session.def.title} (${SITE_NAME})" width="100%" height="720" style="border:0" loading="lazy"></iframe>`;
    await copy(html, 'Embed code');
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    const name = title.trim() || `${session.def.title}, ${new Date().toLocaleString()}`;
    const item = saveToLibrary(name, session.toExample());
    if (!item) {
      notify('This browser is not letting the site save. Download a file instead.', 'error');
      return;
    }
    library = loadLibrary();
    title = '';
    notify(`Saved "${name}".`);
  }

  function remove(item: LibraryItem) {
    deleteFromLibrary(item.key);
    library = loadLibrary();
    notify(`Deleted "${item.title}".`);
  }

  function download(ex: SavedExample, name: string) {
    const blob = new Blob([JSON.stringify(ex, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${
      name
        .replace(/[^\w-]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'example'
    }.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function loadCurated(ex: SavedExample) {
    session.load(validateExample(session.def, ex));
    notify(`Loaded "${ex.title}". Press play or step through it.`);
  }

  async function importFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      const viz = exampleViz(raw);
      if (viz && viz !== session.def.id) {
        if (!liveIds.includes(viz))
          throw new Error(`This file is for "${viz}", which this site does not have yet.`);
        // That page checks the example when it opens.
        location.href = await linkFor(raw as SavedExample);
        return;
      }
      const ex = validateExample(session.def, raw);
      session.load(ex);
      notify(`Opened ${ex.title ? `"${ex.title}"` : file.name}.`);
    } catch (err) {
      notify(
        err instanceof SyntaxError ? 'That file is not valid JSON.' : (err as Error).message,
        'error',
      );
    }
  }
</script>

<div class="examples">
  <section aria-labelledby="curated-heading">
    <h3 id="curated-heading">Examples to try</h3>
    <ul class="curated">
      {#each session.def.examples as ex (ex.id)}
        <li>
          <div>
            <strong>{ex.title}</strong>
            {#if ex.notes}<p class="muted">{ex.notes}</p>{/if}
          </div>
          <button class="btn small" onclick={() => loadCurated(ex)}>Load</button>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="share-heading">
    <h3 id="share-heading">Share</h3>
    <p class="muted">
      A link holds everything you did, including where you are in it. Anyone who opens it sees the
      same thing.
    </p>
    <div class="row">
      <button class="btn small" onclick={copyLink}>Copy link</button>
      <button class="btn small" onclick={copyEmbed}>Copy embed code</button>
    </div>
    <div class="row embed-options">
      <label>
        Embed theme
        <select class="field" bind:value={embedTheme}>
          <option value="auto">Follow the viewer</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="contrast">High contrast</option>
        </select>
      </label>
      <label><input type="checkbox" bind:checked={embedAutoplay} /> Start playing</label>
    </div>
    {#if shareText}
      <label class="visually-hidden" for="share-text">Link or embed code</label>
      <input
        id="share-text"
        class="field share"
        readonly
        value={shareText}
        onfocus={(e) => e.currentTarget.select()}
      />
    {/if}
  </section>

  <section aria-labelledby="save-heading">
    <h3 id="save-heading">My examples</h3>
    <form class="row" onsubmit={save}>
      <label class="visually-hidden" for="save-title">Name</label>
      <input
        id="save-title"
        class="field grow"
        placeholder="Name this example"
        bind:value={title}
        maxlength="200"
      />
      <button class="btn small" type="submit">Save</button>
    </form>
    <p class="muted small">
      Saved in this browser only. Clearing site data deletes them, so download anything you want to
      keep.
    </p>
    {#if mine.length}
      <ul class="mine">
        {#each mine as item (item.key)}
          <li>
            <span class="title">{item.title}</span>
            <span class="buttons">
              <button class="btn small" onclick={() => session.load(item.example)}>Open</button>
              <button class="btn small" onclick={() => download(item.example, item.title)}
                >Download</button
              >
              <button
                class="btn small"
                onclick={() => remove(item)}
                aria-label="Delete {item.title}">Delete</button
              >
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-labelledby="files-heading">
    <h3 id="files-heading">Files</h3>
    <div class="row">
      <button
        class="btn small"
        onclick={() =>
          download(
            session.toExample(),
            `${session.def.id}-${new Date().toISOString().slice(0, 10)}`,
          )}>Download as file</button
      >
      <button class="btn small" onclick={() => fileInput?.click()}>Open a file</button>
      <input
        bind:this={fileInput}
        class="visually-hidden"
        type="file"
        accept=".json,application/json"
        tabindex="-1"
        aria-hidden="true"
        onchange={importFile}
      />
    </div>
  </section>
</div>

<style>
  .examples {
    display: grid;
    gap: 18px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 0.95rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .curated li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }

  .curated p {
    margin: 2px 0 0;
    font-size: 0.88rem;
  }

  .mine li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }

  .mine .title {
    overflow-wrap: anywhere;
  }

  .buttons,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .embed-options {
    margin-top: 8px;
    align-items: center;
    font-size: 0.88rem;
    color: var(--text-2);
  }

  .embed-options label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .embed-options select {
    min-height: 32px;
    color: var(--text);
  }

  .grow {
    flex: 1 1 160px;
  }

  .share {
    width: 100%;
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 0.8rem;
  }

  p {
    margin: 0 0 8px;
    font-size: 0.9rem;
  }

  .small {
    font-size: 0.82rem;
    margin-top: 6px;
  }
</style>
