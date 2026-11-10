<script lang="ts">
  import type { Shortcut } from './shortcuts';

  /**
   * The list of keyboard shortcuts ("?"), drawn from the same table the key handlers use
   * (src/ui/shortcuts.ts). Esc closes it; focus stays inside while it is open and goes back to
   * where it was when it closes.
   */
  let { shortcuts }: { shortcuts: readonly Shortcut[] } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let returnTo: HTMLElement | null = null;

  const groups = $derived.by(() => {
    const out: { name: string; items: Shortcut[] }[] = [];
    for (const s of shortcuts) {
      const g = out.find((x) => x.name === s.group);
      if (g) g.items.push(s);
      else out.push({ name: s.group, items: [s] });
    }
    return out;
  });

  export function show(): void {
    if (!dialog || dialog.open) return;
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
  }

  function close() {
    dialog?.close();
  }

  function onClose() {
    const to = returnTo;
    returnTo = null;
    if (to?.isConnected) to.focus();
  }

  // Tab and Shift+Tab go round the dialog's own controls.
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !dialog) return;
    const items = [
      ...dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
    ];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !dialog.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || !dialog.contains(at))) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="shortcuts card"
  aria-labelledby="shortcuts-title"
  onclose={onClose}
  onkeydown={onKeydown}
  onclick={(e) => {
    // A click on the backdrop (outside the box) closes it too.
    if (e.target === dialog) close();
  }}
>
  <div class="box">
    <header>
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <button type="button" class="btn small" onclick={close}>Close</button>
    </header>
    <div class="list">
      {#each groups as g (g.name)}
        <h3>{g.name}</h3>
        <table>
          <thead class="visually-hidden">
            <tr><th scope="col">Keys</th><th scope="col">What they do</th></tr>
          </thead>
          <tbody>
            {#each g.items as s (s.id)}
              <tr data-shortcut={s.id} data-keys={JSON.stringify(s.keys)}>
                <td class="keys">
                  {#each s.show as k, i (k)}{#if i > 0}<span class="or">or</span>{/if}<kbd>{k}</kbd
                    >{/each}
                </td>
                <td>{s.does}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/each}
      <p class="muted note">Esc closes this list.</p>
    </div>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    color: var(--text);
    box-shadow: 0 12px 40px rgb(0 0 0 / 30%);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }

  /* The box scrolls with its Close button inside, so the keys can scroll it on a short screen. */
  .box {
    max-height: inherit;
    overflow: auto;
  }

  header {
    position: sticky;
    top: 0;
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .list {
    padding: 4px 16px 12px;
  }

  h3 {
    margin: 10px 0 2px;
    font-size: 0.95rem;
    color: var(--text-2);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  td {
    padding: 5px 0;
    border-top: 1px solid var(--line);
    vertical-align: top;
  }

  td.keys {
    width: 11em;
    padding-right: 12px;
  }

  kbd {
    display: inline-block;
    min-width: 1.9em;
    padding: 0 6px;
    font-family: var(--font);
    font-size: 0.85rem;
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    border-radius: 6px;
    background: var(--surface-2);
    text-align: center;
    white-space: nowrap;
  }

  .or {
    margin: 0 4px;
    font-size: 0.85rem;
    color: var(--text-2);
  }

  .note {
    margin: 12px 0 0;
    font-size: 0.9rem;
  }
</style>
