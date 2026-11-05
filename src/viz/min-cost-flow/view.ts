/**
 * Min-cost flow: the network with "flow/capacity $cost" on every arc (or, with the residual
 * setting, the residual network with the room left and the cost per unit of each residual arc,
 * reverse arcs dashed with negative costs), each reached vertex's distance in a badge, and
 * beside or under it a table of d and π (and h with Dijkstra) and the paths pushed so far.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  below,
  drawRow,
  drawTable,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { drawNetwork, networkLayout } from '../_flow/kit';
import { order, type Network } from '../_flow/network';
import {
  describe,
  describeRun,
  type McExtra,
  type McRun,
  type McSettings,
  type McState,
} from './model';

const SHOWN = 4;

function look(r: McRun, v: string): VertexLook | undefined {
  if (r.finished) return undefined;
  if (v === r.u) return 'current';
  if (r.done.includes(v)) return 'done';
  if (r.d[v] !== null && r.d[v] !== undefined) return 'visited';
  return undefined;
}

export const pathCell = (p: { p: string[]; b: number; unit: number }) =>
  `${p.b}×$${p.unit}: ${p.p.join(' ')}`;

function panels(
  out: Shape[],
  net: Network,
  r: McRun,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const cols = order(net);
  const final = !!r.finished;
  const table = drawTable(out, {
    id: 'tbl',
    x,
    y,
    columns: cols,
    head: 'v',
    rows: [
      {
        key: 'd',
        label: 'd',
        cells: cols.map((v) => ({
          text: r.d[v] === null || r.d[v] === undefined ? '∞' : String(r.d[v]),
        })),
      },
      { key: 'pi', label: 'π', cells: cols.map((v) => ({ text: r.pi[v] ?? '–' })) },
      ...(r.h
        ? [{ key: 'pot', label: 'h', cells: cols.map((v) => ({ text: String(r.h![v]) })) }]
        : []),
    ],
    roles,
    perRow: 8,
  });
  const recent = r.paths.slice(-SHOWN);
  const first = r.paths.length - recent.length;
  const longest = Math.max(
    12,
    Math.min(26, net.graph.vertices.length * 2 + 6),
    ...r.paths.map((a) => pathCell(a).length),
  );
  const cellW = textWidth('x'.repeat(longest), 13, true) + 12;
  const paths = drawRow(out, {
    id: 'ap',
    label: 'paths',
    labelW: 64,
    cells: recent.map((a, i) => ({
      key: String(first + i + 1),
      text: pathCell(a),
      role: final ? ('done' as const) : undefined,
    })),
    x,
    y: below(table, 12),
    roles,
    perRow: 2,
    cellW,
    empty: 'none yet',
  });
  const parts: Bounds[] = [table, paths];
  if (first > 0) {
    const yy = below(paths, 10);
    out.push({
      kind: 'text',
      id: 'ap-more',
      x,
      y: yy + 12,
      text: `the last ${SHOWN} of ${r.paths.length} paths`,
      size: 12,
      cls: 'label',
    });
    parts.push({ x, y: yy, w: 160, h: 16 });
  }
  // Keep room for two lines of paths and the caption, so the picture keeps its size.
  parts.push({ x, y, w: 64 + 2 * (cellW + 4), h: below(table, 12) - y + 60 + 32 });
  return unionBounds(...parts);
}

export function view(step: Step<McState, McExtra>, settings: McSettings): Scene {
  const { state, extra = {} } = step;
  const net = state.net;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = networkLayout(net, settings.layout, 1.25);
  const named = (v: string | null, name: string) => (v && v !== name ? [{ name, at: v }] : []);
  const drawn = drawNetwork(net, layout, {
    roles,
    flow: r?.flow ?? {},
    residual: settings.residual,
    costs: true,
    vertex: r && ((v) => look(r, v)),
    path: r?.path && r.path.slice(1).map((v, i) => `${r.path![i]}-${v}`),
    note:
      r &&
      ((v) => (r.finished || r.d[v] === null || r.d[v] === undefined ? undefined : `d=${r.d[v]}`)),
    pointers: [
      ...named(net.s, 's'),
      ...named(net.t, 't'),
      ...(r?.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
    ],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r)
    boxes.push(placePanels(shapes, drawn.bounds, (out, x, y) => panels(out, net, r, x, y, roles)));
  const label = r ? `${describe(state)} ${describeRun(net, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
