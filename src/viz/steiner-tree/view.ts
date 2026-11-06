/**
 * Steiner tree: the graph with a ring around every terminal. During a run the tree (or the
 * edges gathered so far) is solid with its vertices green, the path being looked at is marked,
 * edges taken out are dashed, and the rest are faint. Under or beside it: the terminals, the
 * closure table of shortest distances and the closure's spanning tree M (approximation), or
 * the set S of Steiner vertices being tried (brute force), and the weight against the optimum.
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
  type EdgeLook,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ratioText } from '../_approx/kit';
import type { Graph } from '../_graph/graph';
import {
  describe,
  describeRun,
  pairKey,
  steinerIn,
  type StExtra,
  type StRun,
  type StSettings,
  type StState,
} from './model';

export const terminalRingId = (v: string) => `tr-${v}`;

function look(r: StRun, v: string, inTree: Set<string>): VertexLook | undefined {
  if (v === r.at) return 'current';
  if (inTree.has(v)) return 'done';
  if (r.S.includes(v)) return 'visited';
  return undefined;
}

function edgeLook(r: StRun, key: string): EdgeLook | undefined {
  if (r.tree.includes(key) || r.path.includes(key)) return undefined;
  if (r.removed.includes(key) && !r.final) return 'seen';
  return 'unexamined';
}

function panels(
  out: Shape[],
  g: Graph,
  r: StRun,
  roles: ReadonlyMap<string, MarkRole>,
  x: number,
  y: number,
  full: boolean,
): Bounds {
  const boxes: Bounds[] = [];
  const T = r.T;
  let at = y;
  const labelW = 40;
  if (r.method === 'approx') {
    const t = drawTable(out, {
      id: 'cl',
      x,
      y: at,
      columns: T,
      head: 'd',
      rows: T.map((a) => ({
        key: a,
        label: a,
        cells: T.map((b) => {
          if (a === b) return { text: '–' };
          const k = pairKey(a, b);
          const w = r.dist[k];
          return { text: w === undefined ? '' : String(w) };
        }),
      })),
      roles,
      perRow: 8,
    });
    boxes.push(t);
    at = below(t, 12);
    const cells = full
      ? T.slice(1).map((b) => ({ key: `${T[0]}-${b}`, text: `${T[0]}-${b} 888` }))
      : r.closure.map((c) => ({ key: `${c.a}-${c.b}`, text: `${c.a}-${c.b} ${c.w}` }));
    const m = drawRow(out, { id: 'cm', label: 'M', cells, x, y: at, roles, perRow: 4, labelW });
    boxes.push(m);
    at = below(m, 10);
  } else {
    const S = full ? g.vertices.filter((v) => !T.includes(v)) : r.S;
    const b = drawRow(out, {
      id: 'set',
      label: 'S',
      cells: S.map((v) => ({ key: v, text: v })),
      x,
      y: at,
      roles,
      perRow: 8,
      labelW,
    });
    boxes.push(b);
    at = below(b, 10);
  }
  const steiner = steinerIn(r.tree, T);
  const items = [
    `weight ${r.weight}`,
    `optimum ${r.opt}`,
    `ratio ${r.final ? ratioText(r.weight, r.opt) : '–'}`,
    `Steiner: ${full ? g.vertices.join(' ') : steiner.length ? steiner.join(' ') : 'none'}`,
  ];
  if (r.method === 'exact') items.push(`best ${full ? 888 : (r.best ?? '∞')}`);
  boxes.push(drawLegend(out, { id: 'sum', items, x, y: at, maxW: 300 }));
  return unionBounds(...boxes);
}

export function view(step: Step<StState, StExtra>, settings: StSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  const inTree = new Set(r?.tree.flatMap((k) => k.split('-')) ?? []);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v, inTree)),
    edge: r && ((k) => edgeLook(r, k)),
    pointers: r?.at ? [{ name: 'v', at: r.at, role: 'active' }] : [],
  });
  const rings: Shape[] = state.terminals
    .filter((t) => layout.pos[t])
    .map((t) => ({
      kind: 'circle',
      id: terminalRingId(t),
      x: layout.pos[t]!.x,
      y: layout.pos[t]!.y,
      r: layout.r + 5,
      cls: 'ghost',
      role: 'found',
    }));
  const shapes: Shape[] = [...rings, ...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    boxes.push(
      placePanels(shapes, drawn.bounds, (out, x, y) => {
        const box = panels(out, g, r, roles, x, y, false);
        return unionBounds(box, panels([], g, r, roles, x, y, true));
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
