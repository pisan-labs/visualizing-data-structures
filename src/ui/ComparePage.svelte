<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { keepShared, sharedOps } from '../engine/compare';
  import {
    decodeExample,
    encodeExample,
    ExampleError,
    makeExample,
    validateExample,
  } from '../engine/example';
  import type { AnyVizDef, SavedExample, Settings } from '../engine/types';
  import { SITE_NAME } from '../site';
  import Narration from './Narration.svelte';
  import OpControls from './OpControls.svelte';
  import { Pair } from './pair.svelte';
  import { vizHref } from './route';
  import { Session } from './session.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import Stage from './Stage.svelte';
  import { notify, prefs, setPref } from './state.svelte';
  import Transport from './Transport.svelte';
  import VarsPanel from './VarsPanel.svelte';

  /**
   * Compare mode: the same operations on two pages, side by side. Each side keeps its own
   * options, so this also compares two settings of one page (BST delete with the successor or
   * the predecessor).
   */
  let {
    a,
    b,
    code = null,
    codeB = null,
  }: { a: AnyVizDef; b: AnyVizDef; code?: string | null; codeB?: string | null } = $props();

  const pair = untrack(() => {
    const opts = { speed: prefs.speed, detail: prefs.detail };
    return new Pair(new Session(a, opts), new Session(b, opts));
  });
  const shared = untrack(() => sharedOps(a, b));
  let ready = $state(false);

  async function decode(def: AnyVizDef, c: string | null): Promise<SavedExample | null> {
    if (!c) return null;
    try {
      return validateExample(def, await decodeExample(c));
    } catch (e) {
      notify(e instanceof ExampleError ? e.message : 'That link is not a valid example.', 'error');
      return null;
    }
  }

  onMount(async () => {
    document.title = `${a.title} vs ${b.title} · ${SITE_NAME}`;
    const exA = await decode(a, code);
    const exB = await decode(b, codeB);
    // Both sides hold the same operations, from the first page's state, and share one seed so
    // anything random (a pivot, a priority) is the same on both.
    const seed = exA?.seed ?? pair.a.timeline.seed;
    const ops = keepShared(exA?.ops ?? [], shared);
    pair.a.load(makeExample(a.id, exA?.settings ?? a.defaults, seed, ops));
    pair.b.load(makeExample(b.id, exB?.settings ?? b.defaults, seed, ops));
    ready = true;
  });

  onDestroy(() => pair.destroy());

  const sceneA = $derived(a.view(pair.a.current.step, pair.a.settings));
  const sceneB = $derived(b.view(pair.b.current.step, pair.b.settings));
  const duration = (s: Session) => (s.animate ? s.tweenMs : 0);

  const isDefault = (s: Settings, def: AnyVizDef) =>
    Object.keys(def.defaults).every((k) => s[k] === def.defaults[k]);

  // Keep the address bar pointing at the current work. The second page's state carries only its
  // options: its operations are the first page's. Nothing is written once the page has gone.
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  onDestroy(() => {
    alive = false;
    clearTimeout(syncTimer);
  });
  $effect(() => {
    void pair.a.version;
    void pair.b.version;
    void pair.a.cursor;
    const sa = pair.a.settings;
    const sb = pair.b.settings;
    if (!ready) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const pristine = pair.a.timeline.entries.length === 0 && isDefault(sa, a);
      const ex = pristine ? undefined : await encodeExample(pair.a.toExample());
      const exb = isDefault(sb, b)
        ? undefined
        : await encodeExample({ ...pair.b.toExample(), ops: [], at: undefined });
      if (!alive) return;
      history.replaceState(history.state, '', vizHref(a.id, { compare: b.id, ex, exb }));
    }, 400);
  });

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    switch (e.key) {
      case ' ':
        if (t.closest('button, a, summary')) return;
        e.preventDefault();
        pair.toggle();
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        pair.stepForward();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        pair.stepBack();
        break;
      case '-':
      case '+':
      case '=': {
        const speeds = [0.25, 0.5, 1, 1.5, 2, 4];
        const i = speeds.indexOf(pair.speed);
        const next =
          speeds[Math.max(0, Math.min(speeds.length - 1, i + (e.key === '-' ? -1 : 1)))]!;
        pair.setSpeed(next);
        setPref('speed', next);
        break;
      }
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="compare">
  <header class="head">
    <a class="back" href={vizHref(a.id)}>← Back to {a.title}</a>
    <h1>{a.title} <span class="vs">vs</span> {b.title}</h1>
    <p class="muted">
      The same operations run on both sides. Each side keeps its own options, and a side that
      finishes an operation first waits for the other.
    </p>
  </header>

  <OpControls session={pair} />
  <Transport session={pair} />

  <div class="sides">
    {#each pair.sides as s, i (i)}
      <section class="side" aria-labelledby="side-{i}">
        <div class="side-head">
          <h2 id="side-{i}">{s.def.title}</h2>
          <a href={vizHref(s.def.id)}>Open this page</a>
        </div>
        <!-- Always present, even empty, so the rows line up across the two sides. -->
        <div class="opts"><SettingsPanel session={s} /></div>
        <Stage scene={i === 0 ? sceneA : sceneB} duration={duration(s)} />
        <Narration session={s} label="What is happening in the {s.def.title}" />
        <VarsPanel session={s} />
      </section>
    {/each}
  </div>
</div>

<style>
  .compare {
    display: grid;
    gap: 12px;
    padding: 12px 16px 24px;
    max-width: 1600px;
    margin: 0 auto;
  }

  .head h1 {
    margin: 4px 0 2px;
    font-size: 1.5rem;
  }

  .vs {
    color: var(--text-2);
    font-weight: 400;
  }

  .head p {
    margin: 0;
  }

  .back {
    font-size: 0.92rem;
  }

  .sides {
    display: grid;
    gap: 12px;
  }

  .side {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }

  .side-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }

  .side-head h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  .side-head a {
    font-size: 0.9rem;
  }

  @media (min-width: 900px) {
    /* Each side spans the same five rows (title, options, drawing, narration, variables), so
       the two drawings start at the same height even when only one side has options. */
    .sides {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: repeat(5, auto);
      column-gap: 16px;
    }

    .side {
      grid-row: span 5;
      grid-template-rows: subgrid;
    }

    .side :global(.stage svg) {
      max-height: min(52vh, 520px);
    }
  }
</style>
