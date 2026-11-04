/**
 * DFS: the graph, and beside or under it (whichever reads better) the call stack or the
 * explicit stack, a table of d, f and π, the parentheses in time order, and a key to the edge
 * letters. During a run gray vertices (still being explored) wear a dashed ring, the vertex
 * being explored is marked u, finished vertices are green, each discovered vertex carries d/f,
 * tree edges become arrows from parent to child, other edges get a dash and their letter (B
 * back, F forward, C cross), and edges not explored yet are faint. A plain state (no run, as
 * in practice pictures) draws just the graph.
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
  textWidth,
  unionBounds,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Graph } from '../_graph/graph';
import {
  describe,
  describeRun,
  parens,
  type DfsExtra,
  type DfsRun,
  type DfsSettings,
  type DfsState,
} from './model';

function look(r: DfsRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.color[v] === 'gray') return 'frontier';
  return r.color[v] === 'black' ? 'done' : undefined;
}

const PAREN_SIZE = 14;
const PAREN_CH = PAREN_SIZE * 0.6;
const PAREN_LABEL_W = textWidth('nesting', 14, true) + 10;

/** Where each token goes when the parentheses wrap at maxW: rows of [token, x offset]. */
function wrapTokens(tokens: string[], maxW: number): [string, number][][] {
  const rows: [string, number][][] = [[]];
  let cx = PAREN_LABEL_W;
  for (const t of tokens) {
    const w = t.length * PAREN_CH;
    if (cx > PAREN_LABEL_W && cx + w > maxW) {
      rows.push([]);
      cx = PAREN_LABEL_W;
    }
    rows.at(-1)!.push([t, cx]);
    cx += w + PAREN_CH;
  }
  return rows;
}

/**
 * The parentheses in time order, one shape per token, wrapping at maxW. The box keeps room for
 * all of them (every vertex opens and closes once), so it does not grow during the run.
 */
function drawParens(
  shapes: Shape[],
  g: Graph,
  r: DfsRun,
  x: number,
  y: number,
  maxW: number,
): Bounds {
  const pitch = PAREN_SIZE + 8;
  shapes.push({
    kind: 'text',
    id: 'par-label',
    x,
    y: y + 14,
    text: 'nesting',
    size: 14,
    cls: 'label',
    mono: true,
  });
  const tokens = parens(g, r);
  wrapTokens(tokens, maxW).forEach((row, k) => {
    for (const [t, dx] of row) {
      const v = t.replace(/[()]/g, '');
      const open = t.startsWith('(');
      shapes.push({
        kind: 'text',
        id: `par-${open ? 'o' : 'c'}-${v}`,
        x: x + dx,
        y: y + k * pitch + 14,
        text: t,
        size: PAREN_SIZE,
        mono: true,
        weight: 'bold',
        role: v === r.u ? 'active' : r.color[v] === 'black' ? 'done' : undefined,
      });
    }
  });
  if (tokens.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'par-empty',
      x: x + PAREN_LABEL_W,
      y: y + 14,
      text: 'nothing yet',
      size: 13,
      cls: 'label',
    });
  }
  const all = g.vertices.flatMap((v) => [`(${v}`, `${v})`]);
  const lines = wrapTokens(all, maxW).length;
  return { x, y, w: maxW, h: (lines - 1) * pitch + PAREN_SIZE + 6 };
}

export function view(step: Step<DfsState, DfsExtra>, settings: DfsSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const layout = layoutGraph(g, settings.layout);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((key) => r.edges[key] ?? 'unexamined'),
    parent: (key) => {
      const [a, b] = key.split('-') as [string, string];
      return r?.pi[b] === a ? a : r?.pi[a] === b ? b : undefined;
    },
    note: r && ((v) => (r.d[v] === null ? undefined : `${r.d[v]}/${r.f[v] ?? ''}`)),
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
    const recursive = settings.style === 'recursive';
    boxes.push(
      placePanels(shapes, drawn.bounds, (out, x, y0) => {
        const cells = recursive
          ? r.calls.map((v) => ({ key: v, text: v, from: layout.pos[v] }))
          : r.stack.map((e) => ({
              key: String(e.uid),
              text: e.from ? `${e.v}←${e.from}` : e.v,
              from: layout.pos[e.from ?? e.v],
            }));
        const labelW = 62;
        const perRow = recursive ? 12 : 9;
        const stack = drawRow(out, {
          id: recursive ? 'cs' : 'st',
          label: recursive ? 'calls' : 'stack',
          labelW,
          cells,
          x,
          y: y0,
          roles,
          perRow,
          cellW: recursive ? 30 : 42,
          ends: ['bottom', 'top'],
        });
        // Room for as many rows as the stack can need, so nothing below it moves.
        const most = recursive ? n : Math.min(g.edges.length + 1, 3 * perRow);
        const rows = Math.max(1, Math.ceil(most / perRow));
        const rowW = labelW + Math.min(most, perRow) * (recursive ? 34 : 46);
        const room = { x, y: y0, w: rowW, h: rows * 46 - 2 };
        let y = below(unionBounds(stack, room), 12);
        const table = drawTable(out, {
          id: 'tbl',
          x,
          y,
          columns: g.vertices,
          head: 'v',
          rows: [
            {
              key: 'd',
              label: 'd',
              cells: g.vertices.map((v) => ({ text: String(r.d[v] ?? '') })),
            },
            {
              key: 'f',
              label: 'f',
              cells: g.vertices.map((v) => ({ text: String(r.f[v] ?? '') })),
            },
            { key: 'pi', label: 'π', cells: g.vertices.map((v) => ({ text: r.pi[v] ?? '–' })) },
          ],
          roles,
        });
        const width = Math.max(table.w, rowW, 300);
        y = below(table, 14);
        const nesting = drawParens(out, g, r, x, y, width);
        const legend = drawLegend(out, {
          id: 'key',
          items: g.directed
            ? ['→ tree edge', 'B back', 'F forward', 'C cross']
            : ['→ tree edge', 'B back edge'],
          x,
          y: below(nesting, 8),
          maxW: width,
        });
        return unionBounds(stack, room, table, nesting, legend);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(g, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
