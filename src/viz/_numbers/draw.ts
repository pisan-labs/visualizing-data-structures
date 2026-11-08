/**
 * Small drawing helpers shared by the number and randomized pages (euclid, mod-pow, sieve, rsa,
 * karatsuba, fft, fisher-yates, reservoir-sampling).
 *
 *   txt, box             one text or one box, with the defaults these pages use
 *   drawTable            a table of rows under a header row; a cell's box and text share its role
 *   drawLines            a block of left-aligned text lines
 *   drawCounts           a bar chart of counts over many trials, with the even share dashed
 *   stackParts / sideParts  the two usual arrangements of a page's parts, for pickLayout
 *
 * Text is monospace, so its width is predictable (0.6 em per character).
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { unionBounds } from '../../layouts/calls';
import type { Bounds, RectShape, Shape, TextShape } from '../../render/scene';

export const monoW = (text: string, size: number) => [...text].length * size * 0.6;

export function txt(
  id: string,
  x: number,
  y: number,
  text: string,
  size: number,
  o: Partial<TextShape> = {},
): TextShape {
  return { kind: 'text', id, x, y, text, size, mono: true, ...o };
}

export function box(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  o: Partial<RectShape> = {},
): RectShape {
  return { kind: 'rect', id, x, y, w, h, r: 3, cls: 'live', ...o };
}

/** Baseline that centers a text of this size in a box from y to y + h. */
export const mid = (y: number, h: number, size: number) => y + h / 2 + size * 0.36;

export interface Col {
  key: string;
  head: string;
  w: number;
}

export interface TableCell {
  text: string;
  role?: MarkRole;
  /** Slide in from this point (the center of the cell the value comes from). */
  from?: { x: number; y: number };
  /** No box, only the text (a row label). */
  bare?: boolean;
  bold?: boolean;
}

export interface TableOptions {
  size: number;
  rowH: number;
  /** Rows to reserve room for, so the camera holds still as rows come. */
  room: number;
  roles: ReadonlyMap<string, MarkRole>;
  /** Header font size. Default size - 1. */
  headSize?: number;
}

export interface TableDrawing {
  shapes: Shape[];
  bounds: Bounds;
  /** Center of a cell. */
  at(r: number, key: string): { x: number; y: number };
}

export const cellId = (prefix: string, r: number, key: string) => `${prefix}-${r}-${key}`;

/**
 * Rows under a header row. Cell ids are `<prefix>-<r>-<key>` (box) and `...-t` (its text);
 * a mark on the box colors the text too. Header ids are `<prefix>-h-<key>`.
 */
export function drawTable(
  prefix: string,
  x: number,
  y: number,
  cols: readonly Col[],
  rows: readonly Readonly<Record<string, TableCell | null | undefined>>[],
  o: TableOptions,
): TableDrawing {
  const shapes: Shape[] = [];
  const hs = o.headSize ?? o.size - 1;
  const lefts: Record<string, number> = {};
  let cx = x;
  for (const c of cols) {
    lefts[c.key] = cx;
    cx += c.w;
  }
  const headH = Math.round(hs * 1.7);
  const at = (r: number, key: string) => ({
    x: lefts[key]! + cols.find((c) => c.key === key)!.w / 2,
    y: y + headH + r * o.rowH + o.rowH / 2,
  });
  for (const c of cols) {
    if (!c.head) continue;
    shapes.push(
      txt(`${prefix}-h-${c.key}`, lefts[c.key]! + c.w / 2, y + headH - hs * 0.5, c.head, hs, {
        anchor: 'middle',
        cls: 'label',
      }),
    );
  }
  rows.forEach((row, r) => {
    for (const c of cols) {
      const cell = row[c.key];
      if (!cell) continue;
      const id = cellId(prefix, r, c.key);
      const role = o.roles.get(id) ?? cell.role;
      const top = y + headH + r * o.rowH;
      const from = cell.from && { x: cell.from.x - (c.w - 4) / 2, y: cell.from.y - o.rowH / 2 + 2 };
      if (!cell.bare)
        shapes.push(
          box(id, lefts[c.key]! + 2, top + 2, c.w - 4, o.rowH - 4, { role, enterFrom: from }),
        );
      if (cell.text !== '') {
        const p = at(r, c.key);
        const size = Math.min(o.size, ((c.w - 8) / Math.max(1, [...cell.text].length)) * (1 / 0.6));
        shapes.push(
          txt(`${id}-t`, p.x, mid(top, o.rowH, size), cell.text, size, {
            anchor: 'middle',
            weight: cell.bold ? 'bold' : 'normal',
            role: o.roles.get(`${id}-t`) ?? role,
            cls: cell.bare ? 'label' : undefined,
            enterFrom: cell.from && { x: cell.from.x, y: cell.from.y + size * 0.36 },
          }),
        );
      }
    }
  });
  const w = cx - x;
  const h = headH + Math.max(o.room, rows.length) * o.rowH;
  return { shapes, bounds: { x, y, w, h }, at };
}

/** Left-aligned lines of text; ids `<prefix>-<k>`. Returns the shapes and their box. */
export function drawLines(
  prefix: string,
  x: number,
  y: number,
  lines: readonly (string | { text: string; role?: MarkRole; bold?: boolean })[],
  size: number,
  o: { gap?: number; room?: number; width?: number } = {},
): { shapes: Shape[]; bounds: Bounds } {
  const step = size * (o.gap ?? 1.5);
  const shapes: Shape[] = [];
  let w = o.width ?? 0;
  lines.forEach((l, k) => {
    const line = typeof l === 'string' ? { text: l } : l;
    w = Math.max(w, monoW(line.text, size));
    if (!line.text) return;
    shapes.push(
      txt(`${prefix}-${k}`, x, y + size + k * step, line.text, size, {
        role: line.role,
        weight: line.bold ? 'bold' : 'normal',
      }),
    );
  });
  const n = Math.max(o.room ?? 0, lines.length);
  return { shapes, bounds: { x, y, w, h: n ? size * 0.4 + n * step : 0 } };
}

export interface CountsOptions {
  /** Height of the tallest possible bar. */
  h: number;
  barW: number;
  gap: number;
  size: number;
  title: string;
  roles: ReadonlyMap<string, MarkRole>;
  /** Bars to color, by index. */
  highlight?: ReadonlyMap<number, MarkRole>;
}

/**
 * A bar chart of counts: one bar per label, the count over it, the label under it, and the
 * count every bar would have if all were equally likely as a dashed line. Ids `<prefix>-bar-k`,
 * `<prefix>-n-k`, `<prefix>-lab-k`, `<prefix>-even`, `<prefix>-title`.
 */
export function drawCounts(
  prefix: string,
  x: number,
  y: number,
  labels: readonly string[],
  counts: readonly number[],
  even: number | null,
  o: CountsOptions,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const titleH = o.size * 1.8;
  const top = y + titleH + o.size * 1.3;
  const max = Math.max(1, ...counts, even ?? 0) * 1.08;
  const base = top + o.h;
  const w = labels.length * (o.barW + o.gap) - o.gap;
  shapes.push(txt(`${prefix}-title`, x, y + o.size, o.title, o.size, { cls: 'label' }));
  shapes.push({
    kind: 'arrow',
    id: `${prefix}-axis`,
    x1: x - 4,
    y1: base,
    x2: x + w + 4,
    y2: base,
    head: 'none',
  });
  labels.forEach((label, k) => {
    const bx = x + k * (o.barW + o.gap);
    const c = counts[k] ?? 0;
    const bh = Math.max(c > 0 ? 2 : 0, (c / max) * o.h);
    const role = o.roles.get(`${prefix}-bar-${k}`) ?? o.highlight?.get(k);
    shapes.push(box(`${prefix}-bar-${k}`, bx, base - bh, o.barW, bh, { r: 1, role }));
    shapes.push(
      txt(`${prefix}-n-${k}`, bx + o.barW / 2, base - bh - 5, String(c), o.size, {
        anchor: 'middle',
        role,
      }),
    );
    shapes.push(
      txt(`${prefix}-lab-${k}`, bx + o.barW / 2, base + o.size * 1.25, label, o.size, {
        anchor: 'middle',
        cls: 'label',
      }),
    );
  });
  if (even !== null && even > 0) {
    const ey = base - (even / max) * o.h;
    shapes.push({
      kind: 'arrow',
      id: `${prefix}-even`,
      x1: x - 4,
      y1: ey,
      x2: x + w + 4,
      y2: ey,
      head: 'none',
      dashed: true,
      role: 'found',
    });
  }
  const width = Math.max(w, monoW(o.title, o.size));
  return { shapes, bounds: { x: x - 4, y, w: width + 8, h: base + o.size * 1.6 - y } };
}

/** Move shapes by (dx, dy), the place they slide in from included. */
export function shift(shapes: Shape[], dx: number, dy: number): Shape[] {
  if (!dx && !dy) return shapes;
  return shapes.map((s) => {
    const from = s.enterFrom ? { enterFrom: { x: s.enterFrom.x + dx, y: s.enterFrom.y + dy } } : {};
    if (s.kind === 'arrow')
      return {
        ...s,
        x1: s.x1 + dx,
        y1: s.y1 + dy,
        x2: s.x2 + dx,
        y2: s.y2 + dy,
        ...(s.via ? { via: { x: s.via.x + dx, y: s.via.y + dy } } : {}),
        ...from,
      };
    if (s.kind === 'polygon')
      return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })), ...from };
    return { ...s, x: s.x + dx, y: s.y + dy, ...from };
  });
}

/** A part of a drawing: its shapes, drawn with its box's top left corner at (0, 0). */
export interface Part {
  shapes: Shape[];
  w: number;
  h: number;
}

/** Turn shapes and their bounds into a part whose box starts at (0, 0). */
export function part(shapes: Shape[], b: Bounds): Part {
  return { shapes: shift(shapes, -b.x, -b.y), w: b.w, h: b.h };
}

export interface Placed {
  shapes: Shape[];
  bounds: Bounds;
}

/** Parts one under another (gap apart), left-aligned or centered. */
export function stackParts(parts: readonly Part[], gap: number, center = false): Placed {
  const w = Math.max(0, ...parts.map((p) => p.w));
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  let y = 0;
  for (const p of parts) {
    if (!p.w && !p.h) continue;
    const x = center ? (w - p.w) / 2 : 0;
    shapes.push(...shift(p.shapes, x, y));
    boxes.push({ x, y, w: p.w, h: p.h });
    y += p.h + gap;
  }
  return { shapes, bounds: boxes.length ? unionBounds(...boxes) : { x: 0, y: 0, w: 1, h: 1 } };
}

/** Parts side by side (gap apart), top-aligned. */
export function sideParts(parts: readonly Part[], gap: number): Placed {
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  let x = 0;
  for (const p of parts) {
    if (!p.w && !p.h) continue;
    shapes.push(...shift(p.shapes, x, 0));
    boxes.push({ x, y: 0, w: p.w, h: p.h });
    x += p.w + gap;
  }
  return { shapes, bounds: boxes.length ? unionBounds(...boxes) : { x: 0, y: 0, w: 1, h: 1 } };
}

/** The same part moved down by dy inside a taller box: a side panel kept clear of the zoom buttons. */
export function dropPart(p: Part, dy: number): Part {
  return { shapes: shift(p.shapes, 0, dy), w: p.w, h: p.h + dy };
}

/** A placed group as a part, to nest one arrangement in another. */
export const asPart = (p: Placed): Part => part(p.shapes, p.bounds);

/**
 * The arrangement whose smallest text is drawn largest on `stage` (`font` is that text's size in
 * scene units); with no stage, the first. A challenger must beat the leader by 3%.
 */
export function pickReadable<T extends { bounds: Bounds; font: number }>(
  stage: StageSize | undefined,
  options: readonly T[],
): T {
  let best = options[0]!;
  if (!stage) return best;
  const score = (o: T) =>
    o.font * Math.min(stage.w / (o.bounds.w + 24), stage.h / (o.bounds.h + 24));
  let top = score(best);
  for (const o of options.slice(1)) {
    const v = score(o);
    if (v > top * 1.03) {
      best = o;
      top = v;
    }
  }
  return best;
}
