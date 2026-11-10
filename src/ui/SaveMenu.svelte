<script lang="ts">
  /** "Save picture": the current step as an SVG or a PNG file. */
  let { save }: { save: (format: 'svg' | 'png') => Promise<void> } = $props();

  let open = $state(false);
  let busy = $state(false);
  let root: HTMLElement | undefined = $state();
  let toggle: HTMLButtonElement | undefined = $state();
  // The menu opens toward the side with room: under the button, kept on the screen.
  let alignLeft = $state(false);

  function flip() {
    open = !open;
    if (open && toggle) alignLeft = toggle.getBoundingClientRect().right < 300;
  }

  async function pick(format: 'svg' | 'png') {
    busy = true;
    try {
      await save(format);
    } finally {
      busy = false;
      open = false;
      toggle?.focus();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !open) return;
    // Closing the menu is all Escape does here (it does not also leave Present mode).
    e.stopPropagation();
    open = false;
    toggle?.focus();
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }}
/>

<div
  class="save-menu"
  bind:this={root}
  onkeydown={onKeydown}
  onfocusout={(e) => {
    if (open && root && !root.contains(e.relatedTarget as Node | null) && e.relatedTarget)
      open = false;
  }}
  role="presentation"
>
  <button
    type="button"
    class="btn small"
    bind:this={toggle}
    aria-expanded={open}
    aria-controls={open ? 'save-picture-menu' : undefined}
    onclick={flip}>Save picture</button
  >
  {#if open}
    <div class="menu card" class:left={alignLeft} id="save-picture-menu">
      <p class="muted">This step as drawn, in the current theme.</p>
      <button type="button" class="btn small" disabled={busy} onclick={() => pick('svg')}>
        SVG <span class="muted">for slides, scales cleanly</span>
      </button>
      <button type="button" class="btn small" disabled={busy} onclick={() => pick('png')}>
        PNG <span class="muted">image, twice screen size</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .save-menu {
    position: relative;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    display: grid;
    gap: 6px;
    width: min(270px, calc(100vw - 32px));
    padding: 10px 12px 12px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  }

  .menu.left {
    right: auto;
    left: 0;
  }

  .menu p {
    margin: 0;
    font-size: 0.88rem;
    white-space: normal;
  }

  .menu .btn {
    justify-content: flex-start;
    white-space: normal;
    text-align: left;
    font-weight: 600;
  }

  .menu .btn .muted {
    font-weight: 400;
  }
</style>
