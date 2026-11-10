<script lang="ts">
  import { strokePath, type Ink, type InkPoint } from './ink.svelte';

  /**
   * Present mode's ink, over the stage's drawing. It uses the drawing's view box, so a stroke
   * stays on what it marks when the stage is resized. With a tool on it takes the pointer (so the
   * drawing does not pan or zoom); with both off it lets every pointer through.
   */
  let { ink, viewBox }: { ink: Ink; viewBox: string } = $props();

  let svg: SVGSVGElement | undefined = $state();
  let active: number | null = null;
  // Once a stylus has drawn, a resting palm (touch) draws nothing.
  let sawPen = false;

  function toScene(e: PointerEvent): InkPoint | null {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function onDown(e: PointerEvent) {
    if (ink.tool !== 'pen' || active !== null || e.button > 0) return;
    if (e.pointerType === 'pen') sawPen = true;
    else if (e.pointerType === 'touch' && sawPen) return;
    const p = toScene(e);
    if (!p) return;
    e.preventDefault();
    active = e.pointerId;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the stroke works without capture.
    }
    ink.begin(p);
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== active) return;
    const events = e.getCoalescedEvents?.() ?? [];
    const points = (events.length ? events : [e]).map(toScene).filter((p) => p !== null);
    ink.extend(points);
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== active) return;
    active = null;
    ink.end();
  }

  // A trackpad pinch (ctrl + wheel) would zoom the whole page instead of the drawing.
  function onWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }
</script>

<div
  class="ink"
  class:busy={ink.busy}
  class:pen={ink.tool === 'pen'}
  class:pointer={ink.tool === 'pointer'}
  data-strokes={ink.strokes.length}
  aria-hidden="true"
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onUp}
  onwheel={onWheel}
  oncontextmenu={(e) => {
    if (ink.busy) e.preventDefault();
  }}
>
  <svg bind:this={svg} {viewBox} focusable="false">
    {#each ink.strokes as s, i (i)}
      {@const d = strokePath(s.points)}
      <path class="halo" {d} />
      <path class="line" {d} stroke={s.color} />
    {/each}
  </svg>
</div>

<style>
  .ink {
    position: absolute;
    pointer-events: none;
  }

  /* A drag or a long press here draws or points: no scrolling, selecting or callouts. */
  .ink.busy {
    pointer-events: auto;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .ink.pen {
    cursor: crosshair;
  }

  /* The pointer's dot (PointerDot.svelte) stands in for the cursor. */
  .ink.pointer {
    cursor: none;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    max-height: none;
    min-height: 0;
    overflow: visible;
  }

  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  /* A thin edge in the stage's color keeps a stroke readable where it crosses lines and text. */
  .halo {
    stroke: var(--surface);
    stroke-width: 9px;
    stroke-opacity: 0.75;
  }

  .line {
    stroke-width: 5px;
  }

  @media (forced-colors: active) {
    .line {
      forced-color-adjust: none;
    }
  }
</style>
