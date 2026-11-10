<script lang="ts">
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { easeInOut, interpolate } from '../render/interpolate';
  import type { StageSize } from '../engine/types';
  import type { Scene } from '../render/scene';
  import { ZOOM_BUTTONS, ZOOM_STRIP } from '../render/stage';
  import Icon from './Icon.svelte';
  import { readPicture, type Picture } from './picture';
  import Shapes from './Shapes.svelte';
  import { reducedMotion } from './state.svelte';

  let {
    scene,
    duration,
    room = $bindable(),
  }: { scene: Scene; duration: number; room?: StageSize } = $props();

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

  /** The step as drawn, whole (whatever the zoom), for "Save picture". */
  export function picture(): Picture | null {
    return svg ? readPicture(svg, shown.bounds, scene.label) : null;
  }

  const ratio = $derived(`${scene.bounds.w} / ${scene.bounds.h}`);

  // On a phone the drawing fills the width, so the zoom buttons get a strip of their own above
  // it instead of covering its top right corner.
  const phone = new MediaQuery(`(max-width: ${ZOOM_STRIP.maxWidth}px)`);

  // The room the drawing has: the stage's width, the height it may grow to, and whether the zoom
  // buttons have their own strip. Views use it to put panels beside or under the main picture.
  // Rounded, so a small resize does not redraw.
  function measure() {
    if (!svg) return;
    const w = svg.clientWidth;
    const h = parseFloat(getComputedStyle(svg).maxHeight);
    if (!(w > 0) || !(h > 0)) return;
    const next: StageSize = { w: Math.round(w / 8) * 8, h: Math.round(h / 8) * 8 };
    if (phone.current) next.strip = true;
    if (next.w !== room?.w || next.h !== room?.h || next.strip !== room?.strip) room = next;
  }
  $effect(() => {
    const el = svg;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      removeEventListener('resize', measure);
    };
  });
</script>

<div
  class="stage card"
  style:--tween="{duration}ms"
  style:--zoom-size="{ZOOM_BUTTONS.size}px"
  style:--zoom-gap="{ZOOM_BUTTONS.gap}px"
  style:--zoom-inset="{ZOOM_BUTTONS.inset}px"
  style:padding-top={phone.current ? `${ZOOM_STRIP.top}px` : undefined}
>
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
  /* Sizes come from src/render/stage.ts, which layouts read to keep drawings clear of the zoom
     buttons. The drawing's padding equals the buttons' inset, so they are level with its corner. */
  .stage {
    position: relative;
    overflow: hidden;
    padding: var(--zoom-inset);
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
    top: var(--zoom-inset);
    right: var(--zoom-inset);
    display: flex;
    gap: var(--zoom-gap);
  }

  .icon-btn.small {
    width: var(--zoom-size);
    height: var(--zoom-size);
    border-radius: 8px;
    opacity: 0.85;
  }
</style>
