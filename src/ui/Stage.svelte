<script lang="ts">
  import { untrack } from 'svelte';
  import { easeInOut, interpolate } from '../render/interpolate';
  import type { Scene } from '../render/scene';
  import Icon from './Icon.svelte';
  import Shapes from './Shapes.svelte';
  import { reducedMotion } from './state.svelte';

  let { scene, duration }: { scene: Scene; duration: number } = $props();

  // The scene currently on screen; during a tween it is a blend of two scenes.
  let shown = $state.raw<Scene>(untrack(() => interpolate(scene, scene, 1)));

  $effect(() => {
    const target = scene;
    const ms = untrack(() => duration);
    const from = untrack(() => shown);
    if (ms <= 0 || reducedMotion()) {
      shown = interpolate(target, target, 1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      shown = interpolate(from, target, easeInOut(t));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  // Pan and zoom, in scene units, on top of the scene's own framing.
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let svg: SVGSVGElement | undefined = $state();

  const view = $derived.by(() => {
    const b = shown.bounds;
    const w = b.w / zoom;
    const h = b.h / zoom;
    return { x: b.x + b.w / 2 + panX - w / 2, y: b.y + b.h / 2 + panY - h / 2, w, h };
  });

  const clampZoom = (z: number) => Math.max(0.5, Math.min(6, z));
  const fit = () => {
    zoom = 1;
    panX = 0;
    panY = 0;
  };

  function unitsPerPixel(): number {
    if (!svg) return 1;
    const r = svg.getBoundingClientRect();
    return Math.max(view.w / r.width, view.h / r.height);
  }

  // Tracks fingers during a gesture; nothing renders from it, so it is not reactive state.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let zoomStart = 1;

  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomStart = zoom;
    }
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      zoom = clampZoom((zoomStart * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinchStart);
    } else if (pointers.size === 1 && e.pointerType !== 'touch') {
      const k = unitsPerPixel();
      panX -= (cur.x - prev.x) * k;
      panY -= (cur.y - prev.y) * k;
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
  }

  function onWheel(e: WheelEvent) {
    // Plain wheel scrolls the page; pinch on a trackpad (ctrl+wheel) zooms.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom = clampZoom(zoom * Math.exp(-e.deltaY * 0.01));
  }

  const ratio = $derived(`${scene.bounds.w} / ${scene.bounds.h}`);
</script>

<div class="stage card" style:--tween="{duration}ms">
  <svg
    bind:this={svg}
    viewBox="{view.x} {view.y} {view.w} {view.h}"
    style:aspect-ratio={ratio}
    role="img"
    aria-label={scene.label}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
  >
    <Shapes shapes={shown.shapes} />
  </svg>
  <div class="zoom" role="group" aria-label="Zoom">
    <button
      class="icon-btn small"
      onclick={() => (zoom = clampZoom(zoom * 1.25))}
      aria-label="Zoom in"
      title="Zoom in"
    >
      <Icon name="plus" size={18} />
    </button>
    <button
      class="icon-btn small"
      onclick={() => (zoom = clampZoom(zoom / 1.25))}
      aria-label="Zoom out"
      title="Zoom out"
    >
      <Icon name="minus" size={18} />
    </button>
    <button class="icon-btn small" onclick={fit} aria-label="Fit to screen" title="Fit to screen">
      <Icon name="fit" size={18} />
    </button>
  </div>
</div>

<style>
  .stage {
    position: relative;
    overflow: hidden;
    padding: 8px;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    max-height: min(64vh, 600px);
    min-height: 220px;
    touch-action: pan-x pan-y;
    user-select: none;
    -webkit-user-select: none;
  }

  @media (min-width: 1024px) {
    /* Leave room for the controls above and the playback bar below. */
    svg {
      /* VizPage measures the space left above the playback bar and sets --stage-max. */
      max-height: var(--stage-max, clamp(260px, calc(100vh - 412px), 680px));
    }
  }

  .zoom {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
  }

  .icon-btn.small {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    opacity: 0.85;
  }
</style>
