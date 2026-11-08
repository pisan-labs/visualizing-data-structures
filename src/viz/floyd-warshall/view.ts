/**
 * Floyd-Warshall: the graph, and under or beside it (whichever reads better) the distance
 * matrix D and, beside it, the path matrix Π (or next). During a round, k's row and column
 * headers are blue and k is marked in the graph; the cell being updated is blue and the two
 * cells it reads, D[i][k] and D[k][j], are orange. A negative entry on the diagonal is red: a
 * negative cycle. Reading a path marks the cells it reads and, at the end, the path's edges,
 * and lists the path under the matrices. A plain state draws just the graph.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import {
  below,
  beside,
  drawGraph,
  drawRow,
  layoutGraph,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { dist } from '../_paths/kit';
import { describe, describeRun, type FwExtra, type FwSettings, type FwState } from './model';

interface MatrixOptions {
  id: string;
  title: string;
  names: string[];
  cells: string[][];
  x: number;
  y: number;
  cw: number;
  roles: ReadonlyMap<string, MarkRole>;
  /** A role a cell keeps, such as a negative diagonal entry. */
  role?(i: number, j: number): MarkRole | undefined;
}

const CH = 26;

/**
 * An n x n matrix with a title, column headers above and row headers to the left. Ids: cell
 * `${id}:${row}:${col}` (its text `-t`), headers `${id}r:${row}` and `${id}c:${col}`. Vertex
 * names never hold a colon, so no two ids collide.
 */
function drawMatrix(shapes: Shape[], o: MatrixOptions): Bounds {
  const headW = Math.max(20, ...o.names.map((v) => textWidth(v, 15) + 8));
  shapes.push({
    kind: 'text',
    id: `${o.id}-title`,
    x: o.x,
    y: o.y + 14,
    text: o.title,
    size: 15,
    weight: 'bold',
    mono: true,
    cls: 'label',
  });
  const y0 = o.y + 22;
  o.names.forEach((v, j) => {
    const id = `${o.id}c:${v}`;
    shapes.push({
      kind: 'text',
      id,
      x: o.x + headW + j * o.cw + o.cw / 2,
      y: y0 + 14,
      text: v,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role: o.roles.get(id),
    });
  });
  o.names.forEach((u, i) => {
    const y = y0 + 20 + i * CH;
    const rid = `${o.id}r:${u}`;
    shapes.push({
      kind: 'text',
      id: rid,
      x: o.x + headW - 6,
      y: y + CH / 2 + 5,
      text: u,
      size: 15,
      anchor: 'end',
      weight: 'bold',
      role: o.roles.get(rid),
    });
    o.names.forEach((v, j) => {
      const id = `${o.id}:${u}:${v}`;
      const role = o.roles.get(id) ?? o.role?.(i, j);
      const text = o.cells[i]![j]!;
      shapes.push({
        kind: 'rect',
        id,
        x: o.x + headW + j * o.cw,
        y,
        w: o.cw,
        h: CH,
        r: 0,
        cls: 'live',
        role,
        opacity: i === j && role === undefined ? 0.75 : undefined,
      });
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: o.x + headW + j * o.cw + o.cw / 2,
        y: y + CH / 2 + 5,
        text,
        size: text.length <= 3 ? 15 : 13,
        anchor: 'middle',
        mono: true,
        cls: text === '∞' || text === '–' ? 'label' : undefined,
        role: o.roles.get(`${id}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
      });
    });
  });
  return { x: o.x, y: o.y, w: headW + o.names.length * o.cw, h: 22 + 20 + o.names.length * CH };
}

/** A cell width that fits every distance this graph can have without a negative cycle. */
function matrixCellWidth(g: FwState['graph']): number {
  const ws = g.edges.map((e) => Math.abs(e.w)).sort((a, b) => b - a);
  const most = ws.slice(0, Math.max(0, g.vertices.length - 1)).reduce((a, b) => a + b, 0);
  const neg = g.edges.some((e) => e.w < 0) ? '-' : '';
  return Math.max(30, textWidth(`${neg}${most}`, 15, true) + 10);
}

export function view(step: Step<FwState, FwExtra>, settings: FwSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const V = g.vertices;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const p = extra.path;
  const layout = layoutGraph(g, settings.layout);
  const n = V.length;
  const K = r && r.k >= 0 && r.k < n ? V[r.k] : undefined;
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: (v) => (v === K ? 'current' : p?.path.includes(v) ? 'visited' : undefined),
    pointers: r
      ? [
          ...(K ? [{ name: 'k', at: K, role: 'active' as MarkRole }] : []),
          ...(r.i >= 0 ? [{ name: 'i', at: V[r.i]! }] : []),
          ...(r.j >= 0 ? [{ name: 'j', at: V[r.j]! }] : []),
          ...(p
            ? [
                { name: 'i', at: p.from },
                { name: 'j', at: p.to },
              ]
            : []),
        ]
      : [],
  });
  const shapes: Shape[] = [...drawn.shapes];
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    const cw = Math.max(
      matrixCellWidth(g),
      ...r.D.flat().map((d) => textWidth(dist(d), 13, true) + 10),
    );
    // D and Π side by side, or Π under D: each goes under or beside the graph, and the
    // arrangement that reads better on both a laptop and a phone wins. Sizes do not change
    // during a run, so neither does the choice.
    const block =
      (stacked: boolean) =>
      (out: Shape[], x: number, y: number): Bounds => {
        const D = drawMatrix(out, {
          id: 'D',
          title: 'D',
          names: V,
          cells: r.D.map((row) => row.map((d) => dist(d))),
          x,
          y,
          cw,
          roles,
          role: (i, j) => (i === j && r.D[i]![i]! < 0 ? 'error' : undefined),
        });
        const P = drawMatrix(out, {
          id: 'P',
          title: r.next ? 'next' : 'Π',
          names: V,
          cells: r.P.map((row) => row.map((v) => v ?? '–')),
          x: stacked ? x : beside(D, 20),
          y: stacked ? below(D, 12) : y,
          cw: Math.max(30, ...V.map((v) => textWidth(v, 15, true) + 10)),
          roles,
        });
        const parts = [D, P];
        if (p) {
          parts.push(
            drawRow(out, {
              id: 'path',
              label: 'path',
              labelW: 50,
              cells: p.path.map((v) => ({
                key: v,
                text: v,
                from: layout.pos[v],
                role: p.done ? ('active' as const) : undefined,
              })),
              x,
              y: below(unionBounds(D, P), 14),
              roles,
              perRow: 12,
            }),
          );
        }
        return unionBounds(...parts);
      };
    // The matrices side by side, or D over Π if that draws clearly larger.
    const best = pickBest(
      [false, true].map((stacked) => {
        const out: Shape[] = [];
        const at = placePanels(out, drawn.bounds, stage, block(stacked));
        return { shapes: out, at, bounds: unionBounds(drawn.bounds, at) };
      }),
      stage,
    );
    shapes.push(...best.shapes);
    boxes.push(best.at);
  }
  const label = r ? `${describe(state)} ${describeRun(g, r, p)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
