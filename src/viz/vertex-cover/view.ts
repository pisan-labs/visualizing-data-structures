/**
 * Vertex cover: the graph, with the cover's vertices green and a thick outline, the vertex or
 * edge being looked at in blue, covered edges faint and uncovered edges solid (at the end every
 * edge is drawn plainly again). Under or beside it: the cover C in the order it grew, the
 * matching M (matching method), the uncovered degree of each vertex (greedy), the best cover so
 * far (exact methods), and the cover's size against the optimum.
 */
import type { MarkRole, Step } from '../../engine/types';
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
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ratioText } from '../_approx/kit';
import type { Graph } from '../_graph/graph';
import {
  describe,
  describeRun,
  type VcExtra,
  type VcRun,
  type VcSettings,
  type VcState,
} from './model';

function look(r: VcRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.C.includes(v)) return 'done';
  return undefined;
}

function panels(
  out: Shape[],
  g: Graph,
  r: VcRun,
  roles: ReadonlyMap<string, MarkRole>,
  x: number,
  y: number,
  full: boolean,
): Bounds {
  const boxes: Bounds[] = [];
  const labelW = 46;
  let at = y;
  const row = (id: string, label: string, cells: string[], empty: string) => {
    const b = drawRow(out, {
      id,
      label,
      cells: cells.map((c) => ({ key: c, text: c })),
      x,
      y: at,
      roles,
      perRow: 8,
      labelW,
      empty,
    });
    boxes.push(b);
    at = below(b, 10);
  };
  row('cover', 'C', full ? g.vertices : r.C, 'empty');
  if (r.method === 'matching') {
    const most = Math.min(g.edges.length, Math.floor(g.vertices.length / 2));
    row('match', 'M', full ? g.edges.slice(0, most).map((e) => `${e.u}-${e.v}`) : r.M, 'empty');
  }
  if ((r.method === 'branch' || r.method === 'brute') && (full || !r.final))
    row('best', 'best', full ? g.vertices : (r.best ?? []), 'none yet');
  if (r.deg) {
    const deg = r.deg;
    const b = drawTable(out, {
      id: 'deg',
      x,
      y: at,
      columns: g.vertices,
      head: 'v',
      rows: [
        {
          key: 'deg',
          label: 'deg',
          cells: g.vertices.map((v) => ({
            text: String(deg[v] ?? 0),
            role: r.C.includes(v) ? ('done' as const) : undefined,
          })),
        },
      ],
      roles,
      perRow: 8,
    });
    boxes.push(b);
    at = below(b, 10);
  }
  const items = [
    `size ${r.C.length}`,
    `optimum ${r.opt}`,
    `ratio ${r.final ? ratioText(r.C.length, r.opt) : '–'}`,
  ];
  boxes.push(
    drawLegend(out, { id: 'sum', items: full ? [...items, ''] : items, x, y: at, maxW: 300 }),
  );
  return unionBounds(...boxes);
}

export function view(step: Step<VcState, VcExtra>, settings: VcSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  const drawn = drawGraph(g, layout, {
    roles,
    weights: false,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((k) => (r.final || !r.covered[k] ? undefined : 'unexamined')),
    pointers: r?.u ? [{ name: 'u', at: r.u, role: 'active' }] : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    boxes.push(
      placePanels(shapes, drawn.bounds, (out, x, y) => {
        const box = panels(out, g, r, roles, x, y, false);
        return unionBounds(box, panels([], g, r, roles, x, y, true));
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
