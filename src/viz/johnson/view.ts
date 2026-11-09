/**
 * Johnson: the graph (with the extra vertex q above it and its 0-weight arcs while Bellman-Ford
 * runs), each vertex's h in a badge, and once reweighted the arcs show w' instead of w. Under
 * or beside it: a table of h and the current Dijkstra's d', and the result matrix D, one row per
 * source, filled as each Dijkstra finishes. A negative cycle is drawn red. A plain state (no
 * run) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  below,
  drawGraph,
  drawTable,
  layoutGraph,
  layoutsFor,
  scaleLayout,
  padBounds,
  placePanels,
  unionBounds,
  VERTEX_R,
  weightId,
  type GraphLayout,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { keyOf, makeGraph } from '../_graph/graph';
import {
  describe,
  describeRun,
  fmt,
  qArcId,
  qId,
  type JohnsonExtra,
  type JohnsonRun,
  type JohnsonSettings,
  type JohnsonState,
} from './model';

export function view(
  step: Step<JohnsonState, JohnsonExtra>,
  settings: JohnsonSettings,
  stage?: StageSize,
): Scene {
  // A little roomier than the shared layout: every vertex carries an h note, and q's arcs need a
  // way between the vertices.
  const layout = scaleLayout(layoutGraph(step.state.graph, settings.layout), SPREAD);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, l, stage)),
  );
}

type Pt = { x: number; y: number };

const SPREAD = 1.25;

/** Where segments ab and cd cross, as the fraction along ab, or null. */
function crossAt(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}

/** A quadratic curve from a to b through control point c, as a polyline. */
function curvePts(a: Pt, b: Pt, c: Pt | undefined, n = 16): Pt[] {
  if (!c) return [a, b];
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const k = 1 - t;
    return {
      x: k * k * a.x + 2 * k * t * c.x + t * t * b.x,
      y: k * k * a.y + 2 * k * t * c.y + t * t * b.y,
    };
  });
}

/**
 * How far a q arc's control point may sit off the straight line, as fractions of the graph's
 * width (straight first). The curve's middle bows out half as far, so the last ones go round
 * the outside of the graph.
 */
const BOWS = [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.3, -1.3];

/**
 * The control point for the arc from q to p (none: straight) that crosses the least of the
 * drawing: vertices and notes it would run through, then edges and the arcs already placed.
 * Arcs to the far side of a dense graph would otherwise cut across the middle of it.
 */
function bestBow(q: Pt, p: Pt, width: number, drawn: Shape[], placed: Pt[][]): Pt | undefined {
  const target = p;
  // Each with what crossing it costs: an edge of the graph 3, another faint q arc 1.
  const segs: [Pt, Pt, number][] = [];
  for (const sh of drawn)
    if (sh.kind === 'arrow') {
      const pts = curvePts({ x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 }, sh.via, 8);
      for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i]!, pts[i + 1]!, 3]);
    }
  for (const line of placed)
    for (let i = 0; i + 1 < line.length; i++) segs.push([line[i]!, line[i + 1]!, 1]);
  const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
  const n = { x: -(p.y - q.y) / len, y: (p.x - q.x) / len };
  const mid = { x: (q.x + p.x) / 2, y: (q.y + p.y) / 2 };
  let best: { score: number; via: Pt | undefined } | null = null;
  for (const bow of BOWS) {
    const off = bow * width;
    const via = bow === 0 ? undefined : { x: mid.x + n.x * off, y: mid.y + n.y * off };
    const pts = curvePts(q, p, via);
    let score = 2 * Math.abs(bow);
    for (const sh of drawn) {
      // Running through a vertex is the worst; through a note (h beside a vertex) less so.
      if (sh.kind === 'circle' && (sh.x !== target.x || sh.y !== target.y)) {
        if (pts.some((c) => Math.hypot(c.x - sh.x, c.y - sh.y) < sh.r + 3)) score += 10;
      } else if (sh.kind === 'rect') {
        const inside = (c: Pt) =>
          c.x > sh.x - 3 && c.x < sh.x + sh.w + 3 && c.y > sh.y - 3 && c.y < sh.y + sh.h + 3;
        if (pts.some(inside)) score += 2;
      }
    }
    for (let i = 0; i + 1 < pts.length; i++)
      for (const [c, d, cost] of segs) {
        const t = crossAt(pts[i]!, pts[i + 1]!, c, d);
        if (t === null) continue;
        const x = pts[i]!.x + t * (pts[i + 1]!.x - pts[i]!.x);
        const y = pts[i]!.y + t * (pts[i + 1]!.y - pts[i]!.y);
        // Edges into the target itself meet the arc there anyway.
        if (Math.hypot(x - target.x, y - target.y) > VERTEX_R + 8) score += cost;
      }
    if (!best || score < best.score) best = { score, via };
  }
  return best!.via;
}

/** q above the graph, with a dashed arc to every vertex, bowed around the graph where needed. */
function drawQ(
  out: Shape[],
  layout: GraphLayout,
  vertices: string[],
  roles: ReadonlyMap<string, MarkRole>,
  drawn: Shape[],
): Bounds {
  const b = layout.bounds;
  const q = { x: b.x + b.w / 2, y: b.y - 64 };
  const placed: Pt[][] = [];
  const boxes: Bounds[] = [];
  // Nearest first: they have the fewest ways around.
  const order = [...vertices].sort(
    (u, v) =>
      Math.hypot(layout.pos[u]!.x - q.x, layout.pos[u]!.y - q.y) -
      Math.hypot(layout.pos[v]!.x - q.x, layout.pos[v]!.y - q.y),
  );
  for (const v of order) {
    const p = layout.pos[v]!;
    const via = bestBow(q, p, b.w, drawn, placed);
    // Trim both ends along the direction the curve leaves q and enters p.
    const from = via ?? p;
    const to = via ?? q;
    const d1 = Math.hypot(from.x - q.x, from.y - q.y) || 1;
    const d2 = Math.hypot(p.x - to.x, p.y - to.y) || 1;
    const a = {
      x: q.x + ((from.x - q.x) / d1) * (VERTEX_R + 1),
      y: q.y + ((from.y - q.y) / d1) * (VERTEX_R + 1),
    };
    const z = {
      x: p.x - ((p.x - to.x) / d2) * (VERTEX_R + 2),
      y: p.y - ((p.y - to.y) / d2) * (VERTEX_R + 2),
    };
    const line = curvePts(a, z, via);
    placed.push(line);
    for (const c of line) boxes.push({ x: c.x, y: c.y, w: 0, h: 0 });
    out.push({
      kind: 'arrow',
      id: qArcId(v),
      x1: a.x,
      y1: a.y,
      x2: z.x,
      y2: z.y,
      ...(via ? { via } : {}),
      dashed: true,
      opacity: 0.4,
      role: roles.get(qArcId(v)),
    });
  }
  out.push({
    kind: 'circle',
    id: qId,
    x: q.x,
    y: q.y,
    r: VERTEX_R,
    cls: 'live',
    role: roles.get(qId),
  });
  out.push({
    kind: 'text',
    id: `${qId}-t`,
    x: q.x,
    y: q.y + 6,
    text: 'q',
    size: 16,
    anchor: 'middle',
    weight: 'bold',
  });
  out.push({
    kind: 'text',
    id: `${qId}-w`,
    x: q.x + VERTEX_R + 6,
    y: q.y - 8,
    text: 'w=0',
    size: 13,
    cls: 'label',
  });
  return unionBounds(
    { x: q.x - VERTEX_R, y: q.y - VERTEX_R - 14, w: 2 * VERTEX_R + 50, h: 2 * VERTEX_R + 14 },
    ...boxes,
  );
}

function draw(
  step: Step<JohnsonState, JohnsonExtra>,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r: JohnsonRun | undefined = extra.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  if (r?.cycle) for (const v of r.cycle) roles.set(`vx-${v}`, 'error');
  // Reweighted arcs show w'.
  const shown = r
    ? makeGraph({ ...g, edges: g.edges.map((e) => ({ ...e, w: r.w2[keyOf(e)] ?? e.w })) })
    : g;
  const showQ = r && (r.phase === 'q' || r.phase === 'bf' || r.phase === 'negative');
  const drawn = drawGraph(shown, layout, {
    roles,
    vertex: r && ((v) => (v === r.u ? 'current' : r.settled?.includes(v) ? 'done' : undefined)),
    note:
      r && r.phase !== 'q' ? (v) => (r.h[v] === null ? undefined : `h=${fmt(r.h[v])}`) : undefined,
    pointers: r?.s ? [{ name: 's', at: r.s }] : [],
  });
  // Weights through the page's one number format (−4, not -4).
  const weightText = new Map(shown.edges.map((e) => [weightId(keyOf(e)), fmt(e.w)]));
  for (const sh of drawn.shapes) {
    const t = weightText.get(sh.id);
    if (sh.kind === 'text' && t !== undefined) sh.text = t;
  }
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [drawn.bounds];
  if (showQ) boxes.push(drawQ(shapes, layout, g.vertices, roles, drawn.shapes));
  shapes.push(...drawn.shapes);
  if (r) {
    const graphBox = unionBounds(...boxes);
    boxes.push(
      placePanels(shapes, graphBox, stage, (out, x, y) => {
        const top = drawTable(out, {
          id: 'tbl',
          x,
          y,
          columns: g.vertices,
          head: 'v',
          rows: [
            { key: 'hv', label: 'h', cells: g.vertices.map((v) => ({ text: fmt(r.h[v]) })) },
            {
              key: 'd',
              label: r.s ? `d'(${r.s})` : "d'",
              cells: g.vertices.map((v) => ({
                text: r.d2 && (r.settled?.includes(v) || r.u === undefined) ? fmt(r.d2[v]) : '',
              })),
            },
          ],
          roles,
          perRow: 8,
        });
        const matrix = drawTable(out, {
          id: 'D',
          x,
          y: below(top, 14),
          columns: g.vertices,
          head: 'D',
          rows: g.vertices.map((s) => ({
            key: `r${s}`,
            label: s,
            cells: g.vertices.map((t) => ({ text: r.D[s] ? fmt(r.D[s]![t]) : '' })),
          })),
          roles,
          perRow: 8,
        });
        return unionBounds(top, matrix);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
