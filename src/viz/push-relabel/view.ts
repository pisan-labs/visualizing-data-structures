/**
 * Push-relabel: the network with flow/capacity on every arc (or, with the residual setting, the
 * residual network, reverse arcs dashed), each vertex's height in a badge (h=2), and beside or
 * under it a table of heights and excesses, the queue (or active set, or list L), and at the
 * end the cut and how Edmonds-Karp did on the same network.
 *
 * The vertex being discharged is blue (pointer u), the neighbour it looks at has pointer v, and
 * overflowing vertices have a dashed ring. The arc a push just used is blue; the admissible
 * arcs out of u (room left, one level down) are teal. At the end the s side of the minimum cut
 * is shaded and the arcs across the cut are red, as on the max-flow page.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  below,
  drawRow,
  edgeId,
  padBounds,
  placePanels,
  unionBounds,
  weightId,
  type GraphLayout,
  type VertexLook,
} from '../../layouts/graph';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { keyOf, plural } from '../_graph/graph';
import { drawNetwork, networkLayouts } from '../_flow/kit';
import { cutArcs, flowOn, hasArc, order, type Network } from '../_flow/network';
import { drawTable, monoW, txt, type Col } from '../_numbers/draw';
import {
  describe,
  describeRun,
  minus,
  type PrExtra,
  type PrRun,
  type PrSettings,
  type PrState,
} from './model';

function look(r: PrRun, v: string): VertexLook | undefined {
  if (r.done) return undefined;
  if (v === r.u) return 'current';
  if (v !== r.s && v !== r.t && (r.e[v] ?? 0) > 0) return 'frontier';
  return undefined;
}

const TABLE_SIZE = 14;
const ROW_H = 24;
const LINE = 13;

/** The widest text a table column can need through a run: e(s) at its lowest, or 2|V|. */
function columnWidth(net: Network): number {
  const out = net.graph.edges.filter((e) => e.u === net.s).reduce((n, e) => n + e.w, 0);
  const longest = Math.max(
    String(-out).length,
    String(2 * net.graph.vertices.length).length,
    ...net.graph.vertices.map((v) => v.length),
  );
  return Math.max(30, monoW('x'.repeat(longest), TABLE_SIZE) + 12);
}

const listLabel = (settings: PrSettings) =>
  settings.rule === 'fifo' ? 'queue' : settings.rule === 'highest' ? 'active' : 'L';

function panels(
  out: Shape[],
  net: Network,
  r: PrRun,
  x: number,
  y: number,
  settings: PrSettings,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const parts: Bounds[] = [];
  const vs = order(net);
  const w = columnWidth(net);
  const labelW = 26;
  const cols: Col[] = [
    { key: 'name', head: '', w: labelW },
    ...vs.map((v) => ({ key: v, head: v, w })),
  ];
  const cell = (v: string, text: string, overflow: boolean) => ({
    text,
    role: v === r.u ? ('active' as const) : overflow ? ('visit' as const) : undefined,
  });
  const rows = [
    {
      name: { text: 'h', bare: true },
      ...Object.fromEntries(vs.map((v) => [v, cell(v, String(r.h[v] ?? 0), false)])),
    },
    {
      name: { text: 'e', bare: true },
      ...Object.fromEntries(
        vs.map((v) => [
          v,
          cell(v, minus(r.e[v] ?? 0), v !== r.s && v !== r.t && (r.e[v] ?? 0) > 0 && !r.done),
        ]),
      ),
    },
  ];
  const table = drawTable('ht', x, y, cols, rows, {
    size: TABLE_SIZE,
    rowH: ROW_H,
    room: 2,
    roles,
    headSize: 15,
  });
  out.push(...table.shapes);
  parts.push(table.bounds);

  const inner = vs.filter((v) => v !== r.s && v !== r.t);
  const shown =
    settings.rule === 'highest'
      ? [...r.list].sort((a, b) => (r.h[b] ?? 0) - (r.h[a] ?? 0) || vs.indexOf(a) - vs.indexOf(b))
      : r.list;
  const perRow = 7;
  const cellW = Math.max(30, Math.max(...vs.map((v) => monoW(v, 15))) + 14);
  const row = drawRow(out, {
    id: 'q',
    label: listLabel(settings),
    labelW: 64,
    cells: shown.map((v, i) => ({
      key: v,
      text: v,
      role:
        settings.rule === 'front'
          ? i === r.at && r.u === v
            ? ('active' as const)
            : undefined
          : undefined,
    })),
    x,
    y: below(table.bounds, 10),
    roles,
    perRow,
    cellW,
    empty: r.done || r.side ? 'empty: nothing overflows' : 'empty',
  });
  parts.push(row);
  let next = below(row, 10);
  if (r.side) {
    const cut = cutArcs(net, r.side);
    const cutRow = drawRow(out, {
      id: 'cut',
      label: 'cut',
      labelW: 64,
      cells: cut.map((e) => ({
        key: keyOf(e),
        text: `${e.u}→${e.v} ${e.w}`,
        role: 'error' as const,
      })),
      x,
      y: next,
      roles,
      perRow: 3,
      empty: 'no arcs',
    });
    parts.push(cutRow);
    next = below(cutRow, 12);
  }
  if (r.ek) {
    const lines = [
      `this run: ${plural(r.pushes, 'push', 'pushes')}, ${plural(r.relabels, 'relabel')}`,
      `Edmonds-Karp: ${plural(r.ek.paths, 'path')}`,
      `arc checks: ${r.checks} here, ${r.ek.checks} for EK`,
    ];
    lines.forEach((text, k) => {
      out.push(txt(`cmp-${k}`, x, next + LINE + k * (LINE + 6), text, LINE, { cls: 'label' }));
    });
    parts.push({
      x,
      y: next,
      w: Math.max(...lines.map((l) => monoW(l, LINE))),
      h: lines.length * (LINE + 6),
    });
  }
  // Room for everything a run shows, so the picture keeps its size from step to step.
  const listRows = Math.max(1, Math.ceil(inner.length / perRow));
  const reserve =
    table.bounds.h + 10 + listRows * 34 + 10 + 26 + 12 + 3 * (LINE + 6) + (inner.length ? 0 : 8);
  const wide = Math.max(
    table.bounds.w,
    64 + Math.min(perRow, Math.max(1, inner.length)) * (cellW + 4),
    monoW('arc checks: 999 here, 999 for EK', LINE),
  );
  parts.push({ x, y, w: wide, h: reserve });
  return unionBounds(...parts);
}

export function view(step: Step<PrState, PrExtra>, settings: PrSettings, stage?: StageSize): Scene {
  return pickLayout(
    stage,
    networkLayouts(step.state.net, settings.layout, stage).map((layout) =>
      draw(step, settings, layout, stage),
    ),
  );
}

/** The arc of the network a residual arc (u, v) uses: itself, or v→u when it takes flow back. */
function networkArc(net: Network, flow: Record<string, number>, u: string, v: string): string {
  return hasArc(net, u, v) && !(flowOn(flow, v, u) > 0) ? `${u}-${v}` : `${v}-${u}`;
}

function draw(
  step: Step<PrState, PrExtra>,
  settings: PrSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const net = state.net;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  if (r?.u && r.admissible)
    for (const v of r.admissible) {
      const key = settings.residual ? `${r.u}-${v}` : networkArc(net, r.flow, r.u, v);
      roles.set(edgeId(key), 'visit');
      roles.set(weightId(key), 'visit');
    }
  const named = (v: string | null, name: string) => (v && v !== name ? [{ name, at: v }] : []);
  const drawn = drawNetwork(net, layout, {
    roles,
    flow: r?.flow ?? {},
    residual: settings.residual,
    vertex: r && ((v) => look(r, v)),
    path: r?.arc && [`${r.arc[0]}-${r.arc[1]}`],
    cut: r?.side && !settings.residual ? cutArcs(net, r.side).map(keyOf) : undefined,
    note: r && ((v) => `h=${r.h[v] ?? 0}`),
    pointers: [
      ...named(net.s, 's'),
      ...named(net.t, 't'),
      ...(r?.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
      ...(r?.v && r.v !== r.u ? [{ name: 'v', at: r.v, role: 'compare' as MarkRole }] : []),
    ],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r)
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y) =>
        panels(out, net, r, x, y, settings, roles),
      ),
    );
  const label = r ? `${describe(state)} ${describeRun(net, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
