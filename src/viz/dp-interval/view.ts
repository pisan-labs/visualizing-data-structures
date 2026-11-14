import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest, translate } from '../../layouts/arrange';
import { tableGeometry, tableScene, type TableFrame, type TableLink } from '../../layouts/table';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import { callsLabel, shrinkInfinities } from '../_dp2/kit';
import {
  describe,
  itemId,
  sumOf,
  type IVExtra,
  type IVSettings,
  type IVState,
  type Span,
} from './model';

const CELL_W = 60;
const CELL_H = 56;
const CORNER = 13;
const PITCH = 54;
const BOX = 46;
const BOX_H = 40;
const GAP = 30;
/** Room left of the strip for its label. */
const STRIP_LABEL = 50;

/**
 * The table of stretches (row a, column b, the upper triangle), each solved cell with its best
 * k in the corner, beside (or under) the row of items. A candidate k draws arrows from the two
 * stretches either side of it into the cell. In the row, the stretch being solved is shaded, k
 * is lit and, for tiles, the two things outside the stretch that k is scored with. Recursion
 * counts calls in each cell's other corner and lights the stretches on the stack. The trace
 * takes tiles away in order, or merges piles into wider boxes.
 */
export function view(step: Step<IVState, IVExtra>, settings: IVSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const merge = settings.problem === 'merge';
  const n = state.v.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  for (const s of extra.stack ?? []) {
    const id = `cell-${s.a}-${s.b}`;
    if (!roles.has(id)) roles.set(id, 'visit');
  }
  const frame: TableFrame = {
    rows: n,
    cols: n,
    colHeads: 2,
    rowHeads: [30, 40],
    cellW: CELL_W,
    cellH: CELL_H,
  };
  const g = tableGeometry(frame);
  const idx = Array.from({ length: n }, (_, i) => String(i + 1));
  const vals = state.v.map(String);
  const shown = (a: number, b: number) => state.best[a]?.[b] ?? extra.seen?.[a]?.[b] ?? null;
  const shownK = (a: number, b: number) => state.K[a]?.[b] ?? extra.seenK?.[a]?.[b] ?? null;
  const links: TableLink[] = (extra.reads ?? []).map((r, k) => ({
    id: `read-${k}`,
    from: r.from,
    to: r.to,
    role: r.best ? 'active' : undefined,
  }));
  const table = tableScene(frame, {
    values: Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) => {
        const v = b >= a ? shown(a, b) : null;
        return v === null ? null : String(v);
      }),
    ),
    colHeads: [idx, vals],
    colStyles: ['index', 'label'],
    rowHeads: [idx, vals],
    rowStyles: ['index', 'label'],
    corner: [
      ['', 'b'],
      ['a', 'v'],
    ],
    links,
    roles,
  });
  const tShapes: Shape[] = shrinkInfinities(table.shapes, g.cy);
  for (const sh of tShapes) {
    const m = /^cell-(\d+)-(\d+)$/.exec(sh.id);
    if (m && Number(m[2]) < Number(m[1])) sh.opacity = 0.35;
  }
  const recursion = approachOf(settings) === 'naive';
  for (let a = 0; a < n; a++)
    for (let b = a; b < n; b++) {
      const k = shownK(a, b);
      // A merge of one pile has no split to show.
      if (k !== null && !(merge && a === b))
        tShapes.push({
          kind: 'text',
          id: `k-${a}-${b}`,
          x: g.left(b) + CELL_W - 3,
          y: g.top(a) + CELL_H - 4,
          text: `k${k + 1}`,
          size: CORNER,
          anchor: 'end',
          mono: true,
          cls: 'label',
        });
      const c = extra.calls?.[a]?.[b] ?? 0;
      if (recursion && c > 0)
        tShapes.push({
          kind: 'text',
          id: `calls-${a}-${b}`,
          x: g.left(b) + CELL_W - 3,
          y: g.top(a) + CORNER,
          text: callsLabel(c),
          size: CORNER,
          anchor: 'end',
          mono: true,
          cls: 'label',
        });
    }

  // The row of items, in its own frame: item i centered at x(i), top at 0.
  const x = (i: number) => STRIP_LABEL + (i + 1.5) * PITCH;
  const strip: Shape[] = [];
  const span = extra.span;
  const k = extra.k;
  const groups: Span[] = extra.left ?? state.v.map((_, i) => ({ a: i, b: i }));
  const roleOf = (gr: Span): MarkRole | undefined => {
    const id = itemId(gr.a);
    if (roles.has(id)) return roles.get(id);
    if (!span) return undefined;
    if (k !== undefined && gr.a === gr.b) {
      if (!merge && gr.a === k) return 'active';
      if (merge && gr.a >= span.a && gr.b <= span.b) return gr.b <= k ? 'visit' : 'compare';
    }
    if (gr.a >= span.a && gr.b <= span.b) return 'visit';
    if (!merge && (gr.a === span.a - 1 || gr.a === span.b + 1)) return 'compare';
    return undefined;
  };
  for (const gr of groups) {
    const left = x(gr.a) - BOX / 2;
    const w = (gr.b - gr.a) * PITCH + BOX;
    const role = roleOf(gr);
    const id = itemId(gr.a);
    strip.push({ kind: 'rect', id, x: left, y: 0, w, h: BOX_H, r: 6, cls: 'cell live', role });
    strip.push({
      kind: 'text',
      id: `${id}-t`,
      x: left + w / 2,
      y: BOX_H / 2 + 8,
      text: String(merge ? sumOf(state.v, gr.a, gr.b) : state.v[gr.a]),
      size: 22,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role,
    });
  }
  if (!merge)
    for (const [i, id] of [
      [-1, 'post-l'],
      [n, 'post-r'],
    ] as const) {
      const role: MarkRole | undefined =
        span && (i === span.a - 1 || i === span.b + 1) ? 'compare' : undefined;
      strip.push({
        kind: 'text',
        id,
        x: x(i),
        y: BOX_H / 2 + 8,
        text: '1',
        size: 22,
        anchor: 'middle',
        mono: true,
        cls: role ? undefined : 'label',
        role,
      });
    }
  strip.push({
    kind: 'text',
    id: 'strip-label',
    x: STRIP_LABEL - 4,
    y: BOX_H / 2 + 6,
    text: merge ? 'piles' : 'tiles',
    size: 15,
    anchor: 'end',
    mono: true,
    cls: 'label',
  });
  // Item numbers under the row.
  state.v.forEach((_, i) =>
    strip.push({
      kind: 'text',
      id: `item-no-${i}`,
      x: x(i),
      y: BOX_H + 18,
      text: String(i + 1),
      size: 14,
      anchor: 'middle',
      mono: true,
      cls: 'index',
    }),
  );
  const sw = x(n) + PITCH / 2 + 4;
  const sh = BOX_H + 26;

  const tLeft = g.gridLeft - 70 - 10;
  const tw = g.gridRight + 10 - tLeft;
  const th = table.bounds.h;
  type Option = { bounds: Bounds; t: { x: number; y: number }; s: { x: number; y: number } };
  const options: Option[] = [
    {
      // The row to the right of the table, level with the middle of the grid.
      bounds: { x: 0, y: 0, w: tw + GAP + sw, h: th },
      t: { x: -tLeft, y: 0 },
      s: { x: tw + GAP, y: (g.gridTop + g.gridBottom) / 2 - sh / 2 },
    },
    {
      // The row under the table.
      bounds: { x: 0, y: 0, w: Math.max(tw, sw), h: th + sh + 6 },
      t: { x: (Math.max(tw, sw) - tw) / 2 - tLeft, y: 0 },
      s: { x: (Math.max(tw, sw) - sw) / 2, y: th },
    },
  ];
  const o = pickBest(options, stage);
  return {
    shapes: [...translate(tShapes, o.t.x, o.t.y), ...translate(strip, o.s.x, o.s.y)],
    bounds: o.bounds,
    label: label(step, settings),
  };
}

function label(step: Step<IVState, IVExtra>, settings: IVSettings): string {
  const parts = [describe(step.state, settings)];
  const left = step.extra?.left;
  if (left)
    parts.push(
      settings.problem === 'merge'
        ? `Piles now: ${left.map((g) => sumOf(step.state.v, g.a, g.b)).join(', ')}.`
        : `Tiles left: ${left.length ? left.map((g) => g.a + 1).join(', ') : 'none'}.`,
    );
  return parts.join(' ');
}
