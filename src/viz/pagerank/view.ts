/**
 * PageRank: the graph with each vertex's rank in a badge, and under or beside it one bar per
 * vertex, its height the rank on one scale for the whole run (so bars grow and shrink as rank
 * flows). The vertex being updated is blue, with the vertices linking to it marked; the leader
 * is marked found at the end of each iteration. A plain state (no run) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  drawGraph,
  layoutGraph,
  layoutsFor,
  padBounds,
  placePanels,
  unionBounds,
  type GraphLayout,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Graph } from '../_graph/graph';
import {
  barId,
  describe,
  describeRun,
  r3,
  type PrExtra,
  type PrRun,
  type PrSettings,
  type PrState,
} from './model';

const BAR_W = 34;
const GAP = 8;
const BAR_H = 110;

/** One bar per vertex: value on top, name underneath. */
function drawBars(
  out: Shape[],
  g: Graph,
  r: PrRun,
  roles: ReadonlyMap<string, MarkRole>,
  x0: number,
  y0: number,
): Bounds {
  const per = Math.min(g.vertices.length, 8);
  const rowH = BAR_H + 50;
  out.push({
    kind: 'text',
    id: 'bars-label',
    x: x0,
    y: y0 + 14,
    text: 'rank',
    size: 14,
    cls: 'label',
    mono: true,
  });
  g.vertices.forEach((v, i) => {
    const row = Math.floor(i / per);
    const x = x0 + (i % per) * (BAR_W + GAP);
    const base = y0 + 22 + row * rowH + BAR_H + 18;
    const h = Math.max(2, (r.rank[v]! / r.top) * BAR_H);
    const role = roles.get(barId(v)) ?? 'visit';
    out.push({ kind: 'rect', id: barId(v), x, y: base - h, w: BAR_W, h, r: 3, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${barId(v)}-t`,
      x: x + BAR_W / 2,
      y: base - h - 5,
      text: r3(r.rank[v]!),
      size: 13,
      anchor: 'middle',
      mono: true,
      role: role === 'active' ? 'active' : undefined,
    });
    out.push({
      kind: 'text',
      id: `${barId(v)}-n`,
      x: x + BAR_W / 2,
      y: base + 17,
      text: v,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
    });
  });
  const rows = Math.ceil(g.vertices.length / per);
  return { x: x0, y: y0, w: Math.max(40, per * (BAR_W + GAP) - GAP), h: 22 + rows * rowH - 8 };
}

export function view(step: Step<PrState, PrExtra>, settings: PrSettings, stage?: StageSize): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, l, stage)),
  );
}

function draw(step: Step<PrState, PrExtra>, layout: GraphLayout, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => (v === r.v ? 'current' : undefined)),
    note: r && ((v) => r3(r.rank[v]!)),
    pointers: r?.v ? [{ name: 'v', at: r.v, role: 'active' as MarkRole }] : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r)
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y) => drawBars(out, g, r, roles, x, y)),
    );
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
