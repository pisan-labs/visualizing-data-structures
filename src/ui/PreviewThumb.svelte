<script lang="ts">
  import { easeInOut, interpolate } from '../render/interpolate';
  import type { Preview, PreviewPoster } from '../render/preview';
  import type { Scene, Shape } from '../render/scene';
  import Shapes from './Shapes.svelte';
  import { reducedMotion } from './state.svelte';

  // A page's own stylesheet (such as the red-black node colors) loads with the page; the
  // catalog draws every page's shapes, so it needs them all.
  import.meta.glob('../viz/*/*.css', { eager: true });

  /**
   * A catalog thumbnail. At rest it shows the page's still picture; the first time it plays it
   * fetches the frames (/previews/<id>.json) and then loops through them while `playing`. The
   * title beside it says what it is, so it is hidden from screen readers.
   */
  let {
    id,
    poster,
    playing = false,
  }: { id: string; poster: PreviewPoster; playing?: boolean } = $props();

  const TWEEN = 280;
  const HOLD = 170;
  const REST = 1200;

  const rest = $derived<Scene>({ shapes: poster.shapes, bounds: poster.bounds, label: '' });
  const still = $derived(interpolate(rest, rest, 1).shapes);
  let frames = $state.raw<Scene[] | null>(null);
  let loading = false;
  let shown = $state.raw<Shape[] | null>(null);

  $effect(() => {
    if (!playing || frames || loading || reducedMotion()) return;
    loading = true;
    fetch(`/previews/${id}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Preview | null) => {
        if (p) frames = p.frames.map((shapes) => ({ shapes, bounds: p.bounds, label: '' }));
      })
      .catch(() => {})
      .finally(() => (loading = false));
  });

  $effect(() => {
    const all = frames;
    const from0 = rest;
    if (!playing || !all || all.length < 2 || reducedMotion()) {
      shown = null;
      return;
    }
    const n = all.length;
    // Transition k goes from frame k-1 to frame k. The very first one leaves the frame shown at
    // rest, so playback starts without a jump. The last frame is held longer before the loop.
    const slot = (k: number) => TWEEN + (k === n - 1 ? REST : HOLD);
    const cycle = n * (TWEEN + HOLD) + REST - HOLD;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const first = now - start < cycle;
      let t = (now - start) % cycle;
      let k = 0;
      while (t >= slot(k)) t -= slot(k++);
      const from = k === 0 && first ? from0 : all[(k - 1 + n) % n]!;
      shown = interpolate(from, all[k]!, easeInOut(Math.min(1, t / TWEEN))).shapes;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<svg
  class="thumb"
  viewBox="{poster.bounds.x} {poster.bounds.y} {poster.bounds.w} {poster.bounds.h}"
  aria-hidden="true"
  focusable="false"
>
  <Shapes shapes={shown ?? still} />
</svg>

<style>
  .thumb {
    display: block;
    flex: none;
    width: 72px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
  }

  /* Scaled down about tenfold, the drawing's strokes would vanish: keep them a pixel or two. */
  svg.thumb :global(.shape) {
    vector-effect: non-scaling-stroke;
    stroke-width: 1px;
    transition: none;
  }

  svg.thumb :global(.shape[class*='role-']) {
    stroke-width: 2px;
  }

  /* Arrowheads scale with the stroke, which no longer shrinks, so they would swamp the picture. */
  svg.thumb :global(line) {
    marker-start: none;
    marker-end: none;
  }
</style>
