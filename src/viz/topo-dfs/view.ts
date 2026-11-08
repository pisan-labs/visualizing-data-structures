/**
 * Topological sort by DFS: the graph, and beside or under it the open DFS-VISIT calls, the list
 * L (front first, growing at the front), a table of d and f, and a key. As in the DFS page, gray
 * vertices wear a dashed ring, u is the vertex being explored, finished vertices are green and
 * carry d/f, tree edges become arrows, and edges not explored yet are faint. A cycle that stops
 * the sort is drawn in red. A plain state (no run, as in practice pictures) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  below,
  drawGraph,
  drawLegend,
  drawRow,
  drawTable,
  layoutGraph,
  layoutsFor,
  padBounds,
  placePanels,
  unionBounds,
  type VertexLook,
  type GraphLayout,
} from '../../layouts/graph';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  cycleEdges,
  describe,
  describeRun,
  type TopoExtra,
  type TopoRun,
  type TopoSettings,
  type TopoState,
} from './model';

function look(r: TopoRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.color[v] === 'gray') return 'frontier';
  return r.color[v] === 'black' ? 'done' : undefined;
}

export function view(
  step: Step<TopoState, TopoExtra>,
  settings: TopoSettings,
  stage?: StageSize,
): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, settings, l, stage)),
  );
}

function draw(
  step: Step<TopoState, TopoExtra>,
  settings: TopoSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  // Once the search has stopped at a cycle, the cycle stays red.
  if (r?.stopped && r.cycle) {
    for (const v of r.cycle) if (!roles.has(`vx-${v}`)) roles.set(`vx-${v}`, 'error');
    for (const k of cycleEdges(r.cycle)) if (!roles.has(`e-${k}`)) roles.set(`e-${k}`, 'error');
  }
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((key) => r.edges[key] ?? 'unexamined'),
    parent: (key) => {
      const [a, b] = key.split('-') as [string, string];
      return r?.pi[b] === a ? a : undefined;
    },
    note: r && ((v) => (r.d[v] === null ? undefined : `${r.d[v]}/${r.f[v] ?? ''}`)),
    pointers: r
      ? [
          ...(r.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
          ...(r.v ? [{ name: 'v', at: r.v }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const n = g.vertices.length;
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const labelW = 62;
        const perRow = 10;
        const calls = drawRow(out, {
          id: 'cs',
          label: 'calls',
          labelW,
          cells: r.calls.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow,
          cellW: 30,
          ends: ['bottom', 'top'],
        });
        const rows = Math.max(1, Math.ceil(n / perRow));
        const rowW = labelW + Math.min(Math.max(n, 1), perRow) * 34;
        const roomC = { x, y: y0, w: rowW, h: rows * 46 - 2 };
        let y = below(unionBounds(calls, roomC), 12);
        const list = drawRow(out, {
          id: 'L',
          label: 'L',
          labelW,
          cells: r.order.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y,
          roles,
          perRow,
          cellW: 30,
          empty: 'empty: vertices go on the front as they finish',
          ends: ['front', 'back'],
        });
        const roomL = { x, y, w: rowW, h: rows * 46 - 2 };
        y = below(unionBounds(list, roomL), 12);
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y,
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'd',
              label: 'd',
              cells: g.vertices.map((v) => ({ text: String(r.d[v] ?? '') })),
            },
            {
              key: 'f',
              label: 'f',
              cells: g.vertices.map((v) => ({ text: String(r.f[v] ?? '') })),
            },
          ],
          roles,
        });
        const width = Math.max(table.w, rowW, 300);
        const legend = drawLegend(out, {
          id: 'key',
          items: ['→ tree edge', 'B back edge (a cycle)', 'F forward', 'C cross'],
          x,
          y: below(table, 10),
          maxW: width,
        });
        return unionBounds(calls, roomC, list, roomL, table, legend);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
