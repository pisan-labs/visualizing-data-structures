<script lang="ts">
  import { aboutSize } from '../pwa/format';
  import { app, saveEverything } from '../pwa/offline.svelte';

  /**
   * "Make every page available offline", in the home page's footer. It shows once a service worker
   * controls the page: how much there is to download, the progress, and when every page of this
   * build is kept. A later build tops up by itself (offline.svelte.ts).
   */
  const running = $derived(app.saving !== null && !app.saving.finished);
  const percent = $derived(
    app.saving?.total ? Math.round((100 * app.saving.bytes) / app.saving.total) : 0,
  );
  // Screen readers hear the start and the end, not every percent.
  const announce = $derived(
    running
      ? 'Saving every page for offline use'
      : app.saving?.finished && app.missing?.count === 0
        ? 'Every page is available offline'
        : '',
  );
</script>

{#if app.ready && app.missing}
  <div class="offline-download">
    <span class="visually-hidden" aria-live="polite">{announce}</span>
    {#if running}
      <p>
        <label for="offline-progress">Saving every page for offline use: {percent}%</label>
        <progress id="offline-progress" max="100" value={percent}></progress>
      </p>
    {:else if app.missing.count === 0}
      <p>Every page is available offline on this device.</p>
    {:else}
      {#if app.saving?.finished && app.saving.failed}
        <p>Some files could not be saved. Try again when the connection is better.</p>
      {/if}
      <p>
        <button type="button" class="btn small" disabled={app.offline} onclick={saveEverything}>
          Make every page available offline
        </button>
        <span>
          {app.offline ? 'Needs a connection' : `${aboutSize(app.missing.bytes)} to download`}
        </span>
      </p>
    {/if}
  </div>
{/if}

<style>
  .offline-download p {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin: 4px 0 12px;
  }

  .offline-download .btn {
    white-space: normal;
    text-align: left;
  }

  progress {
    width: min(240px, 100%);
    accent-color: var(--accent);
  }
</style>
