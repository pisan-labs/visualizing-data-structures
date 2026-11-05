/**
 * DAG shortest paths: the graph, and under or beside it (whichever reads better) the list L of
 * finished vertices (front first, which ends up as the topological order) and a table of d and
 * π.
 *
 * While the depth-first search sorts, vertices it is inside of have a teal outline, finished
 * ones are green and join the front of L. While relaxing, the vertex whose edges are relaxed is
 * marked u (and blue in L), vertices already done are green, reached vertices carry their d,
 * the current π edges are arrows from parent to child and edges RELAX did not keep are dashed.
 * At the end only the tree stays solid. A cycle that stops the sort is drawn in red. A plain
 * state draws just the graph.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  below,
  drawGraph,
  drawRow,
  layoutGraph,
  padBounds,
  placePanels,
  unionBounds,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { edgeKey } from '../_graph/graph';
import { distTable } from '../_paths/view';
import {
  describe,
  describeRun,
  type DagExtra,
  type DagRun,
  type DagSettings,
  type DagState,
} from './model';

function look(r: DagRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.phase === 'sort' || r.phase === 'cycle') {
    if (r.color[v] === 'black') return 'done';
    return r.color[v] === 'gray' ? 'visited' : undefined;
  }
  const at = r.order.indexOf(v);
  if (r.d[v] === null) return undefined;
  return r.phase === 'done' || at < r.k ? 'done' : 'visited';
}

export function view(step: Step<DagState, DagExtra>, settings: DagSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  const relaxing = r && (r.phase === 'relax' || r.phase === 'done');
  // The current π edges, by edge key, with the end each was found from.
  const tree = new Map<string, string>();
  if (r) for (const v of g.vertices) if (r.pi[v]) tree.set(edgeKey(g, r.pi[v]!, v), r.pi[v]!);
  // The edges of a cycle that stopped the sort are drawn in full.
  const onCycle = new Set(
    r?.cycle?.map((x, k) => edgeKey(g, x, r.cycle![(k + 1) % r.cycle!.length]!)) ?? [],
  );
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge:
      r &&
      ((key) =>
        tree.has(key)
          ? 'tree'
          : onCycle.has(key)
            ? undefined
            : r.phase === 'relax' && r.relaxed[key]
              ? 'seen'
              : 'unexamined'),
    parent: (key) => tree.get(key),
    note: relaxing ? (v) => (r.d[v] === null ? undefined : `d=${r.d[v]}`) : undefined,
    pointers: r
      ? [
          { name: 's', at: r.s },
          ...(r.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
          ...(r.v ? [{ name: 'v', at: r.v }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const n = g.vertices.length;
    const perRow = 10;
    boxes.push(
      placePanels(shapes, drawn.bounds, (out, x, y0) => {
        const list = drawRow(out, {
          id: 'L',
          label: 'L',
          labelW: 30,
          cells: r.order.map((v, i) => ({
            key: v,
            text: v,
            from: layout.pos[v],
            role: relaxing && (r.phase === 'done' || i < r.k) ? ('done' as const) : undefined,
            // Faded once its turn has come and gone at ∞: s cannot reach it.
            dim: relaxing && r.d[v] === null && (r.phase === 'done' || i <= r.k),
          })),
          x,
          y: y0,
          roles,
          perRow,
          ends: ['front', 'back'],
          empty: 'empty: nothing has finished yet',
        });
        // Room for every vertex, so the table below does not move as L grows.
        const lines = Math.ceil(n / perRow);
        const room = { x, y: y0, w: 30 + Math.min(n, perRow) * 34 - 4, h: lines * 46 - 2 };
        const table = distTable(out, {
          id: 'tbl',
          x,
          y: below(unionBounds(list, room), 14),
          vertices: g.vertices,
          d: r.d,
          pi: r.pi,
          roles,
          neg: r.longest,
          final: (v) =>
            relaxing === true &&
            r.d[v] !== null &&
            (r.phase === 'done' || r.order.indexOf(v) <= r.k),
        });
        return unionBounds(list, room, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
