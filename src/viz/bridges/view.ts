/**
 * Cut vertices and bridges: the graph, and beside or under it the open calls, a table of d and
 * low, the cut vertices found and the bridges found, and a key. Each discovered vertex carries
 * d/low. Tree edges are arrows from parent to child, back edges are dashed with a B, and edges
 * not explored yet are faint. Cut vertices are purple and bridges red, and both are listed in
 * their own rows, so color is not the only cue. A plain state (no run, as in practice pictures)
 * draws just the graph.
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
  vertexId,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  describe,
  describeRun,
  type BridgesExtra,
  type BridgesRun,
  type BridgesSettings,
  type BridgesState,
} from './model';

function look(r: BridgesRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.color[v] === 'gray') return 'frontier';
  return r.color[v] === 'black' ? 'done' : undefined;
}

export function view(
  step: Step<BridgesState, BridgesExtra>,
  settings: BridgesSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const roles = new Map<string, MarkRole>();
  if (r) {
    for (const v of r.cuts) roles.set(vertexId(v), 'found');
    for (const k of r.bridges) roles.set(edgeId(k), 'error');
  }
  for (const m of step.marks) roles.set(m.id, m.role);
  const layout = layoutGraph(g, settings.layout);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((key) => r.edges[key] ?? 'unexamined'),
    parent: (key) => {
      const [a, b] = key.split('-') as [string, string];
      return r?.pi[b] === a ? a : r?.pi[a] === b ? b : undefined;
    },
    note: r && ((v) => (r.d[v] === null ? undefined : `${r.d[v]}/${r.low[v]}`)),
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
        const labelW = 72;
        const perRow = 10;
        const rows = Math.max(1, Math.ceil(n / perRow));
        const rowW = labelW + Math.min(Math.max(n, 1), perRow) * 34;
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
        const roomC = { x, y: y0, w: rowW, h: rows * 46 - 2 };
        let y = below(unionBounds(calls, roomC), 12);
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
              key: 'low',
              label: 'low',
              cells: g.vertices.map((v) => ({ text: String(r.low[v] ?? '') })),
            },
          ],
          roles,
        });
        y = below(table, 12);
        const cuts = drawRow(out, {
          id: 'cut',
          label: 'cuts',
          labelW,
          cells: r.cuts.map((v) => ({ key: v, text: v, role: 'found' as MarkRole })),
          x,
          y,
          roles,
          perRow,
          cellW: 30,
          empty: 'none yet',
        });
        const roomK = { x, y, w: rowW, h: rows * 30 - 4 };
        y = below(unionBounds(cuts, roomK), 10);
        // At most V - 1 bridges (they form a forest); keep room for a row of them.
        const brW = Math.max(46, ...g.edges.map((e) => `${e.u}-${e.v}`.length * 8.2 + 12));
        const brPer = Math.max(1, Math.floor(320 / (brW + 4)));
        const bridges = drawRow(out, {
          id: 'br',
          label: 'bridges',
          labelW,
          cells: r.bridges.map((k) => ({ key: k, text: k, role: 'error' as MarkRole })),
          x,
          y,
          roles,
          perRow: brPer,
          cellW: brW,
          empty: 'none yet',
        });
        const most = Math.max(1, n - 1);
        const roomB = {
          x,
          y,
          w: labelW + Math.min(most, brPer) * (brW + 4),
          h: Math.ceil(most / brPer) * 34 - 8,
        };
        const width = Math.max(table.w, rowW, 300);
        const legend = drawLegend(out, {
          id: 'key',
          items: ['badge d/low', '→ tree edge', 'B back edge', 'cut vertex', 'bridge'],
          x,
          y: below(unionBounds(bridges, roomB), 10),
          maxW: width,
        });
        // The last two entries take the colors they name.
        for (const sh of out) {
          if (sh.id === 'key-3') sh.role = 'found';
          if (sh.id === 'key-4') sh.role = 'error';
        }
        return unionBounds(calls, roomC, table, cuts, roomK, bridges, roomB, legend);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
