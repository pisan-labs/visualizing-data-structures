/**
 * The blossom algorithm: the graph, with matched edges as double lines, the forest's edges as
 * arrows from parent to child, edges looked at dashed, and each blossom as a dashed ring
 * around its vertices labeled B(base). Even (outer) vertices carry a + badge and odd (inner)
 * ones a − badge, so color is never the only cue. Beside or under the graph: the queue of even
 * vertices and a table of each vertex's label, base and mate. A plain state draws just the
 * graph.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  VERTEX_R,
  below,
  drawGraph,
  drawLegend,
  drawRow,
  drawTable,
  layoutGraph,
  padBounds,
  placePanels,
  unionBounds,
  type EdgeLook,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  blossomId,
  blossomsOf,
  describe,
  describeRun,
  type BlExtra,
  type BlRun,
  type BlSettings,
  type BlState,
} from './model';

function look(r: BlRun, v: string): VertexLook | undefined {
  if (r.done) return undefined;
  if (v === r.v) return 'current';
  if (r.queue.includes(v)) return 'frontier';
  if (r.label[v] === 'even') return 'visited';
  return undefined;
}

/** A second line beside each segment of an edge: a double line for a matched edge. */
function doubled(shapes: Shape[], id: string, role: MarkRole | undefined): Shape[] {
  const out: Shape[] = [];
  for (const s of shapes) {
    if (s.kind !== 'arrow' || (s.id !== id && s.id !== `${id}-a`)) continue;
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
    const nx = (-(s.y2 - s.y1) / len) * 4.5;
    const ny = ((s.x2 - s.x1) / len) * 4.5;
    out.push({
      kind: 'arrow',
      id: `${s.id}-m`,
      x1: s.x1 + nx,
      y1: s.y1 + ny,
      x2: s.x2 + nx,
      y2: s.y2 + ny,
      head: 'none',
      role,
    });
  }
  return out;
}

export function view(step: Step<BlState, BlExtra>, settings: BlSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const layout = layoutGraph(g, settings.layout);
  const matchedKey = (key: string) => {
    if (!r) return false;
    const [a, b] = key.split('-') as [string, string];
    return r.mate[a] === b;
  };
  const edgeLook = (key: string): EdgeLook | undefined => {
    if (!r) return undefined;
    if (matchedKey(key)) return undefined;
    if (r.done) return 'unexamined';
    if (r.tree[key]) return 'tree';
    if (r.seen[key]) return 'seen';
    return 'unexamined';
  };
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: edgeLook,
    parent: (key) => r?.tree[key],
    note:
      r &&
      ((v) =>
        r.done ? undefined : r.label[v] === 'even' ? '+' : r.label[v] === 'odd' ? '−' : undefined),
    pointers: r
      ? [
          ...(r.v ? [{ name: 'v', at: r.v, role: 'active' as MarkRole }] : []),
          ...(r.w ? [{ name: 'w', at: r.w }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    for (const e of g.edges) {
      const key = `${e.u}-${e.v}`;
      if (matchedKey(key)) shapes.push(...doubled(drawn.shapes, `e-${key}`, roles.get(`e-${key}`)));
    }
    for (const [b, members] of blossomsOf(g, r)) {
      const pts = members.map((v) => layout.pos[v]!);
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const rad = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + VERTEX_R + 9;
      const id = blossomId(b);
      shapes.push({
        kind: 'circle',
        id,
        x: cx,
        y: cy,
        r: rad,
        cls: 'ghost',
        role: roles.get(id) ?? 'found',
        z: -1,
      });
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: cx,
        y: cy - rad - 6,
        text: `B(${b})`,
        size: 13,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: 'found',
      });
      boxes.push({ x: cx - rad, y: cy - rad - 20, w: 2 * rad, h: 2 * rad + 20 });
    }
    const n = g.vertices.length;
    boxes.push(
      placePanels(shapes, unionBounds(...boxes), (out, x, y0) => {
        const labelW = 64;
        const perRow = 10;
        const rows = Math.max(1, Math.ceil(n / perRow));
        const rowW = labelW + Math.min(Math.max(n, 1), perRow) * 34;
        const queue = drawRow(out, {
          id: 'q',
          label: 'queue',
          labelW,
          cells: r.queue.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow,
          cellW: 30,
          ends: ['front', 'back'],
        });
        const room = { x, y: y0, w: rowW, h: rows * 46 - 2 };
        let y = below(unionBounds(queue, room), 12);
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y,
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'lab',
              label: '+/−',
              cells: g.vertices.map((v) => ({
                text: r.done ? '' : r.label[v] === 'even' ? '+' : r.label[v] === 'odd' ? '−' : '',
              })),
            },
            {
              key: 'base',
              label: 'base',
              cells: g.vertices.map((v) => ({ text: r.done ? '' : r.base[v]! })),
            },
            {
              key: 'mate',
              label: 'mate',
              cells: g.vertices.map((v) => ({ text: r.mate[v] ?? '' })),
            },
          ],
          roles,
        });
        y = below(table, 12);
        const legend = drawLegend(out, {
          id: 'key',
          items: ['═ matched', '→ forest edge', '+ even, − odd', '◯ blossom'],
          x,
          y,
          maxW: Math.max(table.w, rowW, 260),
        });
        return unionBounds(queue, room, table, legend);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
