<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { encodeExample } from '../engine/example';
  import { readJson, writeJson } from '../engine/storage';
  import {
    addRecent,
    encodeExampleNow,
    parseRecent,
    RECENT_KEY,
    type RecentPage,
  } from '../progress/recent';
  import type { Session } from './session.svelte';

  /**
   * Remembers this page for the home page's "Pick up where you left off": when the reader leaves
   * the page or hides the tab, it stores the page with the example and step on screen, in the
   * example link encoding. Draws nothing.
   */
  let { session }: { session: Session } = $props();

  const pristine = () =>
    session.timeline.entries.length === 0 &&
    Object.keys(session.def.defaults).every((k) => session.settings[k] === session.def.defaults[k]);

  // The compressed link code takes a moment to make, so it is kept up to date as the reader
  // works; a page that is closing cannot wait for it.
  let made: { at: string; code: string | null } | null = null;
  const where = () => `${session.version}:${session.cursor}`;
  $effect(() => {
    const at = where();
    const ex = pristine() ? null : session.toExample();
    const timer = setTimeout(async () => {
      const code = ex ? await encodeExample(ex) : null;
      if (at === where()) made = { at, code };
    }, 250);
    return () => clearTimeout(timer);
  });

  function remember() {
    const code =
      made?.at === where() ? made.code : pristine() ? null : encodeExampleNow(session.toExample());
    const shown = session.timeline.visibleIndices(session.detail);
    const step = Math.max(0, shown.filter((i) => i <= session.cursor).length - 1);
    const page: RecentPage = {
      id: session.def.id,
      title: session.def.title,
      code,
      step: step + 1,
      steps: shown.length,
      at: new Date().toISOString(),
    };
    writeJson(RECENT_KEY, addRecent(parseRecent(readJson<unknown>(RECENT_KEY, [])), page));
  }

  const onHidden = () => {
    if (document.visibilityState === 'hidden') remember();
  };

  onMount(() => {
    addEventListener('pagehide', remember);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      removeEventListener('pagehide', remember);
      document.removeEventListener('visibilitychange', onHidden);
    };
  });

  // Leaving within the app (a route change) counts too.
  onDestroy(remember);
</script>
