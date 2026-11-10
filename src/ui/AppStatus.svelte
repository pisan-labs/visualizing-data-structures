<script lang="ts">
  import { app, applyUpdate, dismissUpdate, startOfflineApp } from '../pwa/offline.svelte';

  /**
   * The offline app's two quiet messages: "Offline" while the browser has no network, and "A new
   * version is ready" with a Reload button when a newer service worker is waiting. They sit in
   * the bottom right corner, clear of the playback bar, which wide screens put at the bottom left
   * of the first screen. Neither shows in embeds, in Present mode or in print.
   */
  let { embed = false }: { embed?: boolean } = $props();

  $effect(() => {
    if (!embed) startOfflineApp();
  });
</script>

{#if !embed}
  <!-- A polite live region that is always there, so screen readers hear the notes appear. It has
       no role, so the page keeps a single role="status" region (App.svelte's notices). -->
  <div class="app-status" aria-live="polite">
    {#if app.offline}
      <p class="note offline">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M3 3l18 18"
          />
          <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        {app.missing?.count === 0
          ? 'Offline: every page still works'
          : app.ready
            ? 'Offline: pages you have opened still work'
            : 'Offline'}
      </p>
    {/if}
    {#if app.update}
      <div class="note update">
        <span>A new version is ready.</span>
        <button type="button" class="btn small primary" onclick={applyUpdate}>Reload</button>
        <button type="button" class="dismiss" aria-label="Dismiss" onclick={dismissUpdate}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .app-status {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 40;
    display: grid;
    justify-items: end;
    gap: 8px;
    max-width: calc(100vw - 32px);
    pointer-events: none;
  }

  .note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0;
    min-width: 0;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 2px 10px rgb(0 0 0 / 14%);
    font-size: 0.9rem;
  }

  .offline {
    gap: 6px;
    padding: 4px 12px 4px 10px;
    border-radius: 999px;
  }

  .offline svg {
    flex: none;
    color: var(--text-2);
  }

  .update {
    padding: 6px 6px 6px 14px;
    border-radius: 12px;
    pointer-events: auto;
  }

  .dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text-2);
  }

  .dismiss:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  :global(:root.presenting) .app-status {
    display: none;
  }

  @media print {
    .app-status {
      display: none;
    }
  }
</style>
