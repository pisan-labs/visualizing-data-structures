/**
 * Panels the shortest-path pages share, drawn with the same sizes and styles as the panels in
 * src/layouts/graph.ts.
 *
 *   drawKeyed(shapes, o)   a labeled row of two-line cells: a name over a value. A priority
 *                          queue (vertex over key), or the passes of Bellman-Ford (pass number
 *                          over the changes it made). Ids: `${id}-${key}` for a cell's box,
 *                          `${id}-${key}-n` and `${id}-${key}-t` for its two texts.
 *   distTable(...)         drawTable with a row of d and a row of π for every vertex.
 *   dText(d, neg)          "∞" (or "-∞") for null.
 */
import type { MarkRole } from '../../engine/types';
import { drawTable, textWidth, type Pt } from '../../layouts/graph';
import type { Bounds, Shape } from '../../render/scene';

export const KEYED_H = 42;
const LABEL_SIZE = 14;

export interface KeyedCell {
  /** Stable key: a vertex, a uid, a pass number. */
  key: string;
  /** Top line, bold: the vertex. */
  name: string;
  /** Bottom line: the key. */
  value: string;
  role?: MarkRole;
  /** Faded: an entry that no longer counts (a stale queue entry). */
  dim?: boolean;
  /** Where the cell slides in from the first time it appears. */
  from?: Pt;
}

export interface KeyedOptions {
  id: string;
  label: string;
  cells: KeyedCell[];
  x: number;
  y: number;
  roles?: ReadonlyMap<string, MarkRole>;
  /** Cells per line before wrapping. Default 10. */
  perRow?: number;
  /** Width of the label column. Default: the label's width. */
  labelW?: number;
  /** Keep room for this many cells, so what is drawn below does not move. */
  room?: number;
  /** A caption under the first cell, such as "min". */
  first?: string;
  /** Shown when there are no cells. Default "empty". */
  empty?: string;
  /** Width of every cell. Default: fits the longest text, at least 32. */
  cellW?: number;
}

export function keyedCellWidth(cells: { name: string; value: string }[], min = 32): number {
  return Math.max(
    min,
    ...cells.map((c) => Math.max(textWidth(c.name, 15), textWidth(c.value, 14, true)) + 12),
  );
}

/** A labeled row of cells with a name over a value. */
export function drawKeyed(shapes: Shape[], o: KeyedOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const labelW = o.labelW ?? textWidth(o.label, LABEL_SIZE, true) + 10;
  const w = o.cellW ?? keyedCellWidth(o.cells);
  const pitch = w + 4;
  const perRow = Math.max(1, o.perRow ?? 10);
  const caption = o.first ? 16 : 0;
  const linePitch = KEYED_H + 6 + caption;
  shapes.push({
    kind: 'text',
    id: `${o.id}-label`,
    x: o.x,
    y: o.y + KEYED_H / 2 + 5,
    text: o.label,
    size: LABEL_SIZE,
    cls: 'label',
    mono: true,
  });
  const x0 = o.x + labelW;
  if (o.cells.length === 0) {
    shapes.push({
      kind: 'text',
      id: `${o.id}-empty`,
      x: x0,
      y: o.y + KEYED_H / 2 + 5,
      text: o.empty ?? 'empty',
      size: 13,
      cls: 'label',
    });
  }
  o.cells.forEach((c, i) => {
    const x = x0 + (i % perRow) * pitch;
    const y = o.y + Math.floor(i / perRow) * linePitch;
    const rid = `${o.id}-${c.key}`;
    const role = roles.get(rid) ?? c.role;
    const opacity = c.dim ? 0.45 : undefined;
    shapes.push({
      kind: 'rect',
      id: rid,
      x,
      y,
      w,
      h: KEYED_H,
      r: 5,
      cls: 'live',
      role,
      opacity,
      enterFrom: c.from && { x: c.from.x - w / 2, y: c.from.y - KEYED_H / 2 },
    });
    const textRole = (sid: string) =>
      roles.get(sid) ?? (role === 'active' || role === 'error' ? role : undefined);
    shapes.push({
      kind: 'text',
      id: `${rid}-n`,
      x: x + w / 2,
      y: y + 17,
      text: c.name,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role: textRole(`${rid}-n`),
      opacity,
      enterFrom: c.from && { x: c.from.x, y: c.from.y },
    });
    shapes.push({
      kind: 'text',
      id: `${rid}-t`,
      x: x + w / 2,
      y: y + 35,
      text: c.value,
      size: c.value.length <= 3 ? 14 : 13,
      anchor: 'middle',
      mono: true,
      role: textRole(`${rid}-t`),
      opacity,
      enterFrom: c.from && { x: c.from.x, y: c.from.y + 14 },
    });
  });
  if (o.first && o.cells.length) {
    shapes.push({
      kind: 'text',
      id: `${o.id}-first`,
      x: x0 + w / 2,
      y: o.y + KEYED_H + 14,
      text: o.first,
      size: 13,
      anchor: 'middle',
      cls: 'label',
    });
  }
  const count = Math.max(o.cells.length, o.room ?? 0, 1);
  const lines = Math.ceil(count / perRow);
  const shown = Math.min(count, perRow);
  const emptyW = o.cells.length ? 0 : textWidth(o.empty ?? 'empty', 13);
  return {
    x: o.x,
    y: o.y,
    w: labelW + Math.max(shown * pitch - 4, emptyW),
    h: lines * linePitch - 6,
  };
}

export interface SplitOptions {
  id: string;
  x: number;
  y: number;
  /** The settled set S, in the order vertices joined it. */
  settled: KeyedCell[];
  /** The queue Q, smallest key first. */
  queue: KeyedCell[];
  roles?: ReadonlyMap<string, MarkRole>;
  cellW: number;
  /** Cells per line before wrapping. Default 9. */
  perRow?: number;
  /** Keep room for this many cells in all, so what is drawn below does not move. */
  room: number;
}

/**
 * S and Q in one row: "S", the settled vertices with their final d, a bar, "Q", and the queue
 * with its keys, smallest first ("min" under the front). With every vertex in Q at the start,
 * an extraction moves the bar one cell to the right: the front of Q becomes the end of S.
 * Cell ids: `${id}-${key}` (texts `-n` and `-t`); the bar is `${id}-bar`, the Q label
 * `${id}-q`.
 */
export function drawSplit(shapes: Shape[], o: SplitOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const perRow = Math.max(2, o.perRow ?? 9);
  const pitch = o.cellW + 4;
  const sW = 22;
  const qW = 30;
  const lineW = sW + qW + perRow * pitch;
  const linePitch = KEYED_H + 22;
  const label = (id: string, text: string, x: number, y: number) =>
    shapes.push({
      kind: 'text',
      id,
      x,
      y: y + KEYED_H / 2 + 5,
      text,
      size: LABEL_SIZE,
      cls: 'label',
      mono: true,
    });
  let x = o.x + sW;
  let y = o.y;
  label(`${o.id}-s`, 'S', o.x, y);
  const place = (w: number) => {
    if (x + w > o.x + lineW + 0.5) {
      x = o.x + sW;
      y += linePitch;
    }
    const at = { x, y };
    x += w;
    return at;
  };
  const cell = (c: KeyedCell, at: { x: number; y: number }) => {
    const one: Shape[] = [];
    drawKeyed(one, {
      id: o.id,
      label: '',
      labelW: 0,
      cells: [c],
      x: at.x,
      y: at.y,
      roles,
      cellW: o.cellW,
    });
    // Only the cell itself: drawKeyed's label is empty here.
    shapes.push(...one.filter((s) => s.id.startsWith(`${o.id}-${c.key}`)));
  };
  for (const c of o.settled) cell(c, place(pitch));
  // The bar and the Q label move together as S grows.
  const at = place(qW);
  shapes.push({
    kind: 'arrow',
    id: `${o.id}-bar`,
    x1: at.x + 2,
    y1: at.y - 2,
    x2: at.x + 2,
    y2: at.y + KEYED_H + 2,
    head: 'none',
  });
  label(`${o.id}-q`, 'Q', at.x + 9, at.y);
  if (o.queue.length === 0) {
    shapes.push({
      kind: 'text',
      id: `${o.id}-empty`,
      x: at.x + qW,
      y: at.y + KEYED_H / 2 + 5,
      text: 'empty',
      size: 13,
      cls: 'label',
    });
  }
  o.queue.forEach((c, i) => {
    const p = place(pitch);
    cell(c, p);
    if (i === 0) {
      shapes.push({
        kind: 'text',
        id: `${o.id}-min`,
        x: p.x + o.cellW / 2,
        y: p.y + KEYED_H + 14,
        text: 'min',
        size: 13,
        anchor: 'middle',
        cls: 'label',
      });
    }
  });
  const lines = Math.max(1, Math.ceil((o.room * pitch + qW) / (lineW - sW)));
  const used = sW + qW + Math.min(o.room, perRow) * pitch - 4;
  return { x: o.x, y: o.y, w: Math.max(used, x - o.x), h: lines * linePitch - 6 };
}

export const dText = (d: number | null | undefined, neg = false) =>
  d === null || d === undefined ? (neg ? '-∞' : '∞') : String(d);

export interface DistTableOptions {
  id: string;
  x: number;
  y: number;
  vertices: string[];
  d: Record<string, number | null>;
  pi: Record<string, string | null>;
  roles?: ReadonlyMap<string, MarkRole>;
  /** Unreached is -∞ (longest paths) instead of ∞. */
  neg?: boolean;
  perRow?: number;
  /** Vertices whose d is final, drawn green (with a thick outline). */
  final?(v: string): boolean;
}

/** Cell ids: `${id}-d-${v}` and `${id}-pi-${v}` (see drawTable). */
export function distTable(shapes: Shape[], o: DistTableOptions): Bounds {
  return drawTable(shapes, {
    id: o.id,
    x: o.x,
    y: o.y,
    columns: o.vertices,
    head: 'v',
    rows: [
      {
        key: 'd',
        label: 'd',
        cells: o.vertices.map((v) => ({
          text: dText(o.d[v], o.neg),
          role: o.final?.(v) ? ('done' as const) : undefined,
        })),
      },
      { key: 'pi', label: 'π', cells: o.vertices.map((v) => ({ text: o.pi[v] ?? '–' })) },
    ],
    roles: o.roles,
    perRow: o.perRow ?? 10,
  });
}

export const tableCell = (id: string, row: 'd' | 'pi', v: string) => `${id}-${row}-${v}`;
