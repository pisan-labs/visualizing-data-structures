/**
 * Prim: the graph, and under or beside it one row with the tree T (vertices in the order they
 * joined, each with the key it joined at) and the priority queue Q (each entry with its key,
 * smallest first), split by a bar, and under that a table of key and π.
 *
 * During a run, vertices in the tree are green with a thick outline; vertices in Q with a
 * finite key wear a dashed ring; the vertex being added is marked u, and each vertex with a
 * finite key carries it. The current π edges are arrows from parent to child (the tree so far,
 * and the lightest known edge into each waiting vertex), edges looked at and not kept are
 * dashed, and the rest are faint. At the end only the tree stays solid. Stale entries of the
 * lazy queue are faded. A plain state (no run) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  below,
  drawGraph,
  drawTable,
  layoutGraph,
  padBounds,
  placePanels,
  unionBounds,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { edgeKey, type Graph } from '../_graph/graph';
import { drawSplit, keyedCellWidth } from '../_paths/view';
import {
  describe,
  describeRun,
  isStale,
  type PrimExtra,
  type PrimRun,
  type PrimSettings,
  type PrimState,
} from './model';

const keyText = (k: number | null | undefined) => (k === null || k === undefined ? '∞' : String(k));

function look(
  r: PrimRun,
  v: string,
  inTree: Set<string>,
  open: Set<string>,
): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (inTree.has(v)) return 'done';
  return open.has(v) ? 'frontier' : undefined;
}

/** A width for queue cells that fits any key of this graph, so cells never jump. */
function cellWidth(g: Graph): number {
  return keyedCellWidth([
    ...g.vertices.map((v) => ({ name: v, value: '∞' })),
    ...g.edges.map((e) => ({ name: '', value: String(e.w) })),
  ]);
}

export function view(
  step: Step<PrimState, PrimExtra>,
  settings: PrimSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  const tree = new Map<string, string>();
  const inTree = new Set(r?.T ?? []);
  if (r)
    for (const v of g.vertices) {
      const p = r.pi[v];
      // At the end only the tree; during the run also the best known edge into each vertex.
      if (p && (inTree.has(v) || !r.final)) tree.set(edgeKey(g, p, v), p);
    }
  const open = new Set(r?.Q.filter((q) => q.k !== null && !isStale(r, q)).map((q) => q.v) ?? []);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v, inTree, open)),
    edge:
      r && ((key) => (tree.has(key) ? 'tree' : !r.final && r.seen[key] ? 'seen' : 'unexamined')),
    parent: (key) => tree.get(key),
    note: r && ((v) => (r.key[v] === null || inTree.has(v) ? undefined : `k=${r.key[v]}`)),
    pointers: r
      ? [
          ...r.roots.map((x, i) => ({ name: i === 0 ? 'r' : `r${i + 1}`, at: x })),
          ...(r.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
          ...(r.v ? [{ name: 'v', at: r.v }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const split = drawSplit(out, {
          id: 'pq',
          x,
          y: y0,
          settled: r.T.map((v) => ({
            key: v,
            name: v,
            value: r.pi[v] ? keyText(r.key[v]) : 'root',
            role: 'done',
            from: layout.pos[v],
          })),
          queue: r.Q.map((q) => ({
            key: q.uid,
            name: q.v,
            value: keyText(q.k),
            dim: isStale(r, q),
            from: layout.pos[q.v],
          })),
          roles,
          cellW: Math.max(cellWidth(g), keyedCellWidth([{ name: '', value: 'root' }])),
          room: r.room,
        });
        // The tree is T here, not S.
        for (const sh of out) if (sh.id === 'pq-s' && sh.kind === 'text') sh.text = 'T';
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(split, 14),
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'key',
              label: 'key',
              cells: g.vertices.map((v) => ({
                text: keyText(r.key[v]),
                role: inTree.has(v) ? ('done' as const) : undefined,
              })),
            },
            { key: 'pi', label: 'π', cells: g.vertices.map((v) => ({ text: r.pi[v] ?? '–' })) },
          ],
          roles,
          perRow: 10,
        });
        return unionBounds(split, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
