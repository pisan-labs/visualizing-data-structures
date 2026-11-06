/**
 * Maximum flow: the network with flow/capacity on every arc (or, with the residual setting, the
 * residual network with what is left on each arc, reverse arcs dashed), and beside or under it
 * the search's queue or stack, the augmenting paths so far, and at the end the cut.
 *
 * Arcs that carry flow have green labels. The augmenting path is blue; in the network view an
 * arc it uses backwards (taking flow back) is blue and dashed. At the end the s side of the
 * minimum cut is shaded and the arcs across the cut are red.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  below,
  drawRow,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { keyOf } from '../_graph/graph';
import { drawNetwork, networkLayout } from '../_flow/kit';
import { cutArcs, type Network } from '../_flow/network';
import {
  describe,
  describeRun,
  type MfExtra,
  type MfRun,
  type MfSettings,
  type MfState,
} from './model';

/** Augmenting paths shown in the panel (the latest ones). */
const SHOWN = 4;

function look(r: MfRun, v: string): VertexLook | undefined {
  if (r.side) return undefined;
  if (v === r.u) return 'current';
  if (r.frontier.includes(v)) return 'frontier';
  if (r.seen.includes(v)) return 'visited';
  return undefined;
}

export const pathCell = (p: string[], b: number) => `+${b}: ${p.join(' ')}`;

function panels(
  out: Shape[],
  net: Network,
  r: MfRun,
  x: number,
  y: number,
  dfs: boolean,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const parts: Bounds[] = [];
  const front = drawRow(out, {
    id: 'q',
    label: dfs ? 'stack' : 'queue',
    labelW: 64,
    cells: r.frontier.map((v) => ({
      key: v,
      text: v,
      role: v === r.u ? ('active' as const) : undefined,
    })),
    x,
    y,
    roles,
    perRow: 8,
    empty: r.side ? 'empty: t cannot be reached' : 'empty',
  });
  parts.push(front);
  const recent = r.paths.slice(-SHOWN);
  const first = r.paths.length - recent.length;
  const longest = Math.max(
    10,
    Math.min(24, net.graph.vertices.length * 2 + 4),
    ...r.paths.map((a) => pathCell(a.p, a.b).length),
  );
  const cellW = textWidth('x'.repeat(longest), 13, true) + 12;
  const paths = drawRow(out, {
    id: 'ap',
    label: 'paths',
    labelW: 64,
    cells: recent.map((a, i) => ({
      key: String(first + i + 1),
      text: pathCell(a.p, a.b),
      role: i === recent.length - 1 && !r.path && !r.side ? ('visit' as const) : undefined,
    })),
    x,
    y: below(front, 10),
    roles,
    perRow: 2,
    cellW,
    empty: 'none yet',
  });
  parts.push(paths);
  let next = below(paths, 10);
  if (first > 0) {
    out.push({
      kind: 'text',
      id: 'ap-more',
      x,
      y: next + 12,
      text: `the last ${SHOWN} of ${r.paths.length} paths`,
      size: 12,
      cls: 'label',
    });
    parts.push({ x, y: next, w: 160, h: 16 });
    next += 22;
  }
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
      perRow: 4,
      empty: 'no arcs',
    });
    parts.push(cutRow);
  }
  // Room for everything a run shows, so the picture keeps its size from step to step.
  parts.push({ x, y, w: 64 + 2 * (cellW + 4), h: 160 });
  return unionBounds(...parts);
}

export function view(step: Step<MfState, MfExtra>, settings: MfSettings): Scene {
  const { state, extra = {} } = step;
  const net = state.net;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = networkLayout(net, settings.layout);
  const named = (v: string | null, name: string) => (v && v !== name ? [{ name, at: v }] : []);
  const drawn = drawNetwork(net, layout, {
    roles,
    flow: r?.flow ?? {},
    residual: settings.residual,
    vertex: r && ((v) => look(r, v)),
    path: r?.path && r.path.slice(1).map((v, i) => `${r.path![i]}-${v}`),
    cut: r?.side && !settings.residual ? cutArcs(net, r.side).map(keyOf) : undefined,
    pointers: [
      ...named(net.s, 's'),
      ...named(net.t, 't'),
      ...(r?.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
    ],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r)
    boxes.push(
      placePanels(shapes, drawn.bounds, (out, x, y) =>
        panels(out, net, r, x, y, settings.method === 'dfs', roles),
      ),
    );
  const label = r ? `${describe(state)} ${describeRun(net, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
