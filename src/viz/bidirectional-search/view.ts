/**
 * Bidirectional search: the graph, and under or beside it the two frontiers (Fs, Ft) and a
 * table of each vertex's distance from s and to t.
 *
 * Vertices seen from s take the first group color, vertices seen from t the second, and each
 * carries its distance in a badge (s1, t2; a vertex both sides saw shows both). Frontier
 * vertices wear a dashed ring. Each side's tree edges are arrows from parent to child. At the
 * end the path is marked found. A plain state (no run) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
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
  vertexId,
  type GraphLayout,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  arcKey,
  describe,
  describeRun,
  type BiExtra,
  type BiRun,
  type BiSettings,
  type BiState,
} from './model';

const S_ROLE: MarkRole = 'g1';
const T_ROLE: MarkRole = 'g2';

export function view(step: Step<BiState, BiExtra>, settings: BiSettings, stage?: StageSize): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, l, stage)),
  );
}

function badge(r: BiRun, v: string): string | undefined {
  const a = r.ds[v];
  const b = r.dt[v];
  if (a !== undefined && b !== undefined) return `s${a}t${b}`;
  if (a !== undefined) return `s${a}`;
  return b !== undefined ? `t${b}` : undefined;
}

/** s, t and u. At s or t the current vertex is only drawn blue: two labels there would hit the badge. */
function pointers(r: BiRun): { name: string; at: string; role?: MarkRole }[] {
  return [
    { name: 's', at: r.s },
    ...(r.t !== r.s ? [{ name: 't', at: r.t }] : []),
    ...(r.u && r.u !== r.s && r.u !== r.t
      ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }]
      : []),
  ];
}

function draw(step: Step<BiState, BiExtra>, layout: GraphLayout, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const roles = new Map<string, MarkRole>();
  const tree = new Map<string, string>();
  if (r) {
    for (const v of g.vertices) {
      if (r.ds[v] !== undefined) roles.set(vertexId(v), S_ROLE);
      else if (r.dt[v] !== undefined) roles.set(vertexId(v), T_ROLE);
    }
    for (const [v, p] of Object.entries(r.ps)) tree.set(arcKey(g, p, v), p);
    for (const [v, p] of Object.entries(r.pt)) tree.set(arcKey(g, v, p), v);
  }
  for (const m of step.marks) roles.set(m.id, m.role);
  const front = new Set([...(r?.Fs ?? []), ...(r?.Ft ?? [])]);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex:
      r && ((v) => (v === r.u ? 'current' : !r.final && front.has(v) ? 'frontier' : undefined)),
    edge: r && ((key) => (tree.has(key) ? 'tree' : 'unexamined')),
    parent: (key) => tree.get(key),
    note: r && ((v) => badge(r, v)),
    pointers: r ? pointers(r) : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const n = g.vertices.length;
    const per = 8;
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const rowRoom = (y: number) => ({
          x,
          y,
          w: 40 + Math.min(n, per) * 34,
          h: n > per ? 56 : 26,
        });
        const fs = drawRow(out, {
          id: 'Fs',
          label: 'Fs',
          labelW: 40,
          cells: r.Fs.map((v) => ({ key: v, text: v, role: S_ROLE, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow: per,
        });
        const fsBox = unionBounds(fs, rowRoom(y0));
        const y1 = below(fsBox, 8);
        const ft = drawRow(out, {
          id: 'Ft',
          label: 'Ft',
          labelW: 40,
          cells: r.Ft.map((v) => ({ key: v, text: v, role: T_ROLE, from: layout.pos[v] })),
          x,
          y: y1,
          roles,
          perRow: per,
        });
        const ftBox = unionBounds(ft, rowRoom(y1));
        const dText = (d: number | undefined) => (d === undefined ? '–' : String(d));
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(ftBox, 14),
          columns: g.vertices,
          head: 'v',
          rows: [
            { key: 'ds', label: 'ds', cells: g.vertices.map((v) => ({ text: dText(r.ds[v]) })) },
            { key: 'dt', label: 'dt', cells: g.vertices.map((v) => ({ text: dText(r.dt[v]) })) },
          ],
          roles,
          perRow: per,
        });
        return unionBounds(fsBox, ftBox, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
