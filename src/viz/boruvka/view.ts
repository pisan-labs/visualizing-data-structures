/**
 * Borůvka: the graph, and under or beside it this round's picks (each component's cheapest
 * edge out), the tree T so far, and a table naming each vertex's component.
 *
 * Every component of two or more vertices has its own group color (the table names it too, so
 * color is never the only cue). Tree edges are solid green with green weights, the edge being
 * looked at is blue, and edges not in the tree are faint once the run starts. A plain state (no
 * run) draws just the graph.
 */
import { groupRole, type MarkRole, type Step, type StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  below,
  drawGraph,
  drawRow,
  drawTable,
  edgeId,
  layoutGraph,
  layoutsFor,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
  vertexId,
  weightId,
  type GraphLayout,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { keyOf } from '../_graph/graph';
import {
  compNames,
  describe,
  describeRun,
  type BoruvkaExtra,
  type BoruvkaRun,
  type BoruvkaSettings,
  type BoruvkaState,
} from './model';

export function view(
  step: Step<BoruvkaState, BoruvkaExtra>,
  settings: BoruvkaSettings,
  stage?: StageSize,
): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, l, stage)),
  );
}

function draw(
  step: Step<BoruvkaState, BoruvkaExtra>,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r: BoruvkaRun | undefined = extra.run;
  const roles = new Map<string, MarkRole>();
  const inT = new Set(r?.T ?? []);
  const number = new Map<string, number>();
  if (r) {
    const names = compNames(g, r.comp);
    const size = (c: string) => g.vertices.filter((v) => r.comp[v] === c).length;
    let k = 0;
    for (const c of names) if (size(c) > 1) number.set(c, ++k);
    for (const v of g.vertices) {
      const n = number.get(r.comp[v]!);
      if (n) roles.set(vertexId(v), groupRole(n));
    }
    for (const key of inT) {
      roles.set(edgeId(key), 'done');
      roles.set(weightId(key), 'done');
    }
  }
  for (const m of step.marks) roles.set(m.id, m.role);
  const drawn = drawGraph(g, layout, {
    roles,
    edge: r && ((key) => (inT.has(key) ? undefined : 'unexamined')),
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const text = (k: string) => {
      const e = g.edges.find((x) => keyOf(x) === k)!;
      return `${e.u}-${e.v}:${e.w}`;
    };
    const cellW = Math.max(44, ...g.edges.map((e) => textWidth(text(keyOf(e)), 15, true) + 12));
    const per = 4;
    const most = Math.max(1, g.vertices.length - 1);
    const picks = [...new Set(g.vertices.flatMap((c) => (r.pick[c] ? [r.pick[c]!] : [])))];
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        // Rows keep room for V − 1 edges, so the table below never moves.
        const room = (y: number) => ({
          x,
          y,
          w: 54 + Math.min(most, per) * (cellW + 4),
          h: Math.ceil(most / per) * 34 - 8,
        });
        const p = drawRow(out, {
          id: 'pk',
          label: 'picks',
          labelW: 54,
          cells: picks.map((k) => ({ key: k, text: text(k), role: 'active' as MarkRole })),
          x,
          y: y0,
          roles,
          perRow: per,
          cellW,
          empty: r.final ? 'none' : 'scanning…',
        });
        const pBox = unionBounds(p, room(y0));
        const y1 = below(pBox, 10);
        const t = drawRow(out, {
          id: 'T',
          label: 'T',
          labelW: 54,
          cells: r.T.map((k) => ({ key: k, text: text(k), role: 'done' as MarkRole })),
          x,
          y: y1,
          roles,
          perRow: per,
          cellW,
        });
        const tBox = unionBounds(t, room(y1));
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(tBox, 14),
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'c',
              label: 'comp',
              cells: g.vertices.map((v) => {
                const n = number.get(r.comp[v]!);
                return { text: r.comp[v]!, role: n ? groupRole(n) : undefined };
              }),
            },
          ],
          roles,
          perRow: 8,
        });
        return unionBounds(pBox, tBox, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
