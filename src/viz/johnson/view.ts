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
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, l, stage)),
  );
}

/** q above the graph, with a dashed arc to every vertex. */
function drawQ(
  out: Shape[],
  layout: GraphLayout,
  vertices: string[],
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const b = layout.bounds;
  const q = { x: b.x + b.w / 2, y: b.y - 64 };
  for (const v of vertices) {
    const p = layout.pos[v]!;
    const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
    const ux = (p.x - q.x) / d;
    const uy = (p.y - q.y) / d;
    out.push({
      kind: 'arrow',
      id: qArcId(v),
      x1: q.x + ux * (VERTEX_R + 1),
      y1: q.y + uy * (VERTEX_R + 1),
      x2: p.x - ux * (VERTEX_R + 2),
      y2: p.y - uy * (VERTEX_R + 2),
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
  return { x: q.x - VERTEX_R, y: q.y - VERTEX_R - 14, w: 2 * VERTEX_R + 50, h: 2 * VERTEX_R + 14 };
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
  if (showQ) boxes.push(drawQ(shapes, layout, g.vertices, roles));
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
