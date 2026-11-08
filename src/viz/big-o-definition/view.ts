/**
 * Two charts over n = 1 to N.
 *
 * Values: f(n) and the bound c·g(n) (for Θ, c₁·g(n) and c₂·g(n); before any c, g(n) itself),
 * a dashed line at n₀, a gray band over the n before n₀ (the definition ignores them), red bands
 * over every n ≥ n₀ where the inequality fails, and under the axis a strip with one cell per n:
 * gray before n₀, green where it holds, red where it fails.
 *
 * Ratio: f(n)/g(n), with a line at each c (f ≤ c·g is f/g ≤ c where g > 0) and, after the
 * limit test, a dashed line at the limit. Stretches of the ratio over failing n turn red.
 *
 * The y axis of each chart depends only on f, g, N and the scale setting, so moving c or n₀
 * moves the bound and the lines, never the axes. Curves are line segments between sampled n
 * (every n up to 60 of them) with ids by n, so a moving c·g animates. Values outside the chart
 * are clipped at its edge.
 *
 * On a wide stage the ratio chart sits beside the values chart, on a tall one under it. The top
 * of each chart holds only short keys at its left, clear of the stage's zoom buttons.
 *
 * Ids: "v-..." the values chart ("v-f-<n>" and "v-b-<n>" curve segments, "v-b2-<n>" Θ's upper
 * bound, "v-key-f", "v-key-b", "v-key-b2" the keys, "v-n0", "v-cur", "v-band-<n>",
 * "v-strip-<n>"), "r-..." the ratio chart ("r-<n>" segments, "r-c-lo", "r-c-hi", "r-lim-line",
 * "r-lim" its caption, "r-key", "r-cur").
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pickLayout, translate } from '../_stage/arrange';
import {
  approx,
  cmpR,
  divR,
  exprOf,
  lgR,
  limitOf,
  limitText,
  mulR,
  rat,
  subR,
  sup,
  valuesUpTo,
  type Rat,
} from './expr';
import {
  boundsOf,
  describe,
  holds,
  rangeOf,
  type Bound,
  type DefExtra,
  type DefSettings,
  type DefState,
} from './model';

/** Chart width, plot left and right. */
const W = 440;
const PX0 = 62;
const PX1 = 418;
const GAP = 26;
/** Values chart: plot top and bottom, the strip, the n₀ label, the two expression lines. */
const V = { py0: 48, py1: 232, strip: 258, stripH: 11, n0: 292, f: 318, g: 340, h: 352 };
/** Ratio chart. */
const R = { py0: 48, py1: 194, caption: 236, h: 248 };
const TICK = 13;
const KEY = 15;
/** Most curve segments per curve. */
const SEGMENTS = 60;

type Roles = Map<string, MarkRole>;

interface Axis {
  log: boolean;
  /** Linear: the values at the bottom and top. Log: their base-10 logarithms. */
  lo: Rat;
  hi: Rat;
  llo: number;
  lhi: number;
}

/** Where a value sits: 0 at the bottom of the plot, 1 at the top (outside: beyond). */
function place(axis: Axis, v: Rat): number {
  if (axis.log) {
    if (v.n <= 0n) return -1e3;
    return (lgR(v) - axis.llo) / (axis.lhi - axis.llo);
  }
  const p = approx(divR(subR(v, axis.lo), subR(axis.hi, axis.lo)));
  return Math.max(-1e3, Math.min(1e3, p));
}

/** A round number at or above v: 1, 2, 2.5 or 5 times a power of ten. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const e = Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * 10 ** e >= v * (1 - 1e-12)) return m * 10 ** e;
  return 10 ** (e + 1);
}

function niceRat(v: Rat): Rat {
  const x = approx(v);
  if (!Number.isFinite(x) || x > 1e15) return v;
  const n = niceCeil(x);
  return n >= 1
    ? rat(BigInt(Math.round(n * 1000)), 1000n)
    : rat(BigInt(Math.round(n * 1e6)), 1000000n);
}

const maxR = (vs: Rat[]) => vs.reduce((a, b) => (cmpR(a, b) >= 0 ? a : b));
const minR = (vs: Rat[]) => vs.reduce((a, b) => (cmpR(a, b) <= 0 ? a : b));

/** An axis for these values: log when they span more than `spread` and are positive enough. */
function makeAxis(vs: Rat[], scale: DefSettings['scale'], spread: number): Axis {
  const pos = vs.filter((v) => v.n > 0n);
  const top = vs.length ? maxR(vs) : rat(1n);
  const bottom = vs.length ? minR(vs) : rat(0n);
  const span = pos.length ? lgR(maxR(pos)) - lgR(minR(pos)) : 0;
  const log =
    pos.length > 0 && (scale === 'log' || (scale === 'auto' && span > spread && bottom.n > 0n));
  if (log) {
    let llo = Math.floor(lgR(minR(pos)));
    let lhi = Math.ceil(lgR(maxR(pos)));
    if (lhi - llo < 1) lhi = llo + 1;
    if (!Number.isFinite(llo)) llo = lhi - 1;
    return { log: true, lo: rat(0n), hi: rat(1n), llo, lhi };
  }
  const hi = top.n > 0n ? niceRat(top) : rat(1n);
  const lo =
    bottom.n < 0n
      ? rat(-niceRat(rat(-bottom.n, bottom.d)).n, niceRat(rat(-bottom.n, bottom.d)).d)
      : rat(0n);
  return { log: false, lo, hi, llo: 0, lhi: 1 };
}

/** A tick label: "120,000", "2.5", "1.3e30", "10¹⁰". */
function tickText(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6) {
    const e = Math.floor(Math.log10(a));
    const m = a / 10 ** e;
    return `${v < 0 ? '−' : ''}${Number(m.toFixed(1))}e${e}`;
  }
  const s = Number(a.toFixed(a < 1 ? 3 : a < 100 ? 1 : 0)).toLocaleString('en-US');
  return `${v < 0 ? '−' : ''}${s}`;
}

const powerText = (k: number) => (k === 0 ? '1' : k === 1 ? '10' : `10${sup(k)}`);

/** The n whose values the curves pass through: every n, or evenly spread ones, and N. */
export function samples(N: number): number[] {
  const step = Math.max(1, Math.ceil((N - 1) / SEGMENTS));
  const out: number[] = [];
  for (let n = 1; n < N; n += step) out.push(n);
  out.push(N);
  return out;
}

const xOf = (n: number, N: number) => PX0 + ((n - 1) / Math.max(1, N - 1)) * (PX1 - PX0);

interface Plot {
  py0: number;
  py1: number;
}

const yOf = (p: number, plot: Plot) => plot.py1 - p * (plot.py1 - plot.py0);

/**
 * A curve through (n, p) points as segments "id-n", clipped to the plot: a segment wholly
 * outside is left out, one half outside is cut at the edge.
 */
function curve(
  shapes: Shape[],
  id: string,
  pts: { n: number; p: number | null }[],
  N: number,
  plot: Plot,
  role: (a: number, b: number) => MarkRole | undefined,
  dashed = false,
) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (a.p === null || b.p === null) continue;
    let t0 = 0;
    let t1 = 1;
    const dp = b.p - a.p;
    for (const [edge, keepAbove] of [
      [0, true],
      [1, false],
    ] as const) {
      // Keep the part with p >= 0 (keepAbove) or p <= 1.
      const inside = (p: number) => (keepAbove ? p >= edge : p <= edge);
      if (!inside(a.p) && !inside(b.p)) {
        t0 = 1;
        t1 = 0;
        break;
      }
      if (inside(a.p) && inside(b.p)) continue;
      const t = (edge - a.p) / dp;
      if (inside(a.p)) t1 = Math.min(t1, t);
      else t0 = Math.max(t0, t);
    }
    if (t1 - t0 <= 1e-9) continue;
    const xa = xOf(a.n, N);
    const xb = xOf(b.n, N);
    shapes.push({
      kind: 'arrow',
      id: `${id}-${a.n}`,
      x1: xa + (xb - xa) * t0,
      y1: yOf(a.p + dp * t0, plot),
      x2: xa + (xb - xa) * t1,
      y2: yOf(a.p + dp * t1, plot),
      head: 'none',
      role: role(a.n, b.n),
      dashed,
    });
  }
}

function frame(shapes: Shape[], pre: string, axis: Axis, N: number, plot: Plot) {
  shapes.push({
    kind: 'arrow',
    id: `${pre}-axis-x`,
    x1: PX0,
    y1: plot.py1,
    x2: PX1 + 6,
    y2: plot.py1,
    head: 'none',
    opacity: 0.7,
  });
  shapes.push({
    kind: 'arrow',
    id: `${pre}-axis-y`,
    x1: PX0,
    y1: plot.py1,
    x2: PX0,
    y2: plot.py0 - 4,
    head: 'none',
    opacity: 0.7,
  });
  const every = N <= 20 ? 5 : N <= 50 ? 10 : N <= 100 ? 20 : 50;
  const ticks = [1, ...Array.from({ length: Math.floor(N / every) }, (_, i) => (i + 1) * every)];
  for (const n of ticks) {
    shapes.push({
      kind: 'text',
      id: `${pre}-tick-x-${n}`,
      x: xOf(n, N),
      y: plot.py1 + 17,
      text: String(n),
      size: TICK,
      anchor: 'middle',
      cls: 'label',
    });
  }
  shapes.push({
    kind: 'text',
    id: `${pre}-tick-n`,
    x: PX1 + 12,
    y: plot.py1 + 4,
    text: 'n',
    size: TICK + 1,
    cls: 'label',
  });
  // y ticks: the top, 0, the middle when there is room, the bottom when it is negative and
  // clear of 0; on a log axis, powers of ten counted down from the top.
  const ys: { p: number; text: string }[] = [];
  if (axis.log) {
    const span = axis.lhi - axis.llo;
    const step = Math.max(1, Math.ceil(span / 3));
    for (let k = axis.lhi; k >= axis.llo; k -= step)
      ys.push({ p: (k - axis.llo) / span, text: powerText(k) });
  } else {
    const lo = approx(axis.lo);
    const hi = approx(axis.hi);
    const at = (v: number) => (v - lo) / (hi - lo);
    ys.push({ p: 1, text: tickText(hi) }, { p: at(0), text: '0' });
    if (1 - at(0) >= 0.4) ys.push({ p: at(hi / 2), text: tickText(hi / 2) });
    if (lo < 0 && at(0) >= 0.12) ys.push({ p: 0, text: tickText(lo) });
  }
  ys.forEach((t, i) => {
    const y = yOf(t.p, plot);
    shapes.push({
      kind: 'text',
      id: `${pre}-tick-y-${i}`,
      x: PX0 - 6,
      y: y + 4,
      text: t.text,
      size: TICK,
      anchor: 'end',
      cls: 'label',
    });
    if (t.p > 0.001)
      shapes.push({
        kind: 'arrow',
        id: `${pre}-grid-${i}`,
        x1: PX0,
        y1: y,
        x2: PX1,
        y2: y,
        head: 'none',
        opacity: 0.18,
      });
  });
}

function key(
  shapes: Shape[],
  id: string,
  x: number,
  text: string,
  role: MarkRole | undefined,
  dashed = false,
): number {
  shapes.push({ kind: 'arrow', id, x1: x, y1: 18, x2: x + 22, y2: 18, head: 'none', role, dashed });
  shapes.push({ kind: 'text', id: `${id}-l`, x: x + 28, y: 23, text, size: KEY });
  return x + 28 + text.length * KEY * 0.58 + 18;
}

/** Status of each n: before n₀, holds, fails; null when no constants are set. */
function statuses(state: DefState, settings: DefSettings): ('skip' | 'ok' | 'fail')[] | null {
  const bounds = boundsOf(state, settings.relation);
  if (!bounds) return null;
  const N = rangeOf(settings);
  const fv = valuesUpTo(exprOf(state.f), N);
  const gv = valuesUpTo(exprOf(state.g), N);
  const n0 = state.n0 ?? 1;
  return fv.map((v, i) => (i + 1 < n0 ? 'skip' : holds(v, gv[i]!, bounds) ? 'ok' : 'fail'));
}

/** Runs of equal status: [first n, last n, status]. */
function runs<T>(xs: T[]): [number, number, T][] {
  const out: [number, number, T][] = [];
  xs.forEach((x, i) => {
    const last = out.at(-1);
    if (last && last[2] === x && last[1] === i) last[1] = i + 1;
    else out.push([i + 1, i + 1, x]);
  });
  return out;
}

const boundName = (b: Bound, all: Bound[]) =>
  all.length === 2 ? (b.side === 'lower' ? 'c₁·g(n)' : 'c₂·g(n)') : `${b.text}·g(n)`;

function valuesChart(step: Step<DefState, DefExtra>, settings: DefSettings, roles: Roles): Shape[] {
  const { state } = step;
  const extra = step.extra ?? {};
  const shapes: Shape[] = [];
  const N = rangeOf(settings);
  const f = exprOf(state.f);
  const g = exprOf(state.g);
  const fv = valuesUpTo(f, N);
  const gv = valuesUpTo(g, N);
  const axis = makeAxis([...fv, ...gv], settings.scale, 5);
  const plot = { py0: V.py0, py1: V.py1 };
  const bounds = boundsOf(state, settings.relation);
  const st = statuses(state, settings);
  const shown = (n: number) => !extra.shown || (n >= extra.shown[0] && n <= extra.shown[1]);
  const half = (PX1 - PX0) / Math.max(1, N - 1) / 2;
  const left = (n: number) => Math.max(PX0, xOf(n, N) - half);
  const right = (n: number) => Math.min(PX1, xOf(n, N) + half);

  frame(shapes, 'v', axis, N, plot);

  // Bands: gray before n₀, red over failing n (only those checked so far).
  if (st) {
    for (const [a, b, s] of runs(
      st.map((x, i) => (x === 'fail' && !shown(i + 1) ? 'hidden' : x)),
    )) {
      if (s !== 'skip' && s !== 'fail') continue;
      shapes.push({
        kind: 'polygon',
        id: `v-band-${a}`,
        points: [
          { x: left(a), y: plot.py0 },
          { x: right(b), y: plot.py0 },
          { x: right(b), y: plot.py1 },
          { x: left(a), y: plot.py1 },
        ],
        role: s === 'fail' ? 'error' : undefined,
      });
    }
    // The strip: one cell per run of equal status, unchecked n left blank.
    const cells = st.map((x, i) => (x === 'skip' ? 'skip' : shown(i + 1) ? x : 'blank'));
    for (const [a, b, s] of runs(cells)) {
      if (s === 'blank') continue;
      shapes.push({
        kind: 'rect',
        id: `v-strip-${a}`,
        x: left(a),
        y: V.strip,
        w: right(b) - left(a),
        h: V.stripH,
        r: 2,
        role: s === 'ok' ? 'done' : s === 'fail' ? 'error' : undefined,
      });
    }
    shapes.push({
      kind: 'text',
      id: 'v-strip-l',
      x: PX0 - 6,
      y: V.strip + 10,
      text: 'check',
      size: TICK,
      anchor: 'end',
      cls: 'label',
    });
  }

  // Curves: the bound(s) first, then f on top.
  const pts = (vals: Rat[], k: Rat) =>
    samples(N).map((n) => ({ n, p: place(axis, mulR(k, vals[n - 1]!)) }));
  const one = rat(1n);
  let x = PX0 - 40;
  x = key(shapes, 'v-key-f', x, 'f(n)', roles.get('v-key-f') ?? 'g1');
  if (!extra.fOnly) {
    if (!bounds) {
      curve(shapes, 'v-b', pts(gv, one), N, plot, () => 'g2');
      key(shapes, 'v-key-b', x, 'g(n)', roles.get('v-key-b') ?? 'g2');
    } else {
      bounds.forEach((b, i) => {
        const id = i === 0 ? 'v-b' : 'v-b2';
        const role = b.side === 'lower' && bounds.length === 2 ? 'g6' : 'g2';
        curve(shapes, id, pts(gv, b.c), N, plot, () => role);
        x = key(
          shapes,
          `${id === 'v-b' ? 'v-key-b' : 'v-key-b2'}`,
          x,
          boundName(b, bounds),
          roles.get(id === 'v-b' ? 'v-key-b' : 'v-key-b2') ?? role,
        );
      });
    }
  }
  curve(shapes, 'v-f', pts(fv, one), N, plot, () => 'g1');

  // n₀ and the cursor.
  if (state.n0 !== null) {
    const xn = xOf(state.n0, N);
    shapes.push({
      kind: 'arrow',
      id: 'v-n0',
      x1: xn,
      y1: plot.py0 - 6,
      x2: xn,
      y2: V.strip + V.stripH + 6,
      head: 'none',
      dashed: true,
      role: roles.get('v-n0') ?? 'active',
    });
    const label = `n₀ = ${state.n0}`;
    const w = label.length * TICK * 0.6;
    shapes.push({
      kind: 'text',
      id: 'v-n0-l',
      x: Math.max(PX0 - 30 + w / 2, Math.min(W - 6 - w / 2, xn)),
      y: V.n0,
      text: label,
      size: TICK + 1,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get('v-n0') ?? 'active',
    });
  }
  if (extra.at !== undefined) {
    const n = extra.at;
    const xn = xOf(n, N);
    shapes.push({
      kind: 'arrow',
      id: 'v-cur',
      x1: xn,
      y1: plot.py0,
      x2: xn,
      y2: plot.py1,
      head: 'none',
      role: roles.get('v-cur') ?? 'compare',
    });
    const dots: [string, Rat, MarkRole][] = [['v-cur-f', fv[n - 1]!, 'g1']];
    if (bounds)
      bounds.forEach((b, i) =>
        dots.push([i === 0 ? 'v-cur-b' : 'v-cur-b2', mulR(b.c, gv[n - 1]!), 'g2']),
      );
    for (const [id, v, role] of dots) {
      const p = place(axis, v);
      if (p < -0.01 || p > 1.01) continue;
      shapes.push({ kind: 'circle', id, x: xn, y: yOf(p, plot), r: 5, role });
    }
  }

  // The functions, written out.
  const fit = (text: string) => Math.min(KEY, (W - 8) / (text.length * 0.58));
  for (const [id, y, text] of [
    ['v-def-f', V.f, `f(n) = ${f.text}`],
    ['v-def-g', V.g, `g(n) = ${g.text}`],
  ] as const) {
    shapes.push({ kind: 'text', id, x: 4, y, text, size: fit(text), mono: false });
  }
  return shapes;
}

function ratioChart(step: Step<DefState, DefExtra>, settings: DefSettings, roles: Roles): Shape[] {
  const { state } = step;
  const extra = step.extra ?? {};
  const shapes: Shape[] = [];
  const N = rangeOf(settings);
  const f = exprOf(state.f);
  const g = exprOf(state.g);
  const fv = valuesUpTo(f, N);
  const gv = valuesUpTo(g, N);
  const ratios = fv.map((v, i) => (gv[i]!.n === 0n ? null : divR(v, gv[i]!)));
  const defined = ratios.filter((r): r is Rat => r !== null);
  const lim = limitOf(f, g);
  const bounds = boundsOf(state, settings.relation);
  const extraVals = [...defined];
  if (state.limit && lim.kind === 'const') extraVals.push(lim.value);
  const axis = makeAxis(extraVals, settings.scale, 3);
  const plot = { py0: R.py0, py1: R.py1 };
  const st = statuses(state, settings);
  const shown = (n: number) => !extra.shown || (n >= extra.shown[0] && n <= extra.shown[1]);
  const failing = (n: number) => !!st && st[n - 1] === 'fail' && shown(n);

  frame(shapes, 'r', axis, N, plot);
  key(shapes, 'r-key', PX0 - 40, 'f(n)/g(n)', roles.get('r-key') ?? 'g1');

  // A line at each c: f ≤ c·g is f/g ≤ c where g(n) > 0. Each label goes where the ratio
  // curve leaves room: left or right, above or below its line.
  const curveY = ratios.map((r) =>
    r === null ? null : yOf(Math.max(0, Math.min(1, place(axis, r))), plot),
  );
  const taken: Bounds[] = [];
  const clear = (box: Bounds) => {
    if (box.y < plot.py0 - 2 || box.y + box.h > plot.py1 + 2) return false;
    if (
      taken.some(
        (t) => t.x < box.x + box.w && box.x < t.x + t.w && t.y < box.y + box.h && box.y < t.y + t.h,
      )
    )
      return false;
    let above = false;
    let below = false;
    for (let n = 1; n <= N; n++) {
      const x = xOf(n, N);
      const y = curveY[n - 1];
      if (y === null || y === undefined || x < box.x - 6 || x > box.x + box.w + 6) continue;
      if (y >= box.y - 3 && y <= box.y + box.h + 3) return false;
      if (y < box.y) above = true;
      else below = true;
    }
    return !(above && below);
  };
  if (bounds) {
    for (const b of bounds) {
      const id = b.side === 'lower' ? 'r-c-lo' : 'r-c-hi';
      const p = place(axis, b.c);
      const name = bounds.length === 2 ? (b.side === 'lower' ? 'c₁' : 'c₂') : 'c';
      const role = b.side === 'lower' && bounds.length === 2 ? 'g6' : 'g2';
      if (p < 0 || p > 1) {
        shapes.push({
          kind: 'text',
          id: `${id}-l`,
          x: PX0 + 6,
          y: p > 1 ? plot.py0 + 14 : plot.py1 - 6,
          text: `${name} = ${b.text} is ${p > 1 ? 'above' : 'below'} the chart`,
          size: TICK,
          cls: 'label',
        });
        continue;
      }
      const y = yOf(p, plot);
      shapes.push({ kind: 'arrow', id, x1: PX0, y1: y, x2: PX1, y2: y, head: 'none', role });
      const text = `${name} = ${b.text}`;
      const w = text.length * TICK * 0.6;
      const spots: Bounds[] = [];
      for (const x of [PX0 + 6, PX1 - 6 - w, (PX0 + PX1 - w) / 2])
        for (const top of [y - 17, y + 4]) spots.push({ x, y: top, w, h: 14 });
      const spot = spots.find(clear) ?? spots[0]!;
      taken.push(spot);
      shapes.push({
        kind: 'text',
        id: `${id}-l`,
        x: spot.x,
        y: spot.y + 11,
        text,
        size: TICK,
        weight: 'bold',
      });
    }
  }

  curve(
    shapes,
    'r',
    samples(N).map((n) => ({ n, p: ratios[n - 1] ? place(axis, ratios[n - 1]!) : null })),
    N,
    plot,
    (a, b) => (failing(a) && failing(b) ? 'error' : 'g1'),
  );

  if (state.limit) {
    if (lim.kind !== 'inf') {
      const p =
        lim.kind === 'zero' ? (axis.log ? -1 : place(axis, rat(0n))) : place(axis, lim.value);
      if (p >= 0 && p <= 1) {
        const y = yOf(p, plot);
        shapes.push({
          kind: 'arrow',
          id: 'r-lim-line',
          x1: PX0,
          y1: y,
          x2: PX1,
          y2: y,
          head: 'none',
          dashed: true,
          role: 'found',
        });
      }
    }
    shapes.push({
      kind: 'text',
      id: 'r-lim',
      x: 4,
      y: R.caption,
      text: `f(n)/g(n) → ${limitText(lim)} as n grows${lim.kind === 'zero' && axis.log ? ' (0 is off a log scale)' : ''}`,
      size: KEY,
      weight: 'bold',
      role: roles.get('r-lim') ?? 'found',
    });
  } else {
    shapes.push({
      kind: 'text',
      id: 'r-hint',
      x: 4,
      y: R.caption,
      text: 'f(n) ≤ c·g(n) is f(n)/g(n) ≤ c, where g(n) > 0',
      size: TICK + 1,
      cls: 'label',
    });
  }

  if (extra.at !== undefined && ratios[extra.at - 1]) {
    const n = extra.at;
    const xn = xOf(n, N);
    shapes.push({
      kind: 'arrow',
      id: 'r-cur',
      x1: xn,
      y1: plot.py0,
      x2: xn,
      y2: plot.py1,
      head: 'none',
      role: roles.get('r-cur') ?? 'compare',
    });
    const p = place(axis, ratios[n - 1]!);
    if (p >= -0.01 && p <= 1.01)
      shapes.push({ kind: 'circle', id: 'r-cur-d', x: xn, y: yOf(p, plot), r: 5, role: 'g1' });
  }
  return shapes;
}

export function view(
  step: Step<DefState, DefExtra>,
  settings: DefSettings,
  stage?: StageSize,
): Scene {
  const roles: Roles = new Map(step.marks.map((m) => [m.id, m.role]));
  const values = valuesChart(step, settings, roles);
  const ratio = ratioChart(step, settings, roles);
  const stacked = { dx: 0, dy: V.h + GAP, bounds: { x: 0, y: 0, w: W, h: V.h + GAP + R.h } };
  const side = { dx: W + GAP, dy: 0, bounds: { x: 0, y: 0, w: 2 * W + GAP, h: V.h } };
  const pick = pickLayout(stage, [stacked, side]);
  const bounds: Bounds = pick.bounds;
  return {
    shapes: [...values, ...translate(ratio, pick.dx, pick.dy)],
    bounds,
    label: describe(step.state, settings),
  };
}

/** Exported for the tests: the status of every n for a state. */
export { statuses };
