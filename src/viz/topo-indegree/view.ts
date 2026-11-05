/**
 * Topological sort by in-degree: the graph, each vertex wearing its
 * in-degree left (in=2) until it goes in the order, and then its place in the order (#3).
 * Ready vertices wear a dashed ring, vertices in the order are green, removed arcs are dashed,
 * and a cycle left at the end is red. Beside or under it: the queue of ready vertices, the
 * order L, and a table of in-degrees.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  below,
  drawGraph,
  drawRow,
  drawTable,
  layoutGraph,
  padBounds,
  placePanels,
  unionBounds,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  describe,
  describeRun,
  type TopoExtra,
  type TopoRun,
  type TopoSettings,
  type TopoState,
} from './model';

function look(r: TopoRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.queue.includes(v)) return 'frontier';
  if (r.order.includes(v)) return 'done';
  return undefined;
}

export function view(step: Step<TopoState, TopoExtra>, settings: TopoSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((key) => r.edges[key]),
    note:
      r &&
      ((v) => {
        const at = r.order.indexOf(v);
        if (at >= 0) return `#${at + 1}`;
        return r.indeg[v] === null ? undefined : `in=${r.indeg[v]}`;
      }),
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
      placePanels(shapes, drawn.bounds, (out, x, y0) => {
        const labelW = 44;
        const queue = drawRow(out, {
          id: 'q',
          label: 'Q',
          labelW,
          cells: r.queue.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow: 12,
          ends: r.ready === 'smallest' ? ['min', 'max'] : ['front', 'back'],
        });
        // Room for the longest each row can get, so nothing moves as they grow.
        const room = { x, y: y0, w: labelW + Math.min(n, 12) * 34, h: 40 };
        const listY = below(unionBounds(queue, room), 10);
        const list = drawRow(out, {
          id: 'L',
          label: 'L',
          labelW,
          cells: r.order.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: listY,
          roles,
          perRow: 12,
        });
        const lines = Math.max(1, Math.ceil(n / 12));
        const listRoom = { x, y: listY, w: room.w, h: lines * 34 - 8 };
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(unionBounds(list, listRoom), 14),
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'in',
              label: 'in',
              cells: g.vertices.map((v) => ({
                text: r.indeg[v] === null ? '' : String(r.indeg[v]),
                role: r.order.includes(v) ? ('done' as MarkRole) : undefined,
              })),
            },
          ],
          roles,
        });
        return unionBounds(queue, room, list, listRoom, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
