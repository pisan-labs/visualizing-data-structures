/**
 * Two parts: the table of the experiment (n, T(n), the ratio to the row before, and b), with the
 * fitted model and a prediction under it, and the log-log plot of the same rows with the fitted
 * line, the slope of the latest doubling, the guess and the reading that checks it.
 *
 * On a wide stage the plot sits right of the table; on a tall one it sits above the table. The
 * top right corner stays empty in both, clear of the stage's zoom buttons. The drawing never
 * names the algorithm: a practice question asks which one made the table.
 *
 * Every part keeps its size through an operation: the table reserves its planned rows (and the
 * model and guess lines once there will be one), and the plot's axes come from the state, set
 * when the operation starts.
 *
 * Ids: "t-..." the table ("t-title", "t-h-<col>" headers, "t-rule", "t-row-<k>" the band behind
 * a marked row, "t-n-<k>", "t-t-<k>", "t-r-<k>", "t-b-<k>" its cells, "t-model", "t-how",
 * "t-guess", "t-check"); "p-..." the plot (see the chart section).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pickLayout, translate } from '../_stage/arrange';
import { sup } from '../big-o-definition/expr';
import {
  bOf,
  commas,
  describe,
  errorText,
  fix2,
  modelText,
  tShort,
  type Axes,
  type DxSettings,
  type DxState,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

/** Width of a monospace character in em, a little over 0.6 so wider fonts still fit. */
const MONO = 0.63;
/** Width of a proportional text in em, generous enough for CI's DejaVu Sans. */
const PROP = 0.66;
const M = 14;
const GAP = 24;

/** The size, at most `max`, at which a text fits in `room`. */
const fitSize = (text: string, max: number, room: number, em: number) =>
  Math.min(max, Math.floor((room / ([...text].length * em)) * 2) / 2);

interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

// ----- The table -----

const T = {
  size: 15,
  pad: 12,
  colGap: 20,
  /** Column widths in characters: n, T(n), ratio, b. */
  cols: [9, 11, 6, 5] as const,
  title: 22,
  head: 52,
  rule: 60,
  pitch: 27,
  line: 26,
};
const CH = T.size * MONO;

/** Right edges of the four columns. */
const COL_X = T.cols.reduce<number[]>((xs, c, i) => {
  xs.push((i ? xs[i - 1]! + T.colGap : T.pad) + c * CH);
  return xs;
}, []);
const TW = COL_X[3]! + T.pad;

function tableBlock(state: DxState, settings: DxSettings, roles: Roles): Block {
  const shapes: Shape[] = [];
  const text = (
    id: string,
    x: number,
    y: number,
    t: string,
    more: Partial<Extract<Shape, { kind: 'text' }>> = {},
  ) => shapes.push({ kind: 'text', id, x, y, text: t, size: T.size, mono: true, ...more });

  const title =
    settings.noise === 'off'
      ? 'T(n): the steps counted at each size'
      : settings.noise === 'one'
        ? 'T(n): one timed run per size, with noise'
        : 'T(n): the median of 5 timed runs, with noise';
  text('t-title', T.pad, T.title, title, {
    mono: false,
    size: fitSize(title, 14, TW - 2 * T.pad, PROP),
    cls: 'label',
  });
  ['n', 'T(n)', 'ratio', 'b'].forEach((h, i) =>
    text(`t-h-${i}`, COL_X[i]!, T.head, h, { anchor: 'end', weight: 'bold' }),
  );
  shapes.push({
    kind: 'arrow',
    id: 't-rule',
    x1: T.pad / 2,
    y1: T.rule,
    x2: TW - T.pad / 2,
    y2: T.rule,
    head: 'none',
    opacity: 0.6,
  });

  const top = (k: number) => T.rule + k * T.pitch;
  const base = (k: number) => top(k) + T.pitch / 2 + T.size * 0.36;
  state.sizes.forEach((n, k) => {
    const row = state.rows[k];
    const band = `t-row-${k}`;
    if (roles.has(band))
      shapes.push({
        kind: 'rect',
        id: band,
        x: T.pad / 2,
        y: top(k) + 1,
        w: TW - T.pad,
        h: T.pitch - 2,
        r: 4,
        role: roles.get(band),
      });
    text(`t-n-${k}`, COL_X[0]!, base(k), commas(n), {
      anchor: 'end',
      cls: row ? undefined : 'label',
    });
    if (!row) return;
    text(`t-t-${k}`, COL_X[1]!, base(k), tShort(row.t), { anchor: 'end' });
    if (k === 0) return;
    const before = state.rows[k - 1]!.t;
    text(`t-r-${k}`, COL_X[2]!, base(k), fix2(row.t / before), { anchor: 'end' });
    const bid = `t-b-${k}`;
    text(bid, COL_X[3]!, base(k), fix2(bOf(before, row.t)), {
      anchor: 'end',
      weight: 'bold',
      role: roles.get(bid),
    });
  });

  // The model and the guess, on lines reserved for the whole operation.
  let y = top(state.sizes.length) + 8;
  const line = (id: string, t: string, more: Partial<Extract<Shape, { kind: 'text' }>> = {}) => {
    y += T.line;
    text(id, T.pad, y, t, { size: fitSize(t, T.size, TW - 2 * T.pad, MONO), ...more });
  };
  if (state.sizes.length >= 2) {
    if (state.fit) {
      line('t-model', `T(n) ≈ ${modelText(state.fit)}`, {
        weight: 'bold',
        role: roles.get('t-model'),
      });
      const how =
        settings.fit === 'last' || state.rows.length === 2
          ? 'b from the last two rows'
          : 'least-squares line through every row';
      line('t-how', how, { mono: false, cls: 'label', size: fitSize(how, 13, TW, PROP) });
    } else y += 2 * T.line;
  }
  const g = state.guess;
  if (g) {
    line('t-guess', `guess T(${commas(g.n)}) ≈ ${tShort(g.guess)}`, { role: roles.get('t-guess') });
    if (g.t !== null)
      line('t-check', `measured ${tShort(g.t)}: ${errorText(g.guess, g.t)}`, {
        role: roles.get('t-check'),
      });
    else y += T.line;
  }
  return { shapes, w: TW, h: y + 14 };
}

// ----- Log-log chart -----
//
// A chart with a log₂ x axis (n: one step per doubling) and a log₁₀ y axis (T(n): one grid line
// per power of ten). Its frame comes from the state's Axes. This section is all the chart code
// on the page; the shared src/layouts/chart.ts planned for big-o-definition and this page can
// take it over. Ids: "p-axis-x", "p-axis-y", "p-xlab", "p-ylab", "p-tx-<k>" and "p-gx-<k>" (a
// tick label and grid line at each size), "p-tx-g" (at the guess), "p-ty-<e>" and "p-gy-<e>"
// (at 10ᵉ), "p-pt-<k>" the points, "p-seg-<k>" the segment from point k − 1 to point k,
// "p-tri" with "p-tri-x" and "p-tri-y" the slope triangle on a marked segment, "p-fit" the
// fitted line and "p-fit-l" its slope, "p-guess" with "p-guess-x" the guess, "p-check" the
// reading at the guess, "p-hint" before any run.

const P = { w: 440, x0: 60, x1: 420, y0: 50, y1: 270, h: 322, tick: 13, title: 13 };

interface Frame {
  axes: Axes;
}

const px = (f: Frame, n: number) =>
  P.x0 + ((Math.log2(n) - f.axes.x0) / (f.axes.x1 - f.axes.x0)) * (P.x1 - P.x0);

/** y of a log₁₀ value. */
const pyLog = (f: Frame, lg: number) =>
  P.y1 - ((lg - f.axes.y0) / (f.axes.y1 - f.axes.y0)) * (P.y1 - P.y0);

const py = (f: Frame, t: number) => pyLog(f, Math.log10(t));

/** A size for a tick label: "800", "1.6k", "12.8k", "512k", "1M". */
export function nShort(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Number((n / 1000).toPrecision(3))}k`;
  return `${Number((n / 1_000_000).toPrecision(3))}M`;
}

function chartFrame(shapes: Shape[], f: Frame, sizes: readonly number[], guessN: number | null) {
  const line = (id: string, x1: number, y1: number, x2: number, y2: number, opacity: number) =>
    shapes.push({ kind: 'arrow', id, x1, y1, x2, y2, head: 'none', opacity });
  const label = (
    id: string,
    x: number,
    y: number,
    text: string,
    anchor: 'start' | 'middle' | 'end',
    size = P.tick,
  ) => shapes.push({ kind: 'text', id, x, y, text, size, anchor, cls: 'label' });

  line('p-axis-x', P.x0, P.y1, P.x1 + 6, P.y1, 0.7);
  line('p-axis-y', P.x0, P.y1, P.x0, P.y0 - 6, 0.7);
  label('p-ylab', 4, 24, 'T(n), log scale', 'start', P.title);
  label('p-xlab', P.x1, P.y1 + 44, 'n, log scale: each step is ×2', 'end', P.title);
  if (sizes.length === 0) return;

  // y: a grid line at each power of ten, or every other (third, …) one when there are many.
  const { y0, y1 } = f.axes;
  const every = Math.ceil((y1 - y0) / 7);
  for (let e = y1; e >= y0; e -= every) {
    const y = pyLog(f, e);
    label(`p-ty-${e}`, P.x0 - 6, y + 4, e === 0 ? '1' : e === 1 ? '10' : `10${sup(e)}`, 'end');
    if (e > y0) line(`p-gy-${e}`, P.x0, y, P.x1, y, 0.18);
  }

  // x: a grid line at each size, and labels that skip every other size when they would touch.
  const xs = sizes.map((n) => px(f, n));
  const step = xs.length > 1 ? xs[1]! - xs[0]! : Infinity;
  const widest = Math.max(...sizes.map((n) => nShort(n).length)) * P.tick * PROP;
  const skip = step < widest + 2 ? 2 : 1;
  sizes.forEach((n, k) => {
    line(`p-gx-${k}`, xs[k]!, P.y0, xs[k]!, P.y1, 0.12);
    if ((sizes.length - 1 - k) % skip === 0)
      label(`p-tx-${k}`, xs[k]!, P.y1 + 18, nShort(n), 'middle');
  });
  if (guessN !== null && !sizes.includes(guessN)) {
    const x = px(f, guessN);
    const room = (nShort(guessN).length * P.tick * PROP) / 2 + 4;
    const near = sizes.some(
      (n, k) =>
        (sizes.length - 1 - k) % skip === 0 &&
        Math.abs(px(f, n) - x) < room + (nShort(n).length * P.tick * PROP) / 2,
    );
    if (!near) label('p-tx-g', x, P.y1 + 18, nShort(guessN), 'middle');
  }
}

/** The part of the line through (xa, ya) and (xb, yb) inside the plot, or null. */
function clip(xa: number, ya: number, xb: number, yb: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = xb - xa;
  const dy = yb - ya;
  for (const [p, q] of [
    [-dx, xa - P.x0],
    [dx, P.x1 - xa],
    [-dy, ya - P.y0],
    [dy, P.y1 - ya],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t1 - t0 <= 1e-9) return null;
  return { x1: xa + dx * t0, y1: ya + dy * t0, x2: xa + dx * t1, y2: ya + dy * t1 };
}

function chartBlock(state: DxState, roles: Roles): Block {
  const shapes: Shape[] = [];
  const f: Frame = { axes: state.axes };
  const g = state.guess;
  chartFrame(shapes, f, state.sizes, g ? g.n : null);
  if (state.sizes.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'p-hint',
      x: (P.x0 + P.x1) / 2,
      y: (P.y0 + P.y1) / 2,
      text: 'Press Run to measure',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    return { shapes, w: P.w, h: P.h };
  }

  const pts = state.rows.map((r) => ({ x: px(f, r.n), y: py(f, r.t) }));

  // The fitted line, across the whole plot, under the points.
  if (state.fit) {
    const lgA = Math.log10(state.fit.a);
    const at = (l2: number) => pyLog(f, lgA + state.fit!.b * l2 * Math.LOG10E * Math.LN2);
    const xa = P.x0;
    const xb = P.x1;
    const seg = clip(xa, at(f.axes.x0), xb, at(f.axes.x1)) ?? {
      x1: pts.at(-1)!.x,
      y1: pts.at(-1)!.y,
      x2: pts.at(-1)!.x,
      y2: pts.at(-1)!.y,
    };
    shapes.push({
      kind: 'arrow',
      id: 'p-fit',
      ...seg,
      head: 'none',
      dashed: true,
      role: roles.get('p-fit') ?? 'found',
    });
    // The slope goes in a corner of the plot clear of the points and the line.
    const text = `slope b = ${fix2(state.fit.b)}`;
    const w = [...text].length * 15 * PROP;
    const dots = [...pts];
    if (g)
      dots.push({ x: px(f, g.n), y: py(f, g.guess) }, { x: px(f, g.n), y: py(f, g.t ?? g.guess) });
    const lineY = (x: number) =>
      seg.y1 + ((seg.y2 - seg.y1) * (x - seg.x1)) / (seg.x2 - seg.x1 || 1);
    const clear = (x: number, base: number) => {
      const [top, bottom] = [base - 16, base + 6];
      if (dots.some((d) => d.x > x - 9 && d.x < x + w + 9 && d.y > top - 9 && d.y < bottom + 9))
        return false;
      const [l, r] = [Math.max(x, seg.x1), Math.min(x + w, seg.x2)];
      if (l > r) return true;
      const [ya, yb] = [lineY(l), lineY(r)];
      return Math.max(ya, yb) < top - 4 || Math.min(ya, yb) > bottom + 4;
    };
    const spots: [number, number][] = [
      [P.x0 + 10, P.y0 + 18],
      [P.x1 - 10 - w, P.y0 + 18],
      [P.x1 - 10 - w, P.y1 - 12],
      [P.x0 + 10, P.y1 - 12],
    ];
    const [x, y] = spots.find(([sx, sy]) => clear(sx, sy)) ?? spots[0]!;
    shapes.push({
      kind: 'text',
      id: 'p-fit-l',
      x,
      y,
      text,
      size: 15,
      weight: 'bold',
      role: 'found',
    });
  }

  // Segments between neighbors, and the slope triangle on the marked one.
  pts.forEach((p, k) => {
    if (k === 0) return;
    const q = pts[k - 1]!;
    const id = `p-seg-${k}`;
    const role = roles.get(id);
    shapes.push({
      kind: 'arrow',
      id,
      x1: q.x,
      y1: q.y,
      x2: p.x,
      y2: p.y,
      head: 'none',
      role,
      opacity: role ? 1 : 0.55,
    });
    if (!role) return;
    const ratio = state.rows[k]!.t / state.rows[k - 1]!.t;
    shapes.push({
      kind: 'polygon',
      id: 'p-tri',
      points: [
        { x: q.x, y: q.y },
        { x: p.x, y: q.y },
        { x: p.x, y: p.y },
      ],
      role,
    });
    const below = p.y <= q.y;
    shapes.push({
      kind: 'text',
      id: 'p-tri-x',
      x: (q.x + p.x) / 2,
      y: below ? q.y + 16 : q.y - 6,
      text: '×2',
      size: 13,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
    shapes.push({
      kind: 'text',
      id: 'p-tri-y',
      x: p.x + 7,
      y: (q.y + p.y) / 2 + 4,
      text: `×${fix2(ratio)}`,
      size: 13,
      weight: 'bold',
      role,
    });
  });

  // The guess and the reading that checks it.
  if (g) {
    const x = px(f, g.n);
    const y = py(f, g.guess);
    shapes.push({
      kind: 'arrow',
      id: 'p-guess-x',
      x1: x,
      y1: P.y1,
      x2: x,
      y2: y,
      head: 'none',
      dashed: true,
      opacity: 0.5,
    });
    shapes.push({ kind: 'circle', id: 'p-guess', x, y, r: 8, role: roles.get('p-guess') });
    if (g.t !== null)
      shapes.push({
        kind: 'circle',
        id: 'p-check',
        x,
        y: py(f, g.t),
        r: 5,
        cls: 'arrowhead',
        role: roles.get('p-check') ?? 'found',
      });
  }

  pts.forEach((p, k) => {
    const id = `p-pt-${k}`;
    shapes.push({
      kind: 'circle',
      id,
      x: p.x,
      y: p.y,
      r: 5,
      cls: 'arrowhead',
      role: roles.get(id),
    });
  });
  return { shapes, w: P.w, h: P.h };
}

// ----- Putting the parts together -----

interface Placed {
  shapes: Shape[];
  bounds: Bounds;
}

function place(table: Block, chart: Block, beside: boolean): Placed {
  const [tx, ty, cx, cy] = beside
    ? [M, M, M + table.w + GAP, M]
    : [M + Math.max(0, (chart.w - table.w) / 2), M + chart.h + GAP / 2, M, M];
  const w = beside ? table.w + GAP + chart.w : Math.max(table.w, chart.w);
  const h = beside ? Math.max(table.h, chart.h) : chart.h + GAP / 2 + table.h;
  return {
    shapes: [...translate(table.shapes, tx, ty), ...translate(chart.shapes, cx, cy)],
    bounds: { x: 0, y: 0, w: w + 2 * M, h: h + 2 * M },
  };
}

export function view(
  step: Step<DxState, undefined>,
  settings: DxSettings,
  stage?: StageSize,
): Scene {
  const roles: Roles = new Map(step.marks.map((m) => [m.id, m.role]));
  const table = tableBlock(step.state, settings, roles);
  const chart = chartBlock(step.state, roles);
  const pick = pickLayout(stage, [place(table, chart, true), place(table, chart, false)]);
  return { ...pick, label: describe(step.state, settings) };
}
