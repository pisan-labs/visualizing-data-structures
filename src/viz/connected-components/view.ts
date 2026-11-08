/**
 * Connected components: the graph, with each component in its own color and its number in a
 * badge (#1, #2, ...), so the pieces read without color too. Beside or under it: the queue
 * (BFS) or the open VISIT calls (DFS), and a table of cc per vertex. Union-find shows the
 * parent p and rank of every vertex instead of a queue, and colors the sets as they merge.
 */
import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
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
  vertexId,
  type VertexLook,
  type GraphLayout,
} from '../../layouts/graph';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Graph } from '../_graph/graph';
import {
  describe,
  describeRun,
  rootOf,
  type CcExtra,
  type CcRun,
  type CcSettings,
  type CcState,
} from './model';

/** Component k (from 1) gets its own group color; the badge carries the number as well. */
export const colorOf = (k: number): MarkRole => groupRole(k);

/** Union-find: the sets of more than one vertex, numbered by their smallest vertex. */
function setNumbers(g: Graph, r: CcRun): Map<string, number> {
  const size = new Map<string, number>();
  for (const v of g.vertices) size.set(rootOf(r, v), (size.get(rootOf(r, v)) ?? 0) + 1);
  const out = new Map<string, number>();
  let k = 0;
  const seen = new Map<string, number>();
  for (const v of g.vertices) {
    const root = rootOf(r, v);
    if (size.get(root)! < 2) continue;
    if (!seen.has(root)) seen.set(root, ++k);
    out.set(v, seen.get(root)!);
  }
  return out;
}

function look(r: CcRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.method === 'bfs' && r.frontier.includes(v)) return 'frontier';
  if (r.method === 'dfs' && r.frontier.includes(v)) return 'frontier';
  return undefined;
}

export function view(step: Step<CcState, CcExtra>, settings: CcSettings, stage?: StageSize): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, settings, l, stage)),
  );
}

function draw(
  step: Step<CcState, CcExtra>,
  settings: CcSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const marks = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  // Component colors first; the step's marks and the current vertex win over them.
  const roles = new Map<string, MarkRole>();
  const uf = r?.method === 'union-find';
  const sets = r && uf && r.count === 0 ? setNumbers(g, r) : undefined;
  const number = (v: string): number | undefined =>
    r ? (r.cc[v] ?? (sets ? sets.get(v) : undefined)) : undefined;
  if (r) {
    for (const v of g.vertices) {
      const k = number(v);
      if (k !== undefined && v !== r.u) roles.set(vertexId(v), colorOf(k));
    }
  }
  for (const [id, role] of marks) roles.set(id, role);

  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((key) => r.edges[key] ?? (uf ? undefined : 'unexamined')),
    parent: (key) => {
      if (!r || uf) return undefined;
      const [a, b] = key.split('-') as [string, string];
      // The end labeled first is the one the search came from.
      return r.order.indexOf(a) < r.order.indexOf(b) ? a : b;
    },
    note: r && ((v) => (r.cc[v] ? `#${r.cc[v]}` : undefined)),
    pointers: r
      ? [
          ...(r.s && !uf ? [{ name: 's', at: r.s }] : []),
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
        const cc = {
          key: 'cc',
          label: 'cc',
          cells: g.vertices.map((v) => ({
            text: r.cc[v] ? String(r.cc[v]) : '–',
            role: r.cc[v] ? colorOf(r.cc[v]!) : undefined,
          })),
        };
        if (uf) {
          const table = drawTable(out, {
            id: 'tbl',
            x,
            y: y0,
            columns: g.vertices,
            head: 'v',
            rows: [
              { key: 'p', label: 'p', cells: g.vertices.map((v) => ({ text: r.p[v] ?? '–' })) },
              {
                key: 'rank',
                label: 'rank',
                cells: g.vertices.map((v) => ({ text: String(r.rank[v] ?? 0) })),
              },
              cc,
            ],
            roles,
          });
          const legend = drawLegend(out, {
            id: 'key',
            items: ['solid: joined two sets', 'dashed: same set already'],
            x,
            y: below(table, 10),
            maxW: Math.max(table.w, 260),
          });
          return unionBounds(table, legend);
        }
        const bfs = r.method === 'bfs';
        const row = drawRow(out, {
          id: 'q',
          label: bfs ? 'Q' : 'calls',
          labelW: bfs ? 44 : 62,
          cells: r.frontier.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow: 12,
          ends: bfs ? ['front', 'back'] : ['bottom', 'top'],
        });
        // Room for the longest the row can get, so nothing moves as it grows.
        const room = { x, y: y0, w: (bfs ? 44 : 62) + Math.min(n, 12) * 34, h: 40 };
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(unionBounds(row, room), 14),
          columns: g.vertices,
          head: 'v',
          rows: [cc],
          roles,
        });
        return unionBounds(row, room, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
