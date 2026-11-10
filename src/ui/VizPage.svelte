<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { exampleOf } from '../account/backend';
  import { decodeExample, encodeExample, ExampleError, validateExample } from '../engine/example';
  import type { AnyVizDef, StageSize } from '../engine/types';
  import { pictureName } from '../render/picture';
  import { REPO_URL, SITE_NAME } from '../site';
  import CodePanel from './CodePanel.svelte';
  import CompareMenu from './CompareMenu.svelte';
  import BigOPanel from './BigOPanel.svelte';
  import ExamplesPanel from './ExamplesPanel.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import { Ink } from './ink.svelte';
  import LearnPanel from './LearnPanel.svelte';
  import ListBar from '../lists/ListBar.svelte';
  import { carry, itemHref, ListPlay, takePresent } from '../lists/player.svelte';
  import Narration from './Narration.svelte';
  import OpControls from './OpControls.svelte';
  import { download, pngOf } from './picture';
  import PointerDot from './PointerDot.svelte';
  import PracticePanel from './PracticePanel.svelte';
  import PresentTools from './PresentTools.svelte';
  import RecentTracker from './RecentTracker.svelte';
  import { navigate, vizHref } from './route';
  import SaveMenu from './SaveMenu.svelte';
  import { Session } from './session.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import { nextSpeed, runShortcut, shortcutsFor, type KeyActions } from './shortcuts';
  import ShortcutsDialog from './ShortcutsDialog.svelte';
  import Stage from './Stage.svelte';
  import { notify, prefs, setPref, type Tab } from './state.svelte';
  import TracePanel from './TracePanel.svelte';
  import Transport from './Transport.svelte';
  import VarsPanel from './VarsPanel.svelte';

  let {
    def,
    code,
    embed,
    lesson = null,
    theme = null,
    autoplay = false,
    practice = null,
    practiceCount = 5,
    list = null,
    item = 1,
  }: {
    def: AnyVizDef;
    code: string | null;
    embed: boolean;
    lesson?: string | null;
    theme?: string | null;
    autoplay?: boolean;
    practice?: number | null;
    practiceCount?: number;
    /** A lesson list playing (#list=<id>&item=<n>); not in embeds. */
    list?: string | null;
    item?: number;
  } = $props();

  const session = untrack(() => new Session(def, { speed: prefs.speed, detail: prefs.detail }));
  let ready = $state(false);

  // A lesson list playing on this page; null once the reader leaves it.
  let play = $state(untrack(() => (list && !embed ? new ListPlay(list, item) : null)));
  let listBar: ListBar | undefined = $state();

  /** Open the list's example for this page, once the list has loaded. */
  async function openListItem(p: ListPlay): Promise<'moved' | void> {
    const loaded = await p.load();
    const it = p.item;
    if (!loaded || !it) return;
    // The list changed since its link was made, and this example is on another page.
    if (it.viz !== def.id) {
      carry.present = presenting;
      navigate(itemHref(p.id, loaded, p.n), true);
      return 'moved';
    }
    // The reader started something while the list loaded: leave it.
    if (session.timeline.entries.length) return;
    try {
      session.load(validateExample(def, exampleOf(it)));
    } catch (e) {
      notify(e instanceof ExampleError ? e.message : 'That example could not be opened.', 'error');
    }
  }

  onMount(async () => {
    document.title = `${def.title} · ${SITE_NAME}`;
    // Present mode carries on from the list's example before.
    if (play && takePresent()) void present(true);
    if (lesson) setPref('tab', 'learn');
    if (practice) setPref('tab', 'practice');
    const listing = play?.load();
    if (code) {
      try {
        session.load(validateExample(def, await decodeExample(code)));
      } catch (e) {
        notify(
          e instanceof ExampleError ? e.message : 'That link is not a valid example.',
          'error',
        );
      }
    } else if (listing && play) {
      if ((await openListItem(play)) === 'moved') return;
    } else if (def.opening) {
      const ex = def.examples.find((e) => e.id === def.opening);
      if (ex) session.fill(ex.ops);
    }
    ready = true;
    if (autoplay) session.play();
  });

  onDestroy(() => session.destroy());

  // Wide screens put Options in the side column (see .side below); the breakpoint matches the CSS.
  const wideQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 1024px)') : null;
  let wide = $state(wideQuery?.matches ?? false);
  $effect(() => {
    if (!wideQuery) return;
    const update = () => (wide = wideQuery.matches);
    wideQuery.addEventListener('change', update);
    return () => wideQuery.removeEventListener('change', update);
  });

  // On wide screens, size the drawing so the playback bar fits on the first screen, whatever
  // height this page's controls need. Phones scroll instead.
  let vizEl: HTMLElement | undefined = $state();
  function fitStage() {
    const el = vizEl;
    if (!el) return;
    const anchor = el.querySelector('#stage-anchor');
    const transport = el.querySelector('.transport');
    if (embed || innerWidth < 1024 || !anchor || !transport) {
      el.style.removeProperty('--stage-max');
      return;
    }
    const top = anchor.getBoundingClientRect().top + scrollY;
    const room = innerHeight - top - transport.getBoundingClientRect().height - 12 - 16 - 14;
    el.style.setProperty('--stage-max', `${Math.round(Math.max(260, Math.min(680, room)))}px`);
  }
  $effect(() => {
    const el = vizEl;
    if (!el) return;
    fitStage();
    const observer = new ResizeObserver(() => fitStage());
    for (const part of el.querySelectorAll('.viz-head, form.controls, details.options'))
      observer.observe(part);
    addEventListener('resize', fitStage);
    return () => {
      observer.disconnect();
      removeEventListener('resize', fitStage);
    };
  });

  // The stage reports the room it has, so views can lay out for this screen.
  let room = $state<StageSize | undefined>();
  const scene = $derived(def.view(session.current.step, session.settings, room));
  const duration = $derived(session.animate ? session.tweenMs : 0);

  // Keep the address bar pointing at the current work, so reload and bookmarks keep it. A page
  // that is going away must not write the address afterwards: the next page's hash is in it.
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  onDestroy(() => {
    alive = false;
    clearTimeout(syncTimer);
  });
  let fullUrl = $state('');
  $effect(() => {
    void session.version;
    void session.cursor;
    const settings = session.settings;
    const inList = play ? { list: play.id, item: play.n } : {};
    if (!ready) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const pristine =
        session.timeline.entries.length === 0 &&
        Object.keys(def.defaults).every((k) => settings[k] === def.defaults[k]);
      const ex = pristine ? undefined : await encodeExample(session.toExample());
      if (!alive) return;
      fullUrl = location.origin + vizHref(def.id, { ex });
      history.replaceState(
        history.state,
        '',
        vizHref(def.id, { ex, embed, theme, autoplay, ...inList }),
      );
    }, 400);
  });

  // A prefilled GitHub issue that carries the page and the exact example.
  const issueUrl = $derived(
    `${REPO_URL}/issues/new?title=${encodeURIComponent(`[${def.id}] `)}&body=${encodeURIComponent(
      `Page: ${fullUrl || location.origin + vizHref(def.id)}\n\nWhat happened:\n\nWhat I expected:\n`,
    )}`,
  );

  const tabs = $derived<{ id: Tab; label: string }[]>([
    { id: 'learn', label: 'Learn' },
    { id: 'bigo', label: 'Big-O' },
    ...(def.practice?.length ? [{ id: 'practice' as Tab, label: 'Practice' }] : []),
    { id: 'examples', label: 'Examples' },
    { id: 'trace', label: 'Trace' },
    { id: 'history', label: 'History' },
  ]);

  function onTabKey(e: KeyboardEvent) {
    runShortcut(e, {
      tabs: () => {
        e.stopPropagation();
        const i = tabs.findIndex((t) => t.id === prefs.tab);
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
        setPref('tab', next.id);
        document.getElementById(`tab-${next.id}`)?.focus();
      },
    });
  }

  // Presentation mode for lectures: bigger text, no site chrome or tabs, full screen.
  let presenting = $state(false);
  // Present mode's pointer and pen. Ink is never part of the scene or the saved example.
  const ink = new Ink();
  async function present(on: boolean) {
    presenting = on;
    if (!on) ink.reset();
    document.documentElement.classList.toggle('presenting', on);
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Full screen is optional (some browsers and iframes refuse it).
    }
    queueMicrotask(fitStage);
  }
  // A lesson list moving to its next example keeps presenting (the next page takes it up).
  onDestroy(() => {
    if (!carry.present) document.documentElement.classList.remove('presenting');
  });

  // The step on screen changed (or the work did): the ink goes, unless it is kept.
  $effect(() => {
    void session.cursor;
    void session.version;
    untrack(() => ink.stepChanged());
  });

  // The keyboard shortcuts, from the one table in shortcuts.ts that the "?" list shows too.
  const listed = $derived(shortcutsFor({ tabs: !embed, present: !embed, list: !!play }));
  let help: ShortcutsDialog | undefined = $state();

  function changeSpeed(dir: -1 | 1) {
    const next = nextSpeed(session.speed, dir);
    session.setSpeed(next);
    setPref('speed', next);
  }

  const keyActions: KeyActions = {
    play: () => session.toggle(),
    forward: () => session.stepForward(),
    back: () => session.stepBack(),
    slower: () => changeSpeed(-1),
    faster: () => changeSpeed(1),
    help: () => help?.show(),
    pointer: () => ink.toggle('pointer'),
    pen: () => ink.toggle('pen'),
    'undo-ink': () => ink.undo(),
    'clear-ink': () => ink.clear(),
    escape: () => (ink.busy ? ink.setTool('off') : present(false)),
    'list-previous': () => listBar?.move(-1),
    'list-next': () => listBar?.move(1),
  };

  function onKey(e: KeyboardEvent) {
    runShortcut(
      e,
      keyActions,
      (s) => (s.needs !== 'present' || presenting) && (s.needs !== 'list' || !!play),
    );
  }

  // "Save picture": the step as drawn, named after the page and the step number on screen.
  let stage: Stage | undefined = $state();
  const stepNumber = $derived.by(() => {
    const visible = session.timeline.visibleIndices(session.detail);
    return Math.max(1, visible.filter((v) => v <= session.cursor).length);
  });
  async function savePicture(format: 'svg' | 'png') {
    const picture = stage?.picture();
    if (!picture) return;
    const name = pictureName(def.id, stepNumber, format);
    try {
      const blob =
        format === 'svg'
          ? new Blob([picture.svg], { type: 'image/svg+xml' })
          : await pngOf(picture, 2);
      download(blob, name);
      notify(`Saving ${name}.`);
    } catch {
      notify('This browser could not make the picture.', 'error');
    }
  }
</script>

<svelte:window onkeydown={onKey} />
<!-- The home page's "Pick up where you left off" (embeds are not the reader's own visits). -->
{#if !embed}<RecentTracker {session} />{/if}

<div class="viz" class:embed bind:this={vizEl}>
  <header class="viz-head">
    <div class="title-row">
      {#if !embed}
        <a class="back" href="/">← All visualizations</a>
      {/if}
      <h1>{def.title}</h1>
      {#if !embed}
        <div class="actions">
          {#if presenting}<PresentTools {ink} />{/if}
          <CompareMenu {session} />
          <SaveMenu save={savePicture} />
          <button
            class="btn small present"
            onclick={() => present(!presenting)}
            aria-pressed={presenting}
          >
            {presenting ? 'Exit presentation' : 'Present'}
          </button>
        </div>
      {/if}
      {#if embed}
        <a
          class="open"
          href={fullUrl || location.origin + vizHref(def.id)}
          target="_blank"
          rel="noopener"
        >
          Open in {SITE_NAME} ↗
        </a>
      {/if}
    </div>
    {#if !embed}<p class="blurb muted">{def.blurb}</p>{/if}
    {#if play}
      <ListBar bind:this={listBar} {play} {presenting} onleave={() => (play = null)} />
    {/if}
  </header>

  <!-- DOM order is the phone order; on wide screens the side column sits next to the stage. -->
  <div class="main">
    <OpControls {session} />
    {#if !embed && !wide}<SettingsPanel {session} />{/if}
    <div id="stage-anchor"></div>
    <Stage bind:this={stage} {scene} {duration} bind:room ink={presenting ? ink : undefined} />
    <Transport {session} scrub={session}>
      {#if !embed}
        <button
          type="button"
          class="icon-btn keys-btn"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onclick={() => help?.show()}>?</button
        >
      {/if}
    </Transport>
  </div>

  <div class="side">
    <!-- On wide screens Options sits atop the side column, so the stage gets its height. -->
    {#if !embed && wide}<SettingsPanel {session} />{/if}
    <Narration {session} />
    <CodePanel {session} />
    <VarsPanel {session} />
  </div>

  {#if !embed}
    <section class="tabs card">
      <div class="tablist" role="tablist" aria-label="More about this visualization">
        {#each tabs as t (t.id)}
          <button
            id="tab-{t.id}"
            role="tab"
            aria-selected={prefs.tab === t.id}
            aria-controls="panel-{t.id}"
            tabindex={prefs.tab === t.id ? 0 : -1}
            onclick={() => setPref('tab', t.id)}
            onkeydown={onTabKey}>{t.label}</button
          >
        {/each}
      </div>
      {#each tabs as t (t.id)}
        <div
          id="panel-{t.id}"
          role="tabpanel"
          aria-labelledby="tab-{t.id}"
          hidden={prefs.tab !== t.id}
          class="panel"
        >
          {#if prefs.tab === t.id}
            {#if t.id === 'learn'}
              <LearnPanel {session} {lesson} />
            {:else if t.id === 'bigo'}
              <BigOPanel {session} />
            {:else if t.id === 'practice'}
              <PracticePanel {session} seed={practice} count={practiceCount} />
            {:else if t.id === 'trace'}
              <TracePanel {session} />
            {:else if t.id === 'examples'}
              <ExamplesPanel {session} />
            {:else}
              <HistoryPanel {session} />
            {/if}
          {/if}
        </div>
      {/each}
    </section>
    <p class="feedback">
      <a href={issueUrl} target="_blank" rel="noopener">Spotted a mistake? Tell us on GitHub</a>
    </p>
  {/if}
</div>

<ShortcutsDialog bind:this={help} shortcuts={listed} />
{#if presenting && ink.tool === 'pointer'}<PointerDot />{/if}

<style>
  .viz {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    max-width: 1480px;
    margin: 0 auto;
    padding: 12px 16px 24px;
  }

  .main,
  .side {
    display: contents;
  }

  .viz-head {
    display: grid;
    gap: 2px;
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  h1 {
    margin: 0;
    font-size: 1.6rem;
    line-height: 1.2;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  /* The shortcuts button closes the playback bar. Touch screens have no keys to list. */
  .keys-btn {
    margin-left: auto;
    font-size: 1.15rem;
    font-weight: 700;
  }

  @media (hover: none) and (pointer: coarse) {
    .keys-btn {
      display: none;
    }
  }

  /* On a phone the back link has a line of its own above the title. */
  .back {
    flex-basis: 100%;
    font-size: 0.92rem;
    text-decoration: none;
  }

  .blurb {
    margin: 0;
  }

  .tabs {
    padding: 0 0 12px;
    container-type: inline-size;
  }

  /* Label widths depend on the fonts a device has. If the tabs do not fit in one row, they wrap
     to a second row instead of widening the page. */
  .tablist {
    display: flex;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--line);
  }

  [role='tab'] {
    flex: 1;
    min-height: 44px;
    padding: 0 8px;
    overflow-wrap: break-word;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    font-weight: 600;
    color: var(--text-2);
  }

  [role='tab'][aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  /* Six labels need about 520 pixels in one row with a wide font. A narrower card, as on a
     phone, shows the tabs in rows of three. */
  @container (max-width: 560px) {
    .tablist {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .panel {
    padding: 12px 14px 0;
  }

  .feedback {
    margin: 0;
    font-size: 0.88rem;
  }

  .embed {
    padding: 8px;
    gap: 8px;
  }

  .embed h1 {
    font-size: 1.2rem;
  }

  /* In an iframe, keep the stage, playback and narration in view together. */
  .embed :global(.stage svg) {
    max-height: clamp(200px, calc(100vh - 370px), 640px);
  }

  @media (min-width: 1024px) {
    .viz {
      grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
      grid-template-rows: auto auto 1fr;
      align-items: start;
    }

    .viz-head {
      grid-column: 1 / -1;
    }

    /* Title on the left; the back link joins Compare and Present on the right, so the header
       is one line shorter and the stage gets the height. */
    .title-row {
      justify-content: flex-start;
      column-gap: 16px;
    }

    h1 {
      margin-right: auto;
    }

    .back {
      flex-basis: auto;
      order: 1;
    }

    .actions {
      order: 2;
    }

    .main {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      min-width: 0;
      grid-column: 1;
      grid-row: 2;
    }

    .side {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      min-width: 0;
      grid-column: 2;
      grid-row: 2 / span 2;
      position: sticky;
      top: 12px;
    }

    .tabs {
      grid-column: 1;
      grid-row: 3;
    }

    .panel {
      max-width: 80ch;
    }
  }
</style>
