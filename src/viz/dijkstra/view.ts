/**
 * Dijkstra: the graph, and under or beside it (whichever reads better) one row with the settled
 * set S (in the order vertices joined it, with their final d) and the priority queue Q (each
 * entry with its key, smallest first), split by a bar, and under it a table of d and π.
 *
 * During a run, settled vertices are green with a thick outline, in the graph and in S; vertices
 * with a finite key still in Q wear a dashed ring; the vertex being relaxed is marked u, and
 * each reached vertex carries its d. The current π edges are arrows from parent to child (the
 * shortest-path tree so far), edges RELAX looked at but did not keep are dashed, and the rest
 * are faint. At the end only the tree stays solid. Stale entries of the lazy queue are faded.
 * A plain state (no run, as in practice pictures) draws just the graph.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  below,
  drawGraph,
  layoutGraph,
  padBounds,
  placePanels,
  unionBounds,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { edgeKey } from '../_graph/graph';
import { dist } from '../_paths/kit';
import { distTable, drawSplit, keyedCellWidth } from '../_paths/view';
import {
  describe,
  describeRun,
  isStale,
  type DijkstraExtra,
  type DijkstraRun,
  type DijkstraSettings,
  type DijkstraState,
} from './model';

function look(
  r: DijkstraRun,
  v: string,
  settled: Set<string>,
  open: Set<string>,
): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (settled.has(v)) return 'done';
  return open.has(v) ? 'frontier' : undefined;
}

/** A width for queue cells that fits any key this graph can produce, so cells never jump. */
function queueCellWidth(g: DijkstraState['graph']): number {
  const ws = g.edges.map((e) => Math.abs(e.w)).sort((a, b) => b - a);
  const most = ws.slice(0, Math.max(0, g.vertices.length - 1)).reduce((a, b) => a + b, 0);
  return keyedCellWidth([
    ...g.vertices.map((v) => ({ name: v, value: '∞' })),
    { name: '', value: String(most) },
  ]);
}

export function view(step: Step<DijkstraState, DijkstraExtra>, settings: DijkstraSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  // The current π edges, by edge key, with the end each was found from.
  const tree = new Map<string, string>();
  if (r) for (const v of g.vertices) if (r.pi[v]) tree.set(edgeKey(g, r.pi[v]!, v), r.pi[v]!);
  const settled = new Set(r?.S.filter((v) => r.d[v] !== null) ?? []);
  const open = new Set(r?.Q.filter((q) => q.k !== null && !isStale(r, q)).map((q) => q.v) ?? []);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v, settled, open)),
    edge:
      r && ((key) => (tree.has(key) ? 'tree' : !r.final && r.relaxed[key] ? 'seen' : 'unexamined')),
    parent: (key) => tree.get(key),
    note: r && ((v) => (r.d[v] === null ? undefined : `d=${r.d[v]}`)),
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
    boxes.push(
      placePanels(shapes, drawn.bounds, (out, x, y0) => {
        const split = drawSplit(out, {
          id: 'pq',
          x,
          y: y0,
          settled: r.S.map((v) => ({
            key: v,
            name: v,
            value: dist(r.d[v]),
            role: r.d[v] === null ? undefined : 'done',
            dim: r.d[v] === null,
            from: layout.pos[v],
          })),
          queue: r.Q.map((q) => ({
            key: q.uid,
            name: q.v,
            value: dist(q.k),
            dim: isStale(r, q),
            from: layout.pos[q.v],
          })),
          roles,
          cellW: queueCellWidth(g),
          room: r.room,
        });
        const table = distTable(out, {
          id: 'tbl',
          x,
          y: below(split, 14),
          vertices: g.vertices,
          d: r.d,
          pi: r.pi,
          roles,
          final: (v) => settled.has(v),
        });
        return unionBounds(split, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
