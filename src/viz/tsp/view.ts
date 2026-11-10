/**
 * TSP: the cities where their coordinates put them (or on a circle for graph text), every
 * possible edge as a faint line, and the edges that matter now drawn solid with their lengths:
 * the tour or path so far as arrows in the direction of travel, the spanning tree, and the two
 * edges 2-opt would swap in (dashed). Under or beside it: Held-Karp's table for a few cities,
 * the walk around the tree with the repeats faded, the tour, and its length against the optimum.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  below,
  drawGraph,
  drawLegend,
  drawRow,
  drawTable,
  edgeId,
  layoutGraph,
  padBounds,
  placePanels,
  unionBounds,
  VERTEX_R,
  type EdgeLook,
  type GraphLayout,
  type PanelCell,
  type VertexLook,
} from '../../layouts/graph';
import { textWidth } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ratioText } from '../_approx/kit';
import { edgeKey, type Graph } from '../_graph/graph';
import type { Points } from './cities';
import {
  describe,
  describeRun,
  type TspExtra,
  type TspRun,
  type TspSettings,
  type TspState,
} from './model';

/** Scene units for the longer side of the cities' box. */
const SPAN = 320;

const layouts = new WeakMap<Points, GraphLayout>();

function pointLayout(pts: Points): GraphLayout {
  const hit = layouts.get(pts);
  if (hit) return hit;
  const names = Object.keys(pts);
  const xs = names.map((n) => pts[n]!.x);
  const ys = names.map((n) => pts[n]!.y);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const span = Math.max(Math.max(...xs) - x0, y1 - Math.min(...ys), 1);
  const k = SPAN / span;
  const pos = Object.fromEntries(
    names.map((n) => [n, { x: (pts[n]!.x - x0) * k, y: (y1 - pts[n]!.y) * k }]),
  );
  const px = Object.values(pos).map((p) => p.x);
  const py = Object.values(pos).map((p) => p.y);
  const bx = Math.min(...px) - VERTEX_R;
  const by = Math.min(...py) - VERTEX_R;
  const layout: GraphLayout = {
    pos,
    r: VERTEX_R,
    bounds: {
      x: bx,
      y: by,
      w: Math.max(...px) + VERTEX_R - bx,
      h: Math.max(...py) + VERTEX_R - by,
    },
  };
  layouts.set(pts, layout);
  return layout;
}

export const layoutOf = (s: TspState): GraphLayout =>
  s.pts ? pointLayout(s.pts) : layoutGraph(s.graph, 'circle');

interface Look {
  look: EdgeLook;
  parent?: string;
}

/** The edges drawn solid, by key, with how they look. */
function solidEdges(g: Graph, r: TspRun): Map<string, Look> {
  const out = new Map<string, Look>();
  const t = r.tour;
  const hops: [string, string][] = t.slice(1).map((v, i) => [t[i]!, v]);
  if (r.closed && t.length > 2) hops.push([t.at(-1)!, t[0]!]);
  if (r.closed && t.length === 2) hops.push([t[0]!, t[1]!]);
  if (r.tree && !r.final)
    for (const e of r.tree)
      out.set(edgeKey(g, e.parent, e.child), {
        look: r.walk ? 'seen' : 'tree',
        parent: e.parent,
      });
  if (r.pair) {
    const [a, b, c, d] = r.pair;
    out.set(edgeKey(g, a, c), { look: 'seen' });
    out.set(edgeKey(g, b, d), { look: 'seen' });
  }
  for (const [u, v] of hops) out.set(edgeKey(g, u, v), { look: 'tree', parent: u });
  return out;
}

function look(r: TspRun, v: string): VertexLook | undefined {
  if (v === r.at) return 'current';
  if (r.tour.includes(v)) return r.closed ? 'done' : 'visited';
  return undefined;
}

function panels(
  out: Shape[],
  g: Graph,
  r: TspRun,
  layout: GraphLayout,
  roles: ReadonlyMap<string, MarkRole>,
  x: number,
  y: number,
  full: boolean,
): Bounds {
  const boxes: Bounds[] = [];
  let at = y;
  const n = g.vertices.length;
  if (r.table) {
    const t = r.table;
    const b = drawTable(out, {
      id: 'hk',
      x,
      y: at,
      columns: t.cols,
      head: 'S',
      rows: t.rows.map((row) => ({
        key: row,
        label: row,
        cells: t.cols.map((c) => ({ text: t.cells[`${row}|${c}`] ?? '' })),
      })),
      roles,
      perRow: 8,
    });
    boxes.push(b);
    at = below(b, 12);
  }
  const labelW = 52;
  if (r.walk) {
    const walk = full ? Array.from({ length: 2 * n - 1 }, () => 'WW') : r.walk;
    const seen = new Set<string>();
    const cells: PanelCell[] = walk.map((v, i) => {
      const again = seen.has(v);
      seen.add(v);
      return { key: `w${i}`, text: v, dim: again, from: layout.pos[v] };
    });
    const b = drawRow(out, {
      id: 'walk',
      label: 'walk',
      cells,
      x,
      y: at,
      roles,
      perRow: 9,
      labelW,
      cellW: 30,
    });
    boxes.push(b);
    at = below(b, 10);
  }
  const tour = full ? g.vertices : r.tour;
  const tb = drawRow(out, {
    id: 'tour',
    label: 'tour',
    cells: tour.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
    x,
    y: at,
    roles,
    perRow: 9,
    labelW,
    cellW: 30,
    empty: 'none yet',
  });
  boxes.push(tb);
  at = below(tb, 10);
  const items = [
    `length ${r.tour.length ? r.cost : '–'}${r.closed ? '' : ' so far'}`,
    `optimum ${r.opt}`,
    `ratio ${r.closed ? ratioText(r.cost, r.opt) : '–'}`,
  ];
  if (r.method === 'mst' && r.tree)
    items.push(`2 × MST = ${2 * r.tree.reduce((a, e) => a + e.w, 0)}`);
  if (full) items.push('2 × MST = 888');
  boxes.push(drawLegend(out, { id: 'sum', items, x, y: at, maxW: 300 }));
  return unionBounds(...boxes);
}

// ----- Weights clear of the arrowheads -----
// drawGraph places each weight beside the middle of its edge without knowing about arrowheads.
// The tour's heads are big (7 stroke widths of 4, src/ui/Shapes.svelte), so on a short edge
// the head covers the middle and its weight. Such a weight moves along its edge, or further
// out from it, to the nearest spot clear of heads, vertices, lines and the other weights.

type Pt = { x: number; y: number };

const HEAD = 7 * 4;
const ALONG = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
const OUT = [11, 18, 25];

/** The head at an arrow's end: the tip a tenth of the head past the line's end. */
function headOf(a: { x1: number; y1: number; x2: number; y2: number }): Pt[] {
  const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
  const [ux, uy] = [(a.x2 - a.x1) / len, (a.y2 - a.y1) / len];
  const [bx, by] = [a.x2 - ux * HEAD * 0.9, a.y2 - uy * HEAD * 0.9];
  const half = HEAD / 2;
  return [
    { x: a.x2 + ux * HEAD * 0.1, y: a.y2 + uy * HEAD * 0.1 },
    { x: bx - uy * half, y: by + ux * half },
    { x: bx + uy * half, y: by - ux * half },
  ];
}

/** Whether two convex polygons (a segment counts) overlap: no edge normal separates them. */
function meet(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const [p, q] = [poly[i]!, poly[(i + 1) % poly.length]!];
      const n = { x: q.y - p.y, y: p.x - q.x };
      const sa = a.map((s) => s.x * n.x + s.y * n.y);
      const sb = b.map((s) => s.x * n.x + s.y * n.y);
      if (Math.max(...sa) <= Math.min(...sb) || Math.max(...sb) <= Math.min(...sa)) return false;
    }
  return true;
}

const corners = (b: Bounds): Pt[] => [
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y },
  { x: b.x + b.w, y: b.y + b.h },
  { x: b.x, y: b.y + b.h },
];

/** A weight's box around its spot (the text's baseline is 4.5 below the spot). */
function weightBox(at: Pt, text: string): Bounds {
  const w = textWidth(text, 13, false, true);
  return { x: at.x - w / 2, y: at.y - 6, w, h: 12 };
}

/** Whether a line drawn by drawGraph is (a piece of) the edge with this key. */
const own = (id: string, key: string) => id === edgeId(key) || id === `${edgeId(key)}-a`;

/** The distance from c to the segment [a, b]. */
function segDist(c: Pt, [a, b]: Pt[]): number {
  const [dx, dy] = [b!.x - a!.x, b!.y - a!.y];
  const t = Math.max(
    0,
    Math.min(1, ((c.x - a!.x) * dx + (c.y - a!.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(c.x - a!.x - t * dx, c.y - a!.y - t * dy);
}

function clearOfHeads(
  drawn: { shapes: Shape[]; bounds: Bounds },
  layout: GraphLayout,
): { shapes: Shape[]; bounds: Bounds } {
  const heads: Pt[][] = [];
  const lines: { id: string; pts: Pt[] }[] = [];
  for (const s of drawn.shapes) {
    if (s.kind !== 'arrow' || s.via) continue;
    lines.push({
      id: s.id,
      pts: [
        { x: s.x1, y: s.y1 },
        { x: s.x2, y: s.y2 },
      ],
    });
    if ((s.head ?? 'end') !== 'none') heads.push(headOf(s));
  }
  if (!heads.length) return drawn;
  const boxes = new Map<string, Bounds>();
  for (const s of drawn.shapes)
    if (s.kind === 'text' && s.id.startsWith('ew-'))
      boxes.set(s.id, weightBox({ x: s.x, y: s.y - 4.5 }, s.text));
  const onHead = (b: Bounds) => heads.some((h) => meet(corners(b), h));
  const clear = (b: Bounds, id: string, key: string) =>
    !onHead(b) &&
    Object.values(layout.pos).every(
      (c) =>
        Math.hypot(
          c.x - Math.max(b.x, Math.min(c.x, b.x + b.w)),
          c.y - Math.max(b.y, Math.min(c.y, b.y + b.h)),
        ) >=
        layout.r + 2,
    ) &&
    lines.every((l) => own(l.id, key) || !meet(corners(b), l.pts)) &&
    [...boxes].every(([other, o]) => other === id || !meet(corners(b), corners(o)));
  const out: Bounds[] = [drawn.bounds];
  const shapes = drawn.shapes.map((s): Shape => {
    if (s.kind !== 'text' || !boxes.has(s.id) || !onHead(boxes.get(s.id)!)) return s;
    const key = s.id.slice(3);
    const [u, v] = key.split('-') as [string, string];
    const [p, q] = [layout.pos[u]!, layout.pos[v]!];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const [nx, ny] = [-(q.y - p.y) / len, (q.x - p.x) / len];
    const now = { x: s.x, y: s.y - 4.5 };
    // Nearest the old spot, and nearer its own line than any other, or it reads as theirs.
    const cost = (c: Pt) =>
      Math.hypot(c.x - now.x, c.y - now.y) +
      (lines.some((l) => !own(l.id, key) && segDist(c, l.pts) < segDist(c, [p, q])) ? 100 : 0);
    let at: Pt | undefined;
    for (const t of ALONG)
      for (const d of OUT)
        for (const side of [1, -1]) {
          const c = {
            x: p.x + (q.x - p.x) * t + nx * d * side,
            y: p.y + (q.y - p.y) * t + ny * d * side,
          };
          if (clear(weightBox(c, s.text), s.id, key) && (!at || cost(c) < cost(at))) at = c;
        }
    if (!at) return s;
    const box = weightBox(at, s.text);
    boxes.set(s.id, box);
    out.push(box);
    return { ...s, x: at.x, y: at.y + 4.5 };
  });
  return { shapes, bounds: unionBounds(...out) };
}

export function view(
  step: Step<TspState, TspExtra>,
  _settings?: TspSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutOf(state);
  const solid = r ? solidEdges(g, r) : new Map<string, Look>();
  const sub: Graph = { ...g, edges: g.edges.filter((e) => solid.has(`${e.u}-${e.v}`)) };
  const drawn = drawGraph(sub, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: (key) => solid.get(key)?.look,
    parent: (key) => solid.get(key)?.parent,
    pointers: r?.at ? [{ name: 'u', at: r.at, role: 'active' }] : [],
  });
  const faint: Shape[] = [];
  for (const e of g.edges) {
    const key = `${e.u}-${e.v}`;
    if (solid.has(key)) continue;
    const p = layout.pos[e.u]!;
    const q = layout.pos[e.v]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    const cut = Math.min(VERTEX_R + 1, len / 2);
    faint.push({
      kind: 'arrow',
      id: edgeId(key),
      x1: p.x + ux * cut,
      y1: p.y + uy * cut,
      x2: q.x - ux * cut,
      y2: q.y - uy * cut,
      head: 'none',
      opacity: 0.18,
      role: roles.get(edgeId(key)),
    });
  }
  const graph = clearOfHeads(drawn, layout);
  const shapes: Shape[] = [...faint, ...graph.shapes];
  const boxes: Bounds[] = [graph.bounds];
  if (r) {
    boxes.push(
      placePanels(shapes, graph.bounds, stage, (out, x, y) => {
        const box = panels(out, g, r, layout, roles, x, y, false);
        const room = panels([], g, r, layout, roles, x, y, true);
        return unionBounds(box, room);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
