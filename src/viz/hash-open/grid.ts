/**
 * Slot tables for the hashing pages: m cells in rows of at most 8, index above each cell and
 * room below for a note (probe numbers). Rows keep a 13-slot table readable on a phone; a
 * table of 8 or fewer slots is one row.
 */
import type { Box } from '../../layouts/linked';
import type { Shape } from '../../render/scene';

export const CELL_W = 52;
export const CELL_H = 44;
const GAP = 6;
const PITCH = CELL_W + GAP;
const LABEL = 17;
const NOTE = 18;
export const ROW_GAP = 8;
const MAX_COLS = 8;

export interface SlotGrid {
  rows: number;
  cols: number;
  /** Width of the table itself. */
  width: number;
  /** Height of the table, from its top to the bottom of the last row's notes. */
  height: number;
  cell(j: number): Box;
}

export function slotGrid(m: number, x0: number, y0: number, maxCols = MAX_COLS): SlotGrid {
  const rows = Math.max(1, Math.ceil(m / maxCols));
  const cols = Math.max(1, Math.ceil(m / rows));
  const band = LABEL + CELL_H + NOTE + ROW_GAP;
  return {
    rows,
    cols,
    width: cols * PITCH - GAP,
    height: rows * band - ROW_GAP,
    cell: (j) => ({
      x: x0 + (j % cols) * PITCH,
      y: y0 + Math.floor(j / cols) * band + LABEL,
      w: CELL_W,
      h: CELL_H,
    }),
  };
}

/** Width of a table of m slots, so a page can centre it. */
export function gridWidth(m: number, maxCols = MAX_COLS): number {
  return slotGrid(m, 0, 0, maxCols).width;
}

/** Font size for a key in a cell. */
export function keySize(text: string): number {
  return text.length <= 2 ? 19 : text.length === 3 ? 18 : 15;
}

/** The index above a cell. `prefix` keeps ids apart when two tables share a scene. */
export function indexLabel(box: Box, j: number, prefix = ''): Shape {
  return {
    kind: 'text',
    id: `${prefix}idx-${j}`,
    x: box.x + box.w / 2,
    y: box.y - 5,
    text: String(j),
    size: 13,
    anchor: 'middle',
    cls: 'index',
    mono: true,
  };
}

/** A note under a cell, such as the probe numbers that reached it. */
export function noteLabel(box: Box, id: string, text: string): Shape {
  return {
    kind: 'text',
    id,
    x: box.x + box.w / 2,
    y: box.y + box.h + 14,
    text,
    size: 12,
    anchor: 'middle',
    cls: 'label',
    mono: true,
  };
}

/**
 * Height of the band above a table: the key on the first line, the formula on the second.
 * The formula gets a line of its own because on a phone the stage's zoom buttons cover the
 * top right corner of the drawing.
 */
export const ARG_BAND = 72;

/** The key box at the top left and the formula under it. Returns the shapes. */
export function argAndFormula(
  arg: { text: string; uid?: number; error?: boolean } | undefined,
  formula: string | undefined,
  margin: number,
  role: Shape['role'],
  uidId: (uid: number) => string,
): Shape[] {
  const out: Shape[] = [];
  if (arg) {
    const w = Math.max(52, arg.text.length * 11 + 22);
    out.push({
      kind: 'rect',
      id: 'arg-box',
      x: margin,
      y: 6,
      w,
      h: 32,
      r: 8,
      cls: 'ghost',
      role: arg.error ? 'error' : role,
    });
    out.push({
      kind: 'text',
      id: arg.uid === undefined ? 'arg' : uidId(arg.uid),
      x: margin + w / 2,
      y: 28,
      text: arg.text,
      size: Math.min(17, keySize(arg.text)),
      anchor: 'middle',
      weight: 'bold',
      role: arg.error ? 'error' : undefined,
    });
  }
  if (formula) {
    out.push({
      kind: 'text',
      id: 'formula',
      x: margin,
      y: 59,
      text: formula,
      size: 15,
      mono: true,
    });
  }
  return out;
}
