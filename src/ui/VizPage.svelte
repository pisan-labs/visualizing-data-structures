<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { decodeExample, encodeExample, ExampleError, validateExample } from '../engine/example';
  import type { AnyVizDef } from '../engine/types';
  import { REPO_URL, SITE_NAME } from '../site';
  import CodePanel from './CodePanel.svelte';
  import BigOPanel from './BigOPanel.svelte';
  import ExamplesPanel from './ExamplesPanel.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import LearnPanel from './LearnPanel.svelte';
  import Narration from './Narration.svelte';
  import OpControls from './OpControls.svelte';
  import PracticePanel from './PracticePanel.svelte';
  import { vizHref } from './route';
  import { Session } from './session.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
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
  }: {
    def: AnyVizDef;
    code: string | null;
    embed: boolean;
    lesson?: string | null;
    theme?: string | null;
    autoplay?: boolean;
    practice?: number | null;
    practiceCount?: number;
  } = $props();

  const session = untrack(() => new Session(def, { speed: prefs.speed, detail: prefs.detail }));
  let ready = $state(false);

  onMount(async () => {
    document.title = `${def.title} · ${SITE_NAME}`;
    if (lesson) setPref('tab', 'learn');
    if (practice) setPref('tab', 'practice');
    if (code) {
      try {
        session.load(validateExample(def, await decodeExample(code)));
      } catch (e) {
        notify(
          e instanceof ExampleError ? e.message : 'That link is not a valid example.',
          'error',
        );
      }
    }
    ready = true;
    if (autoplay) session.play();
  });

  onDestroy(() => session.destroy());

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

  const scene = $derived(def.view(session.current.step, session.settings));
  const duration = $derived(session.animate ? session.tweenMs : 0);

  // Keep the address bar pointing at the current work, so reload and bookmarks keep it.
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let fullUrl = $state('');
  $effect(() => {
    void session.version;
    void session.cursor;
    const settings = session.settings;
    if (!ready) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const pristine =
        session.timeline.entries.length === 0 &&
        Object.keys(def.defaults).every((k) => settings[k] === def.defaults[k]);
      const ex = pristine ? undefined : await encodeExample(session.toExample());
      fullUrl = location.origin + vizHref(def.id, { ex });
      history.replaceState(history.state, '', vizHref(def.id, { ex, embed, theme, autoplay }));
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
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    e.stopPropagation();
    const i = tabs.findIndex((t) => t.id === prefs.tab);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    setPref('tab', next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  // Presentation mode for lectures: bigger text, no site chrome or tabs, full screen.
  let presenting = $state(false);
  async function present(on: boolean) {
    presenting = on;
    document.documentElement.classList.toggle('presenting', on);
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Full screen is optional (some browsers and iframes refuse it).
    }
    queueMicrotask(fitStage);
  }
  onDestroy(() => document.documentElement.classList.remove('presenting'));

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && presenting) {
      present(false);
      return;
    }
    const t = e.target as HTMLElement;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (t.closest('input, textarea, select, [contenteditable="true"], [role="tab"]')) return;
    switch (e.key) {
      case ' ':
        if (t.closest('button, a, summary')) return;
        e.preventDefault();
        session.toggle();
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        session.stepForward();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        session.stepBack();
        break;
      case '-':
      case '+':
      case '=': {
        const speeds = [0.25, 0.5, 1, 1.5, 2, 4];
        const i = speeds.indexOf(session.speed);
        const next =
          speeds[Math.max(0, Math.min(speeds.length - 1, i + (e.key === '-' ? -1 : 1)))]!;
        session.setSpeed(next);
        setPref('speed', next);
        break;
      }
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="viz" class:embed bind:this={vizEl}>
  <header class="viz-head">
    {#if !embed}
      <a class="back" href="/">← All visualizations</a>
    {/if}
    <div class="title-row">
      <h1>{def.title}</h1>
      {#if !embed}
        <button
          class="btn small present"
          onclick={() => present(!presenting)}
          aria-pressed={presenting}
        >
          {presenting ? 'Exit presentation' : 'Present'}
        </button>
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
  </header>

  <!-- DOM order is the phone order; on wide screens the side column sits next to the stage. -->
  <div class="main">
    <OpControls {session} />
    {#if !embed}<SettingsPanel {session} />{/if}
    <div id="stage-anchor"></div>
    <Stage {scene} {duration} />
    <Transport {session} />
  </div>

  <div class="side">
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

  .back {
    font-size: 0.92rem;
    text-decoration: none;
  }

  .blurb {
    margin: 0;
  }

  .tabs {
    padding: 0 0 12px;
  }

  .tablist {
    display: flex;
    border-bottom: 1px solid var(--line);
  }

  [role='tab'] {
    flex: 1;
    min-height: 44px;
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
