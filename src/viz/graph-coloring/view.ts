/**
 * Graph coloring: the graph with each colored vertex filled in its color (a group color, with
 * the number in a badge, so color is never the only cue), and under or beside it the order
 * (vertices in the order they are colored, each cell in its color) and a table of color and
 * degree per vertex (and saturation for DSatur).
 *
 * The vertex being colored is marked v and drawn blue; the neighbour being looked at is u.
 * A plain state (no run) draws just the graph.
 */
import { groupRole, type MarkRole, type Step, type StageSize } from '../../engine/types';
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
  degreeOf,
  describe,
  describeRun,
  saturation,
  undirected,
  type ColoringExtra,
  type ColoringRun,
  type ColoringSettings,
  type ColoringState,
} from './model';

/** Color k (from 1) is group color k; the badge and the table carry the number. */
export const colorRole = (k: number): MarkRole => groupRole(k);

export function view(
  step: Step<ColoringState, ColoringExtra>,
  settings: ColoringSettings,
  stage?: StageSize,
): Scene {
  const layout = layoutGraph(step.state.graph, settings.layout);
  return pickLayout(
    stage,
    layoutsFor(layout, settings.layout, stage).map((l) => draw(step, settings, l, stage)),
  );
}

function draw(
  step: Step<ColoringState, ColoringExtra>,
  settings: ColoringSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r: ColoringRun | undefined = extra.run;
  const roles = new Map<string, MarkRole>();
  if (r) for (const v of g.vertices) if (r.color[v]) roles.set(vertexId(v), colorRole(r.color[v]!));
  for (const m of step.marks) roles.set(m.id, m.role);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => (v === r.u ? 'current' : undefined)),
    edge: r && (() => 'unexamined'),
    weights: false,
    note: r && ((v) => (r.color[v] ? `c${r.color[v]}` : undefined)),
    pointers: r
      ? [
          ...(r.u ? [{ name: 'v', at: r.u, role: 'active' as MarkRole }] : []),
          ...(r.v ? [{ name: 'u', at: r.v }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const ug = undirected(g);
    const ds = r.order === 'dsatur';
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const row = drawRow(out, {
          id: 'ord',
          label: 'order',
          labelW: 58,
          cells: r.plan.map((v) => ({
            key: v,
            text: v,
            role: r.color[v] ? colorRole(r.color[v]!) : undefined,
          })),
          x,
          y: y0,
          roles,
          perRow: 8,
          empty: 'picked as it goes',
        });
        // Room for the whole order, so nothing below moves as DSatur adds to it.
        const n = g.vertices.length;
        const room = { x, y: y0, w: 58 + Math.min(n, 8) * 34, h: n > 8 ? 60 : 26 };
        const rows = [
          {
            key: 'c',
            label: 'color',
            cells: g.vertices.map((v) => ({
              text: r.color[v] ? String(r.color[v]) : '–',
              role: r.color[v] ? colorRole(r.color[v]!) : undefined,
            })),
          },
          {
            key: 'deg',
            label: 'deg',
            cells: g.vertices.map((v) => ({ text: String(degreeOf(ug, v)) })),
          },
          ...(ds
            ? [
                {
                  key: 'sat',
                  label: 'sat',
                  cells: g.vertices.map((v) => ({
                    text: r.color[v] ? '–' : String(saturation(ug, r.color, v)),
                  })),
                },
              ]
            : []),
        ];
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(unionBounds(row, room), 14),
          columns: g.vertices,
          head: 'v',
          rows,
          roles,
          perRow: 8,
        });
        return unionBounds(row, room, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
