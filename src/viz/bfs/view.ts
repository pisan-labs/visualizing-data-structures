/**
 * BFS: the graph, and under or beside it (whichever reads better) the queue and a table of
 * color (or visited), d and π.
 * During a run the vertices in the queue wear a dashed ring, the vertex being scanned is
 * marked u, finished vertices are green, discovered vertices carry their distance, tree edges
 * become arrows from parent to child, edges passed over turn dashed, and edges not looked at
 * yet are faint. A plain state (no run, as in practice pictures) draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
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
  type GraphLayout,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pickLayout } from '../../layouts/arrange';
import {
  describe,
  describeRun,
  dText,
  type BfsExtra,
  type BfsRun,
  type BfsSettings,
  type BfsState,
} from './model';

const COLOR_LETTER = { white: 'W', gray: 'G', black: 'B' } as const;

function look(r: BfsRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.queue.includes(v)) return 'frontier';
  if (r.color[v] === 'black') return 'done';
  return r.color[v] === 'gray' ? 'visited' : undefined;
}

export function view(
  step: Step<BfsState, BfsExtra>,
  settings: BfsSettings,
  stage?: StageSize,
): Scene {
  const layouts = layoutsFor(
    layoutGraph(step.state.graph, settings.layout),
    settings.layout,
    stage,
  );
  return pickLayout(
    stage,
    layouts.map((layout) => draw(step, settings, layout, stage)),
  );
}

function draw(
  step: Step<BfsState, BfsExtra>,
  settings: BfsSettings,
  layout: GraphLayout,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((key) => r.edges[key] ?? 'unexamined'),
    parent: (key) => {
      const [a, b] = key.split('-') as [string, string];
      return r?.pi[b] === a ? a : r?.pi[a] === b ? b : undefined;
    },
    note: r && ((v) => (r.d[v] === null ? undefined : `d=${r.d[v]}`)),
    pointers: r
      ? [
          { name: 's', at: r.s },
          ...(r.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
          ...(r.v ? [{ name: 'v', at: r.v }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const n = g.vertices.length;
    const flags = settings.marking === 'visited';
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
        const queue = drawRow(out, {
          id: 'q',
          label: 'Q',
          labelW: 44,
          cells: r.queue.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow: 12,
          ends: ['front', 'back'],
        });
        // Room for the longest the queue can get, so nothing moves as it grows.
        const room = { x, y: y0, w: 44 + Math.min(n, 12) * 34, h: 40 };
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y: below(unionBounds(queue, room), 14),
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'color',
              label: flags ? 'visited' : 'color',
              cells: g.vertices.map((v) => ({
                text: flags ? (r.color[v] === 'white' ? 'F' : 'T') : COLOR_LETTER[r.color[v]!],
              })),
            },
            {
              key: 'd',
              label: 'd',
              cells: g.vertices.map((v) => ({ text: dText(r.d[v] ?? null) })),
            },
            { key: 'pi', label: 'π', cells: g.vertices.map((v) => ({ text: r.pi[v] ?? '–' })) },
          ],
          roles,
        });
        return unionBounds(queue, room, table);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
