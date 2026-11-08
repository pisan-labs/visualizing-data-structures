/**
 * Bellman-Ford: the graph, and under or beside it (whichever reads better) the edge order every
 * pass follows, a table of how many distances each pass changed, and a table of d and π.
 *
 * In the order row, the edge being relaxed is blue, edges that lowered a d in this pass are
 * teal, and edges whose tail is still at ∞ are faded (they cannot help yet). In the graph, the
 * vertex whose edge is being relaxed is marked u, reached vertices carry their d, the current π
 * edges are arrows from parent to child, and edges RELAX has looked at but not kept are dashed.
 * When the run returns TRUE, the distances turn green and only the shortest-path tree stays
 * solid; when it finds a negative cycle, the cycle is drawn in red. A plain state draws just
 * the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  below,
  drawGraph,
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
import { edgeKey } from '../_graph/graph';
import { arcKey, arcs } from '../_paths/kit';
import { distTable } from '../_paths/view';
import {
  describe,
  describeRun,
  type BfExtra,
  type BfRun,
  type BfSettings,
  type BfState,
} from './model';

function look(r: BfRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.d[v] === null) return undefined;
  return r.result === 'true' ? 'done' : 'visited';
}

export function view(step: Step<BfState, BfExtra>, settings: BfSettings, stage?: StageSize): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, settings, l, stage)),
  );
}

function draw(
  step: Step<BfState, BfExtra>,
  settings: BfSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  // The current π edges, by edge key, with the end each was found from.
  const tree = new Map<string, string>();
  if (r) for (const v of g.vertices) if (r.pi[v]) tree.set(edgeKey(g, r.pi[v]!, v), r.pi[v]!);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge:
      r &&
      ((key) =>
        tree.has(key) ? 'tree' : r.result !== 'true' && r.relaxed[key] ? 'seen' : 'unexamined'),
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
    const n = g.vertices.length;
    const list = arcs(g);
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const order = drawRow(out, {
          id: 'ord',
          label: 'order',
          labelW: 58,
          cells: list.map((a, i) => ({
            key: arcKey(a.u, a.v),
            text: `${a.u}→${a.v}`,
            role: r.lowered[arcKey(a.u, a.v)] && i !== r.i ? ('visit' as const) : undefined,
            dim: r.d[a.u] === null && !r.result,
          })),
          x,
          y: y0,
          roles,
          perRow: 7,
          empty: 'no edges',
        });
        let y = below(order, 14);
        const parts: Bounds[] = [order];
        if (n > 1) {
          const passes = drawTable(out, {
            id: 'ps',
            x,
            y,
            columns: Array.from({ length: n - 1 }, (_, k) => String(k + 1)),
            head: 'pass',
            rows: [
              {
                key: 'n',
                label: 'changed',
                cells: Array.from({ length: n - 1 }, (_, k) => ({
                  text: k < r.changes.length ? String(r.changes[k]) : '',
                })),
              },
            ],
            roles,
            perRow: 10,
          });
          parts.push(passes);
          y = below(passes, 14);
        }
        const table = distTable(out, {
          id: 'tbl',
          x,
          y,
          vertices: g.vertices,
          d: r.d,
          pi: r.pi,
          roles,
          final: (v) => r.result === 'true' && r.d[v] !== null,
        });
        parts.push(table);
        return unionBounds(...parts);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
