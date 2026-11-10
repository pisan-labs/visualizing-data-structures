<script lang="ts">
  import { app } from '../pwa/offline.svelte';

  /**
   * A page whose code could not load. Offline, that means it was never opened (or saved) on this
   * device; online, the network failed.
   */
  const offline = app.offline || !navigator.onLine;
</script>

<div class="unavailable">
  {#if offline}
    <h1>This page has not been saved for offline use yet</h1>
    <p>
      Open it again when you are back online. To keep every page, choose "Make every page available
      offline" at the bottom of the home page.
    </p>
  {:else}
    <h1>This page could not be loaded</h1>
    <p>Check your connection and reload the page.</p>
  {/if}
  <p><a href="/">See all visualizations</a></p>
</div>

<style>
  .unavailable {
    max-width: 700px;
    margin: 0 auto;
    padding: 32px 16px;
  }
</style>
