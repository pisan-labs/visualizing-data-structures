/**
 * Euler paths: the graph, and under or beside it the stack (bottom to top) and the circuit (in
 * its final order, growing at the front). A vertex popped off the stack slides into the circuit:
 * both rows use the same cell ids, keyed by push.
 *
 * Each vertex carries its degree (d=3) or, in a directed walk, its out and in degrees (o2 i1).
 * Walked edges turn green, with an arrowhead the way they were walked. The top of the stack is
 * marked v and the start s. A plain state (no run) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  below,
  drawGraph,
  drawRow,
  layoutGraph,
  layoutsFor,
  padBounds,
  placePanels,
  unionBounds,
  type GraphLayout,
  type PanelCell,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  describe,
  describeRun,
  outDeg,
  walkOf,
  type EulerExtra,
  type EulerSettings,
  type EulerState,
} from './model';

export function view(
  step: Step<EulerState, EulerExtra>,
  settings: EulerSettings,
  stage?: StageSize,
): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, settings, l, stage)),
  );
}

/** A row whose cells share the "h" ids with the other row, its own ids renamed to `name`. */
function row(
  out: Shape[],
  name: string,
  label: string,
  cells: PanelCell[],
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
  per: number,
): Bounds {
  const mine: Shape[] = [];
  const b = drawRow(mine, { id: 'h', label, labelW: 64, cells, x, y, roles, perRow: per });
  for (const s of mine)
    if (/^h-(label|empty|front|back)$/.test(s.id)) s.id = s.id.replace('h-', `${name}-`);
  out.push(...mine);
  return b;
}

function draw(
  step: Step<EulerState, EulerExtra>,
  settings: EulerSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const w = walkOf(g, settings.arrows);
  const top = r?.stack.at(-1)?.v;
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => (v === top ? 'current' : undefined)),
    edge: r && ((key) => (r.used[key] !== undefined ? 'tree' : undefined)),
    parent: (key) => r?.used[key],
    note: (v) => (w.directed ? `o${outDeg(w, v)} i${w.inDeg.get(v)}` : `d=${outDeg(w, v)}`),
    pointers: r
      ? [
          ...(r.start ? [{ name: 's', at: r.start }] : []),
          ...(top && top !== r.start ? [{ name: 'v', at: top, role: 'active' as MarkRole }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r && r.kind !== 'none') {
    const per = 10;
    const lines = Math.ceil(r.room / per);
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const room = (y: number) => ({
          x,
          y,
          w: 64 + Math.min(r.room, per) * 34,
          h: lines * 34 - 8,
        });
        const a = row(
          out,
          'stk',
          'stack',
          r.stack.map((c) => ({ key: c.uid, text: c.v, from: layout.pos[c.v] })),
          x,
          y0,
          roles,
          per,
        );
        const aBox = unionBounds(a, room(y0));
        const y1 = below(aBox, 12);
        const b = row(
          out,
          'cir',
          r.kind,
          r.circuit.map((c) => ({ key: c.uid, text: c.v, role: 'done' as MarkRole })),
          x,
          y1,
          roles,
          per,
        );
        return unionBounds(aBox, b, room(y1));
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
