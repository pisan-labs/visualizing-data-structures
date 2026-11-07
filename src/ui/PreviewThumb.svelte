<script lang="ts">
  import { easeInOut, interpolate } from '../render/interpolate';
  import type { Preview } from '../render/preview';
  import type { Scene, Shape } from '../render/scene';
  import Shapes from './Shapes.svelte';
  import { reducedMotion } from './state.svelte';

  // A page's own stylesheet (such as the red-black node colors) loads with the page; the
  // catalog draws every page's shapes, so it needs them all.
  import.meta.glob('../viz/*/*.css', { eager: true });

  /**
   * A catalog thumbnail. At rest it shows the example's final frame; while `playing` it loops
   * through every frame. The title beside it says what it is, so it is hidden from screen readers.
   */
  let { preview, playing = false }: { preview: Preview; playing?: boolean } = $props();

  const TWEEN = 280;
  const HOLD = 170;
  const REST = 1200;

  const scenes = $derived<Scene[]>(
    preview.frames.map((shapes) => ({ shapes, bounds: preview.bounds, label: '' })),
  );
  const poster = $derived(interpolate(scenes.at(-1)!, scenes.at(-1)!, 1).shapes);
  let shown = $state.raw<Shape[] | null>(null);

  $effect(() => {
    const all = scenes;
    const n = all.length;
    if (!playing || n < 2 || reducedMotion()) {
      shown = null;
      return;
    }
    // Transition k goes from frame k-1 to frame k; the first leaves the final frame on show at
    // rest, so playback starts without a jump. The last frame is held longer before the loop.
    const slot = (k: number) => TWEEN + (k === n - 1 ? REST : HOLD);
    const cycle = n * (TWEEN + HOLD) + REST - HOLD;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      let t = (now - start) % cycle;
      let k = 0;
      while (t >= slot(k)) t -= slot(k++);
      const from = all[(k - 1 + n) % n]!;
      shown = interpolate(from, all[k]!, easeInOut(Math.min(1, t / TWEEN))).shapes;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<svg
  class="thumb"
  viewBox="{preview.bounds.x} {preview.bounds.y} {preview.bounds.w} {preview.bounds.h}"
  aria-hidden="true"
  focusable="false"
>
  <Shapes shapes={shown ?? poster} />
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
</style>
