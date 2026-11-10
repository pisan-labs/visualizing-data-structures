<script lang="ts">
  import { listsHref } from '../ui/route';

  /** "My lesson lists" in the account menu (AccountMenu.svelte mounts it for a signed-in reader). */
</script>

<p class="lists-entry">
  <a href={listsHref} onclick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
    >My lesson lists</a
  >
</p>

<style>
  .lists-entry {
    margin: 0 0 10px;
    font-size: 0.92rem;
  }
</style>
