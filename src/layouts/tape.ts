/**
 * A tape: a row of cells with a head, shared by the automata pages. A finite automaton's input
 * is a tape it reads left to right (the symbols read so far are greyed); a Turing machine's
 * tape is read and written, and its head moves both ways.
 *
 *   tapeWindow(head, width, { lo, hi, used }) -> { from, to }, the cells to show
 *   drawTape(shapes, options) -> bounds
 *     id        prefix for shape ids (default "tape")
 *     x, y      top left of the room for the head; the cells sit under it
 *     cells     the symbols; cells[0] is cell `first` (default 0). Cells outside them, on
 *               either side, show the blank, so a two-way tape draws cells left of 0 too.
 *     from, to  the window of cells shown, [from, to); keep it fixed through an operation so
 *               the camera stays still while the head moves. `tapeWindow` picks one.
 *     head      the head's cell, or null for no head (a finished run)
 *     headLabel text over the head, such as the current state (default none)
 *     headRoom  the room over the cells: 'label' for the head and its label, 'head' for the
 *               head alone (the default without a label), or 'none'. The room stays when there
 *               is no head, so the cells never jump as the head comes and goes.
 *     read      cells before this one are greyed (the input consumed so far)
 *     index     show cell numbers under the cells
 *     left      draw the left end as a wall (Sipser's one-way tape starts at cell 0)
 *     roles     marks by shape id
 *     blank     how a blank cell looks (default "␣")
 *     rows      { width, pitch }: wrap the window onto rows of `width` cells, each row `pitch`
 *               below the one before (a long word, or one tape on several lines). Each row
 *               keeps its own head room; the head and its label sit on the head's row (none
 *               when the head is outside the window), and the wall on the row with cell 0.
 *     key       the cell's key in its shape ids (default its cell number i). A key that follows
 *               a symbol's identity (a uid, or the piece and copy it came from) makes the
 *               animation follow the symbol when it moves to another cell.
 *     enter     where a new cell comes in from: the top left of a cell, such as the cell it was
 *               copied from (default: it fades in where it is)
 *
 * Shape ids: `${id}-<key>` the cell, `${id}-<key>-t` its symbol, `${id}-<key>-n` its number,
 * `${id}-head` the head arrow, `${id}-head-t` its label, `${id}-end` the wall. Cells keep their
 * ids as the window moves, so a symbol stays with its cell.
 *
 * Sizes are in scene units: cells are 34 wide and 36 high, symbols 18. Twelve cells are about
 * 410 units, which keeps symbols near 15 px on a phone.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export const CELL_W = 34;
export const CELL_H = 36;
export const BLANK = '␣';

export interface TapeOptions {
  id?: string;
  x: number;
  y: number;
  cells: readonly string[];
  first?: number;
  from?: number;
  to: number;
  head?: number | null;
  headLabel?: string;
  headRoom?: 'label' | 'head' | 'none';
  read?: number;
  index?: boolean;
  left?: boolean;
  roles?: ReadonlyMap<string, MarkRole>;
  blank?: string;
  rows?: { width: number; pitch: number };
  key?: (i: number) => string | number;
  enter?: (i: number) => { x: number; y: number } | undefined;
}

export interface WindowOptions {
  /** The leftmost cell that exists: 0 on a one-way tape. Default: none (a two-way tape). */
  lo?: number;
  /**
   * The rightmost cell worth showing, such as the empty cell after an input word. The window
   * stops there and keeps its width, so the tape never shrinks at the end of a long word; a
   * tape shorter than the window shows just its cells.
   */
  hi?: number;
  /**
   * The leftmost and rightmost cells the run has touched so far. While they fit in the window
   * for cell 0, with a spare cell on each side that goes on, the window stays there however
   * the head moves.
   */
  used?: { lo: number; hi: number };
}

/**
 * A window of `width` cells that shows the head, moved in steps of half a window so the
 * camera seldom moves, and held still while everything touched so far fits (`used`).
 */
export function tapeWindow(
  head: number,
  width: number,
  o: WindowOptions = {},
): { from: number; to: number } {
  const lo = o.lo ?? -Infinity;
  const hi = o.hi ?? Infinity;
  const w = Math.max(1, Math.min(width, hi - lo + 1));
  const step = Math.max(1, Math.floor(w / 2));
  const at = (h: number) => {
    let from = Math.floor(h / step) * step - Math.floor(step / 2);
    if (from + w > hi + 1) from = hi + 1 - w;
    if (from < lo) from = lo;
    if (h >= from + w) from = h - w + 1;
    if (h < from) from = h;
    return { from, to: from + w };
  };
  if (o.used) {
    const home = at(0);
    const { lo: left, hi: right } = o.used;
    const fits =
      (home.from <= lo ? left >= home.from : left > home.from) &&
      (home.to - 1 >= hi ? right <= home.to - 1 : right < home.to - 1);
    if (fits) return home;
  }
  return at(head);
}

export function drawTape(shapes: Shape[], o: TapeOptions): Bounds {
  const id = o.id ?? 'tape';
  const from = o.from ?? 0;
  const room = o.headRoom ?? (o.headLabel !== undefined ? 'label' : 'head');
  const headH = room === 'label' ? 46 : room === 'head' ? 26 : 0;
  const width = o.rows?.width ?? Math.max(1, o.to - from);
  const pitch = o.rows?.pitch ?? 0;
  const nRows = Math.max(1, Math.ceil((o.to - from) / width));
  for (let r = 0; r < nRows; r++) {
    const rowFrom = from + r * width;
    const rowTo = Math.min(o.to, rowFrom + width);
    const head = o.head != null && o.head >= rowFrom && o.head < rowTo ? o.head : null;
    const wall = o.left && rowFrom <= 0 && (r === nRows - 1 || rowFrom + width > 0);
    // Without rows the head is drawn wherever it is; with rows, only on a row that holds it.
    drawRow(shapes, o, id, rowFrom, rowTo, o.y + r * pitch, headH, o.rows ? head : o.head, wall);
  }
  const w = Math.min(width, o.to - from) * CELL_W;
  return {
    x: o.x - (o.left ? 6 : 0),
    y: o.y,
    w: w + (o.left ? 6 : 0),
    h: (nRows - 1) * pitch + headH + CELL_H + (o.index ? 20 : 0),
  };
}

/** One row of cells, [from, to), with its top at y, then its wall and the head if they are on it. */
function drawRow(
  shapes: Shape[],
  o: TapeOptions,
  id: string,
  from: number,
  to: number,
  y: number,
  headH: number,
  head: number | null | undefined,
  wall: boolean | undefined,
): void {
  const first = o.first ?? 0;
  const roles = o.roles ?? new Map<string, MarkRole>();
  const blank = o.blank ?? BLANK;
  const top = y + headH;
  for (let i = from; i < to; i++) {
    const x = o.x + (i - from) * CELL_W;
    const cid = `${id}-${o.key ? o.key(i) : i}`;
    const k = i - first;
    const sym = k >= 0 && k < o.cells.length ? o.cells[k]! : '';
    const shown = sym === '' || sym === '_' ? blank : sym;
    const done = o.read !== undefined && i < o.read;
    const role = roles.get(cid) ?? (o.head === i ? 'active' : undefined);
    const enter = o.enter?.(i);
    shapes.push({
      kind: 'rect',
      id: cid,
      x,
      y: top,
      w: CELL_W,
      h: CELL_H,
      role,
      cls: done ? 'read' : undefined,
      opacity: done ? 0.5 : undefined,
      enterFrom: enter,
    });
    shapes.push({
      kind: 'text',
      id: `${cid}-t`,
      x: x + CELL_W / 2,
      y: top + CELL_H / 2 + 6,
      text: shown,
      size: 18,
      anchor: 'middle',
      mono: true,
      role: roles.get(`${cid}-t`) ?? (role === 'active' ? 'active' : undefined),
      opacity: done ? 0.45 : shown === blank ? 0.55 : undefined,
      enterFrom: enter && { x: enter.x + CELL_W / 2, y: enter.y + CELL_H / 2 + 6 },
    });
    if (o.index)
      shapes.push({
        kind: 'text',
        id: `${cid}-n`,
        x: x + CELL_W / 2,
        y: top + CELL_H + 15,
        text: String(i),
        size: 12,
        anchor: 'middle',
        mono: true,
        cls: 'index',
      });
  }
  if (wall) {
    const x = o.x + (0 - from) * CELL_W;
    shapes.push({
      kind: 'rect',
      id: `${id}-end`,
      x: x - 5,
      y: top - 4,
      w: 5,
      h: CELL_H + 8,
      cls: 'wall',
    });
  }
  if (head != null) {
    const x = o.x + (head - from + 0.5) * CELL_W;
    shapes.push({
      kind: 'arrow',
      id: `${id}-head`,
      x1: x,
      y1: top - 24,
      x2: x,
      y2: top - 3,
      role: roles.get(`${id}-head`) ?? 'active',
    });
    if (o.headLabel)
      shapes.push({
        kind: 'text',
        id: `${id}-head-t`,
        x,
        y: top - 29,
        text: o.headLabel,
        size: 15,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`${id}-head-t`) ?? 'active',
      });
  }
}
