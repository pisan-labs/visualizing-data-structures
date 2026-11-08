/**
 * Kruskal: the graph, and under or beside it the edge list in the order Kruskal looks at the
 * edges (sorted once the run sorts them), and under that the union-find forest.
 *
 * Tree edges are solid with green weights and a ✓ in the list. Rejected edges, which would
 * close a cycle, are red and dashed, with ✗ beside their weight and in the list. Edges not
 * looked at yet are faint. In the forest every vertex points at its parent; roots carry their
 * rank. A plain state (no run) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { trimmedLine } from '../../layouts/binary-tree';
import { layoutForest } from '../../layouts/forest';
import {
  below,
  drawGraph,
  drawRow,
  edgeId,
  layoutGraph,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
  weightId,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { keyOf, type Graph } from '../_graph/graph';
import {
  describe,
  describeRun,
  ufNodeId,
  ufPtrId,
  type KruskalExtra,
  type KruskalRun,
  type KruskalSettings,
  type KruskalState,
} from './model';

const R = 15;
const LEVEL = 46;
const GAP = 10;
const PER_ROW = 5;

function edgeText(e: { u: string; v: string; w: number }, r: KruskalRun): string {
  const st = r.status[keyOf(e)];
  return `${e.u}-${e.v}:${e.w}${st === 'tree' ? ' ✓' : st === 'cycle' ? ' ✗' : ''}`;
}

/** The forest of r.p, drawn with its top left corner at (x, y). */
function drawUnionFind(
  out: Shape[],
  g: Graph,
  r: KruskalRun,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
  maxWidth: number,
): Bounds {
  out.push({
    kind: 'text',
    id: 'uf-label',
    x,
    y: y + 12,
    text: 'union-find forest',
    size: 14,
    cls: 'label',
    mono: true,
  });
  const index = new Map(g.vertices.map((v, i) => [v, i]));
  const kids = new Map<number, number[]>(g.vertices.map((_, i) => [i, []]));
  const roots: number[] = [];
  g.vertices.forEach((v, i) => {
    if (r.p[v] === v) roots.push(i);
    else kids.get(index.get(r.p[v]!)!)!.push(i);
  });
  const opts = { radius: R, gap: GAP, treeGap: 16, levelGap: LEVEL, maxWidth, rowGap: 34 };
  const layout = layoutForest(roots, (i) => kids.get(i) ?? [], opts);
  const top = y + 26 + R;
  const left = x - layout.bounds.x;
  for (const n of layout.nodes.values()) {
    const v = g.vertices[n.id]!;
    const at = { x: left + n.x, y: top + n.y };
    if (n.parent !== null) {
      const p = layout.nodes.get(n.parent)!;
      out.push({
        kind: 'arrow',
        id: ufPtrId(v),
        ...trimmedLine(at, { x: left + p.x, y: top + p.y }, R + 1, R + 2),
        role: roles.get(ufPtrId(v)),
      });
    } else {
      out.push({
        kind: 'text',
        id: `ufr-${v}`,
        x: at.x + R + 1,
        y: at.y - R + 3,
        text: `r${r.rank[v]}`,
        size: 11,
        mono: true,
        cls: 'label',
      });
    }
    const role = roles.get(ufNodeId(v));
    out.push({ kind: 'circle', id: ufNodeId(v), x: at.x, y: at.y, r: R, cls: 'live', role });
    const size = v.length <= 2 ? 14 : 11;
    out.push({
      kind: 'text',
      id: `ufl-${v}`,
      x: at.x,
      y: at.y + size * 0.36,
      text: v,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: role === 'active' || role === 'error' ? role : undefined,
    });
  }
  // Room for the tallest tree union by rank can make (height log2 V), and for V singletons.
  const singles = layoutForest(
    g.vertices.map((_, i) => i),
    () => [],
    opts,
  );
  const tallest = Math.floor(Math.log2(Math.max(1, g.vertices.length)));
  const w = Math.max(layout.bounds.w, singles.bounds.w, textWidth('union-find forest', 14, true));
  const h = 26 + Math.max(layout.bounds.h, singles.bounds.h + tallest * LEVEL);
  return { x, y, w: w + 16, h };
}

export function view(
  step: Step<KruskalState, KruskalExtra>,
  settings: KruskalSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const marks = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  // Rejected edges stay red and tree weights green; the step's marks come on top.
  const roles = new Map<string, MarkRole>();
  if (r)
    for (const [key, st] of Object.entries(r.status)) {
      if (st === 'cycle') {
        roles.set(edgeId(key), 'error');
        roles.set(weightId(key), 'error');
      } else roles.set(weightId(key), 'done');
    }
  for (const [id, role] of marks) roles.set(id, role);
  const drawn = drawGraph(g, layout, {
    roles,
    weightSuffix: '✗',
    edge:
      r &&
      ((key) => {
        const st = r.status[key];
        if (st === 'cycle') return 'seen';
        if (st === 'tree') return undefined;
        return 'unexamined';
      }),
  });
  const shapes: Shape[] = drawn.shapes;
  if (r)
    for (const sh of shapes) {
      if (sh.kind !== 'text' || !sh.id.startsWith('ew-')) continue;
      const st = r.status[sh.id.slice(3)];
      if (st === 'cycle') sh.text = `${sh.text}✗`;
    }
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const cellW = Math.max(
      44,
      ...g.edges.map((e) => textWidth(`${e.u}-${e.v}:${e.w} ✗`, 15, true) + 12),
    );
    const block = (out: Shape[], x: number, y0: number) => {
      const list = drawRow(out, {
        id: 'el',
        label: r.isSorted ? 'sorted' : 'edges',
        labelW: textWidth('sorted', 14, true) + 10,
        cells: r.sorted.map((e) => {
          const st = r.status[keyOf(e)];
          return {
            key: keyOf(e),
            text: edgeText(e, r),
            role: st === 'tree' ? 'done' : st === 'cycle' ? 'error' : undefined,
            dim: st === 'cycle',
          };
        }),
        x,
        y: y0,
        roles: marks,
        perRow: PER_ROW,
        cellW,
        empty: '(no edges)',
      });
      const width = Math.max(list.w, 300);
      const forest = drawUnionFind(out, g, r, x, below(list, 16), marks, width);
      return unionBounds(list, forest);
    };
    boxes.push(placePanels(shapes, drawn.bounds, stage, block));
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
