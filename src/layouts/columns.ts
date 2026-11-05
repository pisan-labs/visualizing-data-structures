/**
 * Columns: an array drawn as a row of cells, and the things a range-query page lines up with
 * its columns. Used by range-queries (prefix sums, sparse table), fenwick-tree (responsibility
 * ranges, indices in binary) and segment-tree (nodes drawn over the range they cover).
 *
 * Text is monospace, whose width is predictable (0.6 em per character), so labels are sized to
 * fit without measuring. Sizes are in scene units, chosen so 16 columns stay readable on a phone
 * in portrait (values about 10 px on screen) and on a 1366x768 laptop. Views stack the rows
 * themselves: every function takes a `top` or `y` and returns shapes (and where it ended).
 *
 * GEOMETRY
 *
 *   columns(n, { pitch, x0 }) -> Cols
 *     n columns `pitch` units wide (default pitchFor(n)), column 0's left edge at x0 (default 0).
 *     cols.x(i)   left edge of column i. Fractions are fine, and x(n) is the right edge. The
 *                 edge x(k) is "fence k": the boundary between columns k − 1 and k.
 *     cols.cx(i)  center of column i.
 *   pitchFor(n): 64 units for a few columns, down to 44 for 16 or more.
 *
 * DRAWING. Every shape id starts with the `id` passed in, so marks can use them.
 *
 *   cellRow(cols, opts) -> { shapes, bottom }
 *     One cell per index from..to: the box `${id}-${i}`, its value `${id}-${i}-v`, and the
 *     index label under it `${id}-${i}-i` (leave out with `index: false`). `shift: -0.5`
 *     centers cell k on fence k (prefix sums: P[k] sits where A[0..k) ends). A role on the box
 *     id colors the box and its value; a role on the value id colors only the value. `name` is
 *     drawn left of the row as `${id}-name` (right edge at `nameX`, so several rows line up).
 *     `bottom` is the y under the index labels.
 *
 *   spanBox(cols, opts) -> Shape[]
 *     A box over columns lo..hi (a segment tree node, a Fenwick responsibility range): the box
 *     `${id}`, a small label at its top `${id}-l` (such as a range, "4–7"), and the value
 *     `${id}-v`, centered in the room under the label. With `labelAt: 'left'` the label sits on
 *     the value's line instead, for one-line boxes, and is left out when both do not fit. A
 *     role on the box colors all three.
 *
 *   bracket(cols, opts) -> Shape[]
 *     A bracket over (ticks down) or under (ticks up) columns lo..hi, with a label: the bar
 *     `${id}`, its end ticks `${id}-a` and `${id}-b`, and the label `${id}-t`. The bar and ticks
 *     are thin rects, so every role has a color; the role on `${id}` colors every part.
 *     `clamp` keeps the label between two x values, inside the drawing.
 *
 *   spanArrow(cols, opts) -> Shape[]
 *     A horizontal arrow from fence `from` to fence `to`, with a tick where it starts and a
 *     label above, starting at the tick: `${id}`, `${id}-tick`, `${id}-t`. A span of length 0
 *     draws only the tick and the label.
 *
 *   chip(opts) -> Shape[]
 *     A small rounded tag centered at (x, y): `${id}` and its text `${id}-t`. `dashed` draws
 *     the outline dashed, for something pending (a lazy tag).
 *
 *   binaryRow(cols, opts) -> { shapes, bottom }
 *     Each index from..to (all ≥ 1) in binary with `bits` digits, under its column. Its lowest
 *     set bit, the value of i & −i, is bold and sits in a small box: `${id}-${i}` (the box),
 *     `${id}-${i}-h` (the digits before the bit, if any), `${id}-${i}-b` (the bit) and
 *     `${id}-${i}-z` (the zeros after it, if any). A role on `${id}-${i}` colors the whole
 *     label. When the digits do not fit in one pitch, every other label drops to a second line.
 *
 * Text helpers: monoWidth(text, size) and fitSize(text, width, size, min), from ./calls.
 */
import type { MarkRole } from '../engine/types';
import type { Shape } from '../render/scene';
import { fitSize, monoWidth } from './calls';

export { fitSize, monoWidth };

export type Roles = ReadonlyMap<string, MarkRole>;

/** Font sizes, in scene units. */
export const FONT = { value: 24, index: 22, label: 21, name: 22, chip: 18, binary: 20 };
/** Default cell height. */
export const CELL_H = 44;

export interface Cols {
  n: number;
  pitch: number;
  /** Left edge of column i; x(k) is fence k. */
  x(i: number): number;
  /** Center of column i. */
  cx(i: number): number;
}

/** 64 units for a few columns, down to 44 for 16 or more. */
export function pitchFor(n: number): number {
  return Math.max(44, Math.min(64, Math.floor(760 / (n + 1))));
}

export function columns(n: number, opts: { pitch?: number; x0?: number } = {}): Cols {
  const pitch = opts.pitch ?? pitchFor(n);
  const x0 = opts.x0 ?? 0;
  return { n, pitch, x: (i) => x0 + i * pitch, cx: (i) => x0 + (i + 0.5) * pitch };
}

const none: Roles = new Map();

// ---------------------------------------------------------------------------------------------
// Cells

export interface CellRowOptions {
  id: string;
  from: number;
  to: number;
  top: number;
  /** Cell height. Default CELL_H. */
  h?: number;
  /** Move every cell this many columns: -0.5 centers cell k on fence k. */
  shift?: number;
  /** The value in cell i; null or undefined leaves it empty. */
  text(i: number): string | null | undefined;
  roles?: Roles;
  /** Role for cell i (box and value) when no mark names it. */
  baseRole?(i: number): MarkRole | undefined;
  /** Role for the value of cell i when no mark names it or its box. */
  valueRole?(i: number): MarkRole | undefined;
  /** Class of cell i's box. Default 'live'. */
  cellClass?(i: number): string;
  /** Index label under cell i (default: i). false draws none. */
  index?: false | ((i: number) => string);
  name?: string;
  /** Right edge of the name. Default: 10 units left of the first cell. */
  nameX?: number;
  /** Font size of the values. Default FONT.value. */
  valueSize?: number;
  opacity?(i: number): number | undefined;
}

export function cellRow(cols: Cols, o: CellRowOptions): { shapes: Shape[]; bottom: number } {
  const roles = o.roles ?? none;
  const h = o.h ?? CELL_H;
  const shift = o.shift ?? 0;
  const shapes: Shape[] = [];
  for (let i = o.from; i <= o.to; i++) {
    const x = cols.x(i + shift);
    const id = `${o.id}-${i}`;
    const role = roles.get(id) ?? o.baseRole?.(i);
    const opacity = o.opacity?.(i);
    shapes.push({
      kind: 'rect',
      id,
      x,
      y: o.top,
      w: cols.pitch,
      h,
      r: 0,
      cls: o.cellClass?.(i) ?? 'live',
      role,
      opacity,
    });
    const text = o.text(i);
    if (text !== null && text !== undefined && text !== '') {
      const size = fitSize(text, cols.pitch - 9, o.valueSize ?? FONT.value, 11);
      shapes.push({
        kind: 'text',
        id: `${id}-v`,
        x: x + cols.pitch / 2,
        y: o.top + h / 2 + size * 0.36,
        text,
        size,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`${id}-v`) ?? role ?? o.valueRole?.(i),
        opacity,
      });
    }
    if (o.index !== false) {
      const label = o.index ? o.index(i) : String(i);
      const size = fitSize(label, cols.pitch - 2, FONT.index, 11);
      shapes.push({
        kind: 'text',
        id: `${id}-i`,
        x: x + cols.pitch / 2,
        y: o.top + h + FONT.index + 1,
        text: label,
        size,
        anchor: 'middle',
        cls: 'index',
        mono: true,
        opacity,
      });
    }
  }
  if (o.name) {
    shapes.push({
      kind: 'text',
      id: `${o.id}-name`,
      x: o.nameX ?? cols.x(o.from + shift) - 10,
      y: o.top + h / 2 + FONT.name * 0.36,
      text: o.name,
      size: FONT.name,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
  }
  return { shapes, bottom: o.top + h + (o.index === false ? 0 : FONT.index + 8) };
}

/** Width of a row name drawn by cellRow, for reserving room on the left. */
export const nameWidth = (name: string) => monoWidth(name, FONT.name) + 10;

// ---------------------------------------------------------------------------------------------
// Boxes over a range of columns

export interface SpanBoxOptions {
  id: string;
  lo: number;
  hi: number;
  top: number;
  h: number;
  /** Small text: at the top of the box, or left of the value with `labelAt: 'left'`. */
  label?: string;
  /** 'left' puts the label on the value's line, and leaves it out when both do not fit. */
  labelAt?: 'top' | 'left';
  value?: string | null;
  /** Largest font size for the value. Default FONT.value. */
  valueSize?: number;
  role?: MarkRole;
  /** Role for the value alone (for example 'stale'). The box's role wins. */
  valueRole?: MarkRole;
  /** Class of the box. Default 'live'. */
  cls?: string;
  /** Room left free at each side, so neighboring boxes stay apart. Default 3. */
  inset?: number;
  opacity?: number;
}

/** Font size of a label that spanBox draws left of the value. */
const SIDE_LABEL = 17;

export function spanBox(cols: Cols, o: SpanBoxOptions): Shape[] {
  const inset = o.inset ?? 3;
  const x = cols.x(o.lo) + inset;
  const w = cols.x(o.hi + 1) - inset - x;
  const shapes: Shape[] = [
    {
      kind: 'rect',
      id: o.id,
      x,
      y: o.top,
      w,
      h: o.h,
      r: 6,
      cls: o.cls ?? 'live',
      role: o.role,
      opacity: o.opacity,
    },
  ];
  const value = o.value ?? '';
  const valueSize = fitSize(value, w - 6, o.valueSize ?? FONT.value, 11);
  const labelRole = o.role === 'active' || o.role === 'error' ? o.role : undefined;
  // The value is centered in the room left: right of `left`, under `room`.
  let room = o.top;
  let left = x;
  if (o.label && o.labelAt === 'left') {
    const lw = monoWidth(o.label, SIDE_LABEL);
    if (lw + monoWidth(value, valueSize) + 22 <= w) {
      shapes.push({
        kind: 'text',
        id: `${o.id}-l`,
        x: x + 7,
        y: o.top + o.h / 2 + SIDE_LABEL * 0.36,
        text: o.label,
        size: SIDE_LABEL,
        cls: 'label',
        mono: true,
        role: labelRole,
        opacity: o.opacity,
      });
      left = x + 7 + lw;
    }
  } else if (o.label) {
    const size = fitSize(o.label, w - 8, FONT.label, 10);
    shapes.push({
      kind: 'text',
      id: `${o.id}-l`,
      x: x + w / 2,
      y: o.top + size + 1,
      text: o.label,
      size,
      anchor: 'middle',
      cls: 'label',
      mono: true,
      role: labelRole,
      opacity: o.opacity,
    });
    room = o.top + size + 3;
  }
  if (value !== '') {
    const mid = (room + o.top + o.h) / 2;
    shapes.push({
      kind: 'text',
      id: `${o.id}-v`,
      x: (left + x + w) / 2,
      y: mid + valueSize * 0.36,
      text: value,
      size: valueSize,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: o.role ?? o.valueRole,
      opacity: o.opacity,
    });
  }
  return shapes;
}

// ---------------------------------------------------------------------------------------------
// Brackets and span arrows

export interface BracketOptions {
  id: string;
  lo: number;
  hi: number;
  /** y of the bar. */
  y: number;
  /** 'down' for a bracket above a row (ticks point down at it), 'up' for one under a row. */
  ticks: 'down' | 'up';
  label?: string;
  role?: MarkRole;
  /** Room left free at each end. Default 4. */
  inset?: number;
  /** Tick length. Default 9. */
  tick?: number;
  labelSize?: number;
  /** Keep the label between these x values (the edges of the drawing). */
  clamp?: { min: number; max: number };
}

export function bracket(cols: Cols, o: BracketOptions): Shape[] {
  const inset = o.inset ?? 4;
  const t = o.tick ?? 9;
  const a = cols.x(o.lo) + inset;
  const b = cols.x(o.hi + 1) - inset;
  const th = 3;
  const tickTop = o.ticks === 'down' ? o.y : o.y - t;
  const shapes: Shape[] = [
    { kind: 'rect', id: o.id, x: a, y: o.y - th / 2, w: b - a, h: th, r: 1, role: o.role },
    { kind: 'rect', id: `${o.id}-a`, x: a, y: tickTop, w: th, h: t, r: 1, role: o.role },
    { kind: 'rect', id: `${o.id}-b`, x: b - th, y: tickTop, w: th, h: t, r: 1, role: o.role },
  ];
  if (o.label) {
    const size = o.labelSize ?? FONT.label;
    const half = monoWidth(o.label, size) / 2;
    let x = (a + b) / 2;
    if (o.clamp) x = Math.max(o.clamp.min + half, Math.min(o.clamp.max - half, x));
    shapes.push({
      kind: 'text',
      id: `${o.id}-t`,
      x,
      y: o.ticks === 'down' ? o.y - 8 : o.y + size + 4,
      text: o.label,
      size,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: o.role,
    });
  }
  return shapes;
}

export interface SpanArrowOptions {
  id: string;
  /** Fence where the arrow starts (fence k is x(k)). */
  from: number;
  /** Fence where it ends, at the arrowhead. */
  to: number;
  y: number;
  label?: string;
  role?: MarkRole;
  labelSize?: number;
  dashed?: boolean;
}

export function spanArrow(cols: Cols, o: SpanArrowOptions): Shape[] {
  const x1 = cols.x(o.from);
  const x2 = cols.x(o.to);
  const shapes: Shape[] = [
    {
      kind: 'arrow',
      id: `${o.id}-tick`,
      x1,
      y1: o.y - 8,
      x2: x1,
      y2: o.y + 8,
      head: 'none',
      role: o.role,
    },
  ];
  if (x2 - x1 > 1) {
    shapes.push({
      kind: 'arrow',
      id: o.id,
      x1,
      y1: o.y,
      x2: x2 - 1,
      y2: o.y,
      role: o.role,
      dashed: o.dashed,
    });
  }
  if (o.label) {
    const size = o.labelSize ?? FONT.label;
    shapes.push({
      kind: 'text',
      id: `${o.id}-t`,
      x: x1 + 5,
      y: o.y - 8,
      text: o.label,
      size,
      mono: true,
      weight: 'bold',
      role: o.role,
    });
  }
  return shapes;
}

// ---------------------------------------------------------------------------------------------
// Chips

export interface ChipOptions {
  id: string;
  /** Center. */
  x: number;
  y: number;
  text: string;
  size?: number;
  role?: MarkRole;
  dashed?: boolean;
  enterFrom?: { x: number; y: number };
}

/** Width and height of a chip holding `text`. */
export function chipSize(text: string, size = FONT.chip): { w: number; h: number } {
  return { w: monoWidth(text, size) + 12, h: size + 8 };
}

export function chip(o: ChipOptions): Shape[] {
  const size = o.size ?? FONT.chip;
  const { w, h } = chipSize(o.text, size);
  const from = o.enterFrom;
  return [
    {
      kind: 'rect',
      id: o.id,
      x: o.x - w / 2,
      y: o.y - h / 2,
      w,
      h,
      r: 7,
      cls: o.dashed ? 'ghost' : 'live',
      role: o.role,
      enterFrom: from && { x: from.x - w / 2, y: from.y - h / 2 },
    },
    {
      kind: 'text',
      id: `${o.id}-t`,
      x: o.x,
      y: o.y + size * 0.36,
      text: o.text,
      size,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: o.role === 'active' || o.role === 'error' || o.role === 'found' ? o.role : undefined,
      enterFrom: from && { x: from.x, y: from.y + size * 0.36 },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Indices in binary

export interface BinaryRowOptions {
  id: string;
  /** Indices to label, all at least 1. */
  from: number;
  to: number;
  /** Digits per label. */
  bits: number;
  top: number;
  roles?: Roles;
  /** Role for index i's label when no mark names it. */
  baseRole?(i: number): MarkRole | undefined;
  size?: number;
}

/** The binary digits of i (i ≥ 1) split around its lowest set bit. */
export function splitLowBit(i: number, bits: number): { before: string; after: string } {
  const s = i.toString(2).padStart(bits, '0');
  const p = Math.log2(i & -i);
  return { before: s.slice(0, s.length - 1 - p), after: s.slice(s.length - p) };
}

/** Do labels of `bits` digits need two staggered lines at this pitch? */
export function binaryStaggers(cols: Cols, bits: number, size = FONT.binary): boolean {
  return bits * size * 0.6 + 8 > cols.pitch;
}

export function binaryRow(cols: Cols, o: BinaryRowOptions): { shapes: Shape[]; bottom: number } {
  const roles = o.roles ?? none;
  const size = o.size ?? FONT.binary;
  const cw = size * 0.6;
  const stagger = binaryStaggers(cols, o.bits, size);
  const lineH = size + 9;
  const shapes: Shape[] = [];
  for (let i = o.from; i <= o.to; i++) {
    const id = `${o.id}-${i}`;
    const role = roles.get(id) ?? o.baseRole?.(i);
    const { before, after } = splitLowBit(i, o.bits);
    const lane = stagger ? (i - o.from) % 2 : 0;
    const base = o.top + size + lane * lineH;
    const x0 = cols.cx(i) - (o.bits * cw) / 2;
    const bx = x0 + before.length * cw;
    shapes.push({
      kind: 'rect',
      id,
      x: bx - 2,
      y: base - size * 0.86,
      w: cw + 4,
      h: size * 1.12,
      r: 3,
      role,
    });
    if (before) {
      shapes.push({
        kind: 'text',
        id: `${id}-h`,
        x: x0,
        y: base,
        text: before,
        size,
        mono: true,
        cls: 'index',
        role,
      });
    }
    shapes.push({
      kind: 'text',
      id: `${id}-b`,
      x: bx,
      y: base,
      text: '1',
      size,
      mono: true,
      weight: 'bold',
      role: role ?? 'found',
    });
    if (after) {
      shapes.push({
        kind: 'text',
        id: `${id}-z`,
        x: bx + cw,
        y: base,
        text: after,
        size,
        mono: true,
        cls: 'index',
        role,
      });
    }
  }
  return { shapes, bottom: o.top + (stagger ? 2 : 1) * lineH };
}
