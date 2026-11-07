/**
 * Bipartite check: the graph with side 0 in teal and side 1 in amber, each vertex's side in a
 * badge (so the sides read without color too), tree edges as arrows from the vertex that gave
 * the side, and, when the check fails, the odd cycle in red. Beside or under it: the queue
 * (BFS) or the open VISIT calls (DFS), and a table of side and π per vertex.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  below,
  drawGraph,
  drawLegend,
  drawRow,
  drawTable,
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
  type BipExtra,
  type BipRun,
  type BipSettings,
  type BipState,
} from './model';

export const SIDE_ROLE: [MarkRole, MarkRole] = ['visit', 'compare'];

function look(r: BipRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.frontier.includes(v)) return 'frontier';
  return undefined;
}

export function view(
  step: Step<BipState, BipExtra>,
  settings: BipSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  // Side colors first; the step's marks and the current vertex win over them.
  const roles = new Map<string, MarkRole>();
  if (r) {
    for (const v of g.vertices) {
      const k = r.side[v];
      if (k !== null && k !== undefined && v !== r.u) roles.set(vertexId(v), SIDE_ROLE[k]);
    }
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
    note: r && ((v) => (r.side[v] === null ? undefined : String(r.side[v]))),
    pointers: r
      ? [
          ...(r.s ? [{ name: 's', at: r.s }] : []),
          ...(r.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
          ...(r.v ? [{ name: 'v', at: r.v }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const n = g.vertices.length;
    const bfs = r.method === 'bfs';
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const labelW = bfs ? 44 : 62;
        const row = drawRow(out, {
          id: 'q',
          label: bfs ? 'Q' : 'calls',
          labelW,
          cells: r.frontier.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow: 12,
          ends: bfs ? ['front', 'back'] : ['bottom', 'top'],
        });
        // Room for the longest the row can get, so nothing moves as it grows.
        const room = { x, y: y0, w: labelW + Math.min(n, 12) * 34, h: 40 };
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(unionBounds(row, room), 14),
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'side',
              label: 'side',
              cells: g.vertices.map((v) => ({
                text: r.side[v] === null ? '–' : String(r.side[v]),
                role: r.side[v] === null ? undefined : SIDE_ROLE[r.side[v]!],
              })),
            },
            { key: 'pi', label: 'π', cells: g.vertices.map((v) => ({ text: r.pi[v] ?? '–' })) },
          ],
          roles,
        });
        const legend = drawLegend(out, {
          id: 'key',
          items: ['badge: the side, 0 or 1', 'red: an odd cycle'],
          x,
          y: below(table, 10),
          maxW: Math.max(table.w, 240),
        });
        return unionBounds(row, room, table, legend);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
