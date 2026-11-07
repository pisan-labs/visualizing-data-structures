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
  const shapes: Shape[] = [...faint, ...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y) => {
        const box = panels(out, g, r, layout, roles, x, y, false);
        const room = panels([], g, r, layout, roles, x, y, true);
        return unionBounds(box, room);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
