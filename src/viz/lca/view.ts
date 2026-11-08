/**
 * LCA: the tree drawn top down from its root, each vertex with its depth, and under or beside
 * it the binary lifting table: a column per vertex, a row of depths, then up[0], up[1], ...
 * During the build, cells fill in row by row (the cell being filled is blue, the two it reads
 * orange). During a query, u and v are labeled on the tree and the cells each jump reads are
 * marked; the answer is marked found. A graph that is not a tree is drawn with a spring layout.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  drawGraph,
  drawTable,
  layoutGraph,
  padBounds,
  placePanels,
  scaleLayout,
  turnLayout,
  unionBounds,
  type GraphLayout,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pickLayout } from '../../layouts/arrange';
import { makeGraph, type Graph } from '../_graph/graph';
import {
  describe,
  describeExtra,
  notATree,
  rootFor,
  treeOf,
  type Cell,
  type LcaExtra,
  type LcaSettings,
  type LcaState,
  type Tree,
} from './model';

/** Top down from the root: the tree's edges as arcs parent → child, laid out in layers. */
function treeLayout(g: Graph, t: Tree): GraphLayout {
  const edges = t.order.filter((v) => v !== t.root).map((v) => ({ u: t.up[0]![v]!, v, w: 1 }));
  return layoutGraph(
    makeGraph({ directed: true, weighted: false, vertices: g.vertices, edges }),
    'layered',
  );
}

const text = (c: Cell) => (c === undefined ? '' : c === null ? '–' : c);

export function view(
  step: Step<LcaState, LcaExtra>,
  settings: LcaSettings,
  stage?: StageSize,
): Scene {
  const g = step.state.graph;
  const isTree = !notATree(g);
  const root = rootFor(g, settings.root);
  // Settings 'nil' for the layout: up[0] at the root must not point at itself there.
  const shape = isTree ? treeOf(g, root, 'nil') : undefined;
  const layout = shape ? treeLayout(g, shape) : layoutGraph(g, 'force');
  // A tall, thin tree (a long path) may also lie on its side, root on the left, or squeeze its
  // levels closer, when that draws clearly larger on this stage.
  const tall = stage && layout.bounds.h > 1.5 * layout.bounds.w;
  const thin = layout.bounds.h > 3 * layout.bounds.w;
  const layouts = tall
    ? [layout, turnLayout(layout), ...(thin ? [scaleLayout(layout, 0.7)] : [])]
    : [layout];
  return pickLayout(
    stage,
    layouts.map((l) => draw(step, settings, l, stage)),
  );
}

function draw(
  step: Step<LcaState, LcaExtra>,
  settings: LcaSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const isTree = !notATree(g);
  const root = rootFor(g, settings.root);
  const full = extra.tree ?? (state.built && isTree ? treeOf(g, root, settings.above) : undefined);
  const q = extra.query;
  const depth = extra.build?.depth ?? full?.depth;
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: q ? (v) => (v === q.u || v === q.v ? 'current' : undefined) : undefined,
    note: depth ? (v) => (depth[v] === undefined ? undefined : `d=${depth[v]}`) : undefined,
    pointers: q
      ? q.u === q.v
        ? [{ name: 'u,v', at: q.u, role: 'active' as MarkRole }]
        : [
            { name: 'u', at: q.u, role: 'active' as MarkRole },
            { name: 'v', at: q.v, role: 'active' as MarkRole },
          ]
      : isTree
        ? [{ name: 'r', at: root }]
        : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  const rows: Record<string, Cell>[] | undefined = extra.build?.table ?? full?.up;
  if (rows && depth) {
    const log = full?.log ?? treeOf(g, root, settings.above).log;
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y) =>
        drawTable(out, {
          id: 'tbl',
          x,
          y,
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'd',
              label: 'depth',
              cells: g.vertices.map((v) => ({
                text: depth[v] === undefined ? '' : String(depth[v]),
              })),
            },
            ...Array.from({ length: log }, (_, k) => ({
              key: `up${k}`,
              label: `up[${k}]`,
              cells: g.vertices.map((v) => ({ text: text(rows[k]?.[v]) })),
            })),
          ],
          roles,
          perRow: 8,
        }),
      ),
    );
  }
  const label = `${describe(state)} ${describeExtra(g, extra)}`.trim();
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
