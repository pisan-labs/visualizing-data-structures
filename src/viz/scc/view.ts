/**
 * Strongly connected components: the graph (its transpose during Kosaraju's second pass), and
 * beside or under it the open calls, the finished stack (Kosaraju) or Tarjan's stack, a table of
 * d and f (or d and low), the components found so far, and the component graph when
 * `condense` is on.
 *
 * Each component gets a color from a small palette, and its number shows in the components row
 * and in the component graph, so color is never the only cue. Gray vertices wear a dashed ring,
 * u is the vertex being explored, tree edges are arrows, edges looked at are dashed and the
 * rest are faint. When the run is done, arcs between components are dashed. A plain state (no
 * run, as in practice pictures) draws just the graph.
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
  translate,
  unionBounds,
  type EdgeLook,
  type GraphLayout,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Graph } from '../_graph/graph';
import {
  condensation,
  describe,
  describeRun,
  transpose,
  type SccExtra,
  type SccRun,
  type SccSettings,
  type SccState,
} from './model';

/** Component colors, in order; they repeat after five. */
export const PALETTE: MarkRole[] = ['found', 'visit', 'compare', 'done', 'remove'];
export const compRole = (k: number): MarkRole => PALETTE[k % PALETTE.length]!;

function look(r: SccRun, v: string): VertexLook | undefined {
  if (v === r.u) return 'current';
  if (r.calls.includes(v)) return 'frontier';
  if (r.phase === 'tarjan' && r.stack.includes(v)) return 'visited';
  if (r.comp[v] !== null) return undefined;
  return r.color[v] === 'black' ? 'done' : undefined;
}

function edgeLook(g: Graph, r: SccRun, key: string): EdgeLook | undefined {
  if (r.phase === 'done') {
    const [a, b] = key.split('-') as [string, string];
    return r.comp[a] === r.comp[b] ? undefined : 'seen';
  }
  if (r.phase === 'transpose') return undefined;
  if (r.tree[key]) return 'tree';
  if (r.seen[key]) return 'seen';
  return g.vertices.length ? 'unexamined' : undefined;
}

const compText = (c: string[], k: number) => `${k + 1}: ${c.join(' ')}`;

/** The components row: one cell per component, colored and numbered. */
function drawComps(
  out: Shape[],
  comps: string[][],
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
  cellW: number,
): Bounds {
  return drawRow(out, {
    id: 'scc',
    label: 'SCCs',
    labelW: 80,
    cells: comps.map((c, k) => ({ key: String(k), text: compText(c, k), role: compRole(k) })),
    x,
    y,
    roles,
    perRow: Math.max(1, Math.floor(300 / (cellW + 4))),
    cellW,
    empty: 'none yet',
  });
}

/** The component graph, its shapes renamed cd-..., drawn with its top left corner at (x, y). */
function drawCondensation(
  out: Shape[],
  g: Graph,
  final: string[][],
  found: number,
  x: number,
  y: number,
): Bounds {
  const cond = condensation(g, final);
  // Layers left to right instead of top to bottom, so the picture stays short.
  const tall = layoutGraph(cond, 'layered');
  const layout: GraphLayout = {
    r: tall.r,
    pos: Object.fromEntries(Object.entries(tall.pos).map(([v, p]) => [v, { x: p.y, y: p.x }])),
    bounds: { x: tall.bounds.y, y: tall.bounds.x, w: tall.bounds.h, h: tall.bounds.w },
  };
  const roles = new Map<string, MarkRole>(cond.vertices.map((v, k) => [`vx-${v}`, compRole(k)]));
  const known = (v: string) => Number(v) <= found;
  const drawn = drawGraph(cond, layout, {
    roles: new Map([...roles].filter(([id]) => known(id.slice(3)))),
    fade: (v) => (known(v) ? undefined : 0.25),
    edge: (key) => {
      const [a, b] = key.split('-') as [string, string];
      return known(a) && known(b) ? undefined : 'unexamined';
    },
  });
  out.push({
    kind: 'text',
    id: 'cd-label',
    x,
    y: y + 13,
    text: 'component graph (a DAG)',
    size: 13,
    cls: 'label',
  });
  const top = y + 36;
  const dx = x + 80 - drawn.bounds.x;
  const dy = top - drawn.bounds.y;
  for (const s of translate(drawn.shapes, dx, dy)) out.push({ ...s, id: `cd-${s.id}` });
  return unionBounds(
    { x, y, w: 200, h: 16 },
    { ...drawn.bounds, x: drawn.bounds.x + dx, y: drawn.bounds.y + dy },
  );
}

export function view(step: Step<SccState, SccExtra>, settings: SccSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const marks = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const roles = new Map<string, MarkRole>();
  if (r)
    for (const v of g.vertices) if (r.comp[v] !== null) roles.set(`vx-${v}`, compRole(r.comp[v]!));
  for (const [id, role] of marks) roles.set(id, role);
  const layout = layoutGraph(g, settings.layout);
  const flipped = r && (r.phase === 'transpose' || r.phase === 'second');
  const shown = flipped ? transpose(g) : g;
  const tarjan = r?.algorithm === 'tarjan';
  const drawn = drawGraph(shown, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    edge: r && ((key) => edgeLook(shown, r, key)),
    parent: (key) => {
      const [a, b] = key.split('-') as [string, string];
      return r?.pi[b] === a ? a : r?.pi[a] === b ? b : undefined;
    },
    note:
      r &&
      ((v) => {
        if (r.d[v] === null) return undefined;
        const second = tarjan ? r.low[v] : r.f[v];
        return `${r.d[v]}/${second ?? ''}`;
      }),
    pointers: r
      ? [
          ...(r.u ? [{ name: 'u', at: r.u, role: 'active' as MarkRole }] : []),
          ...(r.v ? [{ name: 'v', at: r.v }] : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const n = g.vertices.length;
    const final = extra.final ?? r.comps;
    boxes.push(
      placePanels(shapes, drawn.bounds, (out, x, y0) => {
        const labelW = 80;
        const perRow = 10;
        const rows = Math.max(1, Math.ceil(n / perRow));
        const rowW = labelW + Math.min(Math.max(n, 1), perRow) * 34;
        const room = (y: number) => ({ x, y, w: rowW, h: rows * 46 - 2 });
        const calls = drawRow(out, {
          id: 'cs',
          label: 'calls',
          labelW,
          cells: r.calls.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
          x,
          y: y0,
          roles,
          perRow,
          cellW: 30,
          ends: ['bottom', 'top'],
        });
        let y = below(unionBounds(calls, room(y0)), 12);
        const yStack = y;
        const stack = tarjan
          ? drawRow(out, {
              id: 'S',
              label: 'stack',
              labelW,
              cells: r.stack.map((v) => ({ key: v, text: v, from: layout.pos[v] })),
              x,
              y,
              roles,
              perRow,
              cellW: 30,
              ends: ['bottom', 'top'],
            })
          : drawRow(out, {
              id: 'F',
              label: 'finished',
              labelW,
              cells: r.finished.map((v) => ({
                key: v,
                text: v,
                from: layout.pos[v],
                dim: r.comp[v] !== null,
              })),
              x,
              y,
              roles,
              perRow,
              cellW: 30,
              ends: ['first', 'last'],
            });
        y = below(unionBounds(stack, room(yStack)), 12);
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
            tarjan
              ? {
                  key: 'low',
                  label: 'low',
                  cells: g.vertices.map((v) => ({ text: String(r.low[v] ?? '') })),
                }
              : {
                  key: 'f',
                  label: 'f',
                  cells: g.vertices.map((v) => ({ text: String(r.f[v] ?? '') })),
                },
          ],
          roles,
        });
        y = below(table, 12);
        // Every cell as wide as the widest final component, so the row does not reflow.
        const cellW = Math.max(40, ...final.map((c, k) => compText(c, k).length * 8.2 + 14));
        const scratch: Shape[] = [];
        const roomC = drawComps(scratch, final, x, y, new Map(), cellW);
        const comps = drawComps(out, r.comps, x, y, roles, cellW);
        y = below(unionBounds(comps, roomC), 10);
        const parts: Bounds[] = [calls, room(y0), stack, room(yStack), table, comps, roomC];
        if (settings.condense && final.length > 0) {
          const cond = drawCondensation(out, g, final, r.comps.length, x, y);
          parts.push(cond);
          y = below(cond, 8);
        }
        const width = Math.max(table.w, rowW, 300);
        const legend = drawLegend(out, {
          id: 'key',
          items: [
            tarjan ? 'badge d/low' : 'badge d/f',
            '→ tree edge',
            '- - looked at',
            ...(flipped ? ['arcs reversed: G^T'] : []),
          ],
          x,
          y,
          maxW: width,
        });
        parts.push(legend);
        return unionBounds(...parts);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
