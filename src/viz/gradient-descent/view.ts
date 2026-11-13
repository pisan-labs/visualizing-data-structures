/**
 * Gradient descent: the loss as a curve (one variable) or as contour lines (two, drawn to the
 * same scale on both axes, so the gradient crosses the contours at right angles), the path of
 * the run as dots joined by lines, the current point, and during an update the slope (a dashed
 * tangent on a curve, a dashed arrow downhill on a surface) and the move about to happen.
 * Beside the plot on a wide stage, under it on a tall one: f at every step so far.
 *
 * Shape ids: title, sub; ax-* the axes and their ticks (tx-<k>, ty-<k>); c-<k> pieces of the
 * curve, ct-<i>-<k> of contour i; min-h, min-v, min-t the lowest point; ps-<k> the path's
 * piece into point k, pd-<k> point k; now the current point, off its "off the chart" label;
 * grad the slope, next the move; lc-* the loss chart (lc-<k> its pieces, lc-now).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { axisLines, clipToBox, tickLabel, type PlotBox } from '../../layouts/chart';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  describe,
  num,
  RUN_STEPS,
  surfaceOf,
  type GdExtra,
  type GdSettings,
  type GdState,
} from './model';
import type { Surface } from './surfaces';

const TEXT = 15;
const SMALL = 14;
const TITLE_H = 44;

interface Frame {
  /** The main plot's box and how to put a world point in it. */
  box: PlotBox;
  at(p: readonly number[]): { x: number; y: number };
  /** The loss chart's box. */
  loss: PlotBox;
}

const METHOD = { gd: 'plain gradient descent', momentum: 'momentum', adam: 'Adam' };

function frame(sf: Surface, wide: boolean, top: number): Frame {
  const left = 44;
  const [x0, x1] = sf.xr;
  const [y0, y1] = sf.yr;
  let w: number;
  let h: number;
  if (sf.dims === 1) {
    w = wide ? 520 : 320;
    h = wide ? 280 : 220;
  } else {
    const maxW = wide ? 560 : 320;
    const maxH = wide ? 300 : 320;
    const unit = Math.min(maxW / (x1 - x0), maxH / (y1 - y0));
    w = unit * (x1 - x0);
    h = unit * (y1 - y0);
  }
  const box: PlotBox = { x0: left, x1: left + w, y0: top + TITLE_H, y1: top + TITLE_H + h };
  const at = (p: readonly number[]) => {
    const [px = 0, py = 0] = sf.dims === 1 ? [p[0]!, sf.f(p)] : p;
    return {
      x: box.x0 + ((px - x0) / (x1 - x0)) * w,
      y: box.y1 - ((py - y0) / (y1 - y0)) * h,
    };
  };
  const lw = wide ? 230 : w - 10;
  const lh = wide ? 160 : 120;
  const loss: PlotBox = wide
    ? { x0: box.x1 + 70, x1: box.x1 + 70 + lw, y0: box.y1 - lh, y1: box.y1 }
    : { x0: left + 10, x1: left + 10 + lw, y0: box.y1 + 76, y1: box.y1 + 76 + lh };
  return { box, at, loss };
}

const inBox = (b: PlotBox, p: { x: number; y: number }) =>
  p.x >= b.x0 - 0.5 && p.x <= b.x1 + 0.5 && p.y >= b.y0 - 0.5 && p.y <= b.y1 + 0.5;
const clamp = (b: PlotBox, p: { x: number; y: number }) => ({
  x: Math.max(b.x0, Math.min(b.x1, p.x)),
  y: Math.max(b.y0, Math.min(b.y1, p.y)),
});

function segment(
  out: Shape[],
  box: PlotBox,
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  extra: { opacity?: number; role?: MarkRole; dashed?: boolean } = {},
) {
  const c = clipToBox(box, a.x, a.y, b.x, b.y);
  if (c) out.push({ kind: 'arrow', id, ...c, head: 'none', ...extra });
}

/** Ticks at whole numbers, every `every`. */
function ticks(lo: number, hi: number, every: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(lo / every) * every; v <= hi + 1e-9; v += every) out.push(v);
  return out;
}

function draw(
  step: Step<GdState, GdExtra>,
  settings: GdSettings,
  wide: boolean,
  stage?: StageSize,
) {
  const { state, extra = {} } = step;
  const sf = surfaceOf(state);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const top = 0;
  const fr = frame(sf, wide, top);
  const { box } = fr;
  const shapes: Shape[] = [];

  shapes.push({
    kind: 'text',
    id: 'title',
    x: box.x0,
    y: top + 16,
    text: sf.text,
    size: TEXT,
    weight: 'bold',
    mono: true,
  });
  const extraBits =
    settings.method === 'momentum'
      ? `, β = ${settings.beta1}`
      : settings.method === 'adam'
        ? `, β₁ = ${settings.beta1}, β₂ = ${settings.beta2}${settings.bias ? '' : ', no bias correction'}`
        : '';
  shapes.push({
    kind: 'text',
    id: 'sub',
    x: box.x0,
    y: top + 36,
    text: `${METHOD[settings.method]}, η = ${settings.lr}${extraBits}`,
    size: SMALL,
    cls: 'label',
  });

  // Axes and ticks.
  axisLines(shapes, 'ax', box);
  const xs = ticks(sf.xr[0], sf.xr[1], sf.xr[1] - sf.xr[0] > 6 ? 2 : 1);
  const ys =
    sf.dims === 1
      ? ticks(sf.yr[0], sf.yr[1], sf.yr[1] - sf.yr[0] > 10 ? 4 : 2)
      : ticks(sf.yr[0], sf.yr[1], sf.yr[1] - sf.yr[0] > 4 ? 2 : 1);
  xs.forEach((v, k) => {
    const p = fr.at(sf.dims === 1 ? [v] : [v, sf.yr[0]]);
    shapes.push(tickLabel(`tx-${k}`, p.x, box.y1 + 20, num(v), SMALL, 'middle'));
  });
  ys.forEach((v, k) => {
    const y = box.y1 - ((v - sf.yr[0]) / (sf.yr[1] - sf.yr[0])) * (box.y1 - box.y0);
    shapes.push(tickLabel(`ty-${k}`, box.x0 - 8, y + 5, num(v), SMALL, 'end'));
  });
  shapes.push(tickLabel('ax-xn', box.x1 + 10, box.y1 + 5, 'x', SMALL, 'start'));
  if (sf.dims === 2) shapes.push(tickLabel('ax-yn', box.x0 - 30, box.y0 + 5, 'y', SMALL, 'end'));

  // The curve, or the contours.
  if (sf.dims === 1) {
    const n = 64;
    let prev = fr.at([sf.xr[0]]);
    for (let k = 1; k <= n; k++) {
      const p = fr.at([sf.xr[0] + ((sf.xr[1] - sf.xr[0]) * k) / n]);
      segment(shapes, box, `c-${k}`, prev, p, { opacity: 0.8 });
      prev = p;
    }
  } else {
    const n = 48;
    sf.levels!.forEach((c, i) => {
      let prev = fr.at(sf.contour!(c, 0));
      for (let k = 1; k <= n; k++) {
        const p = fr.at(sf.contour!(c, (2 * Math.PI * k) / n));
        segment(shapes, box, `ct-${i}-${k}`, prev, p, { opacity: 0.45 });
        prev = p;
      }
    });
  }

  // The lowest point.
  const m = fr.at(sf.min);
  shapes.push(
    {
      kind: 'arrow',
      id: 'min-h',
      x1: m.x - 7,
      y1: m.y,
      x2: m.x + 7,
      y2: m.y,
      head: 'none',
      role: 'found',
    },
    {
      kind: 'arrow',
      id: 'min-v',
      x1: m.x,
      y1: m.y - 7,
      x2: m.x,
      y2: m.y + 7,
      head: 'none',
      role: 'found',
    },
    sf.dims === 1
      ? tickLabel('min-t', m.x, m.y - 12, 'min', SMALL, 'middle')
      : tickLabel('min-t', m.x + 10, m.y + 18, 'min', SMALL, 'start'),
  );

  // The path.
  const pts = state.path.map((p) => fr.at(p));
  pts.forEach((p, k) => {
    if (k > 0) segment(shapes, box, `ps-${k}`, pts[k - 1]!, p, { role: 'g1' });
    if (k < pts.length - 1 && inBox(box, p))
      shapes.push({ kind: 'circle', id: `pd-${k}`, x: p.x, y: p.y, r: 3.5, role: 'g1' });
  });

  // The slope and the move about to happen. Both are always drawn while an update is shown
  // (marks point at them), hidden when there is nothing to draw: a flat slope, a tiny move, or
  // a point off the chart.
  const here = pts[pts.length - 1]!;
  const hidden = (id: string): Shape => ({
    kind: 'arrow',
    id,
    x1: here.x,
    y1: here.y,
    x2: here.x,
    y2: here.y,
    head: 'none',
    opacity: 0,
  });
  if (extra.grad) {
    let c: ReturnType<typeof clipToBox> = null;
    if (inBox(box, here)) {
      if (sf.dims === 1) {
        // The tangent: slope f′ in world units, drawn over ±0.6 in x.
        const g = extra.grad[0]!;
        const sx = (box.x1 - box.x0) / (sf.xr[1] - sf.xr[0]);
        const sy = (box.y1 - box.y0) / (sf.yr[1] - sf.yr[0]);
        const d = 0.6;
        c = clipToBox(
          box,
          here.x - d * sx,
          here.y + d * g * sy,
          here.x + d * sx,
          here.y - d * g * sy,
        );
      } else {
        const g = extra.grad;
        const len = Math.hypot(g[0]!, g[1]!);
        const L = 56;
        if (len > 0)
          c = clipToBox(
            box,
            here.x,
            here.y,
            here.x - (g[0]! / len) * L,
            here.y + (g[1]! / len) * L,
          );
      }
    }
    const role = roles.get('grad') ?? 'compare';
    shapes.push(
      c
        ? {
            kind: 'arrow',
            id: 'grad',
            ...c,
            dashed: true,
            head: sf.dims === 1 ? 'none' : 'end',
            role,
          }
        : hidden('grad'),
    );
  }
  if (extra.to) {
    const to = fr.at(extra.to);
    const c = clipToBox(box, here.x, here.y, to.x, to.y);
    shapes.push(
      c && Math.hypot(c.x2 - c.x1, c.y2 - c.y1) > 4
        ? { kind: 'arrow', id: 'next', ...c, role: roles.get('next') ?? 'active' }
        : hidden('next'),
    );
  }

  const nowAt = clamp(box, here);
  shapes.push({
    kind: 'circle',
    id: 'now',
    x: nowAt.x,
    y: nowAt.y,
    r: 7,
    role: roles.get('now') ?? (state.status === 'diverged' ? 'error' : 'active'),
    z: 3,
  });
  if (!inBox(box, here))
    shapes.push({
      kind: 'text',
      id: 'off',
      x: Math.min(nowAt.x, box.x1 - 4),
      y: nowAt.y < box.y0 + 30 ? nowAt.y + 26 : nowAt.y - 14,
      text: 'off the chart',
      size: SMALL,
      anchor: nowAt.x > (box.x0 + box.x1) / 2 ? 'end' : 'start',
      role: 'error',
    });

  // f by step.
  const lc = fr.loss;
  const n = Math.max(RUN_STEPS, Math.ceil(state.t / RUN_STEPS) * RUN_STEPS);
  const [lo, hi] = sf.loss;
  const lat = (k: number, f: number) => ({
    x: lc.x0 + (k / n) * (lc.x1 - lc.x0),
    y: lc.y1 - ((f - lo) / (hi - lo)) * (lc.y1 - lc.y0),
  });
  shapes.push({
    kind: 'text',
    id: 'lc-title',
    x: lc.x0,
    y: lc.y0 - 12,
    text: 'f by step',
    size: SMALL,
    weight: 'bold',
  });
  axisLines(shapes, 'lc-ax', lc);
  shapes.push(
    tickLabel('lc-x0', lc.x0, lc.y1 + 20, '0', SMALL, 'middle'),
    tickLabel('lc-x1', lc.x1, lc.y1 + 20, String(n), SMALL, 'middle'),
    tickLabel('lc-y0', lc.x0 - 8, lc.y1 + 5, num(lo), SMALL, 'end'),
    tickLabel('lc-y1', lc.x0 - 8, lc.y0 + 5, num(hi), SMALL, 'end'),
  );
  const fs = state.path.map((p) => sf.f(p));
  for (let k = 1; k < fs.length; k++)
    segment(shapes, lc, `lc-${k}`, lat(k - 1, fs[k - 1]!), lat(k, fs[k]!), { role: 'g1' });
  const last = clamp(lc, lat(fs.length - 1, fs[fs.length - 1]!));
  shapes.push({ kind: 'circle', id: 'lc-now', x: last.x, y: last.y, r: 4, role: 'g1' });

  const boxes: Bounds[] = [
    { x: 0, y: top, w: box.x1 + 30, h: box.y1 + 28 - top },
    { x: lc.x0 - 40, y: lc.y0 - 30, w: lc.x1 - lc.x0 + 56, h: lc.y1 - lc.y0 + 56 },
  ];
  if (!stage?.strip && !wide) boxes.push({ x: 0, y: top - 46, w: 1, h: 1 });
  return { shapes, bounds: padBounds(unionBounds(...boxes), 10) };
}

/**
 * The plot keeps its size in scene units within an arrangement, so the choice is made from the
 * stage's shape: the loss chart goes beside the plot on a wide stage, under it on a phone.
 */
export function view(step: Step<GdState, GdExtra>, settings: GdSettings, stage?: StageSize): Scene {
  const wide = !stage || stage.w >= 600 || stage.w > 1.3 * stage.h;
  const best = draw(step, settings, wide, stage);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(step.state) };
}
