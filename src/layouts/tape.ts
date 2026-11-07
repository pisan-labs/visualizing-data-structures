/**
 * A tape: a row of cells with a head, shared by the automata pages. A finite automaton's input
 * is a tape it reads left to right (the symbols read so far are greyed); a Turing machine's
 * tape is read and written, and its head moves both ways.
 *
 *   drawTape(shapes, options) -> bounds
 *     id        prefix for shape ids (default "tape")
 *     x, y      top left of the first cell shown
 *     cells     the symbols, from cell `from` on; a cell past the end shows the blank
 *     from, to  the window of cells shown, [from, to); keep it fixed through an operation so
 *               the camera stays still while the head moves. `tapeWindow` picks one.
 *     head      the head's cell, or null for no head (a finished run)
 *     headLabel text over the head, such as the current state (default none)
 *     read      cells before this one are greyed (the input consumed so far)
 *     index     show cell numbers under the cells
 *     left      draw the left end as a wall (Sipser's one-way tape starts at cell 0)
 *     roles     marks by shape id
 *     blank     how a blank cell looks (default "␣")
 *
 * Shape ids: `${id}-<i>` the cell, `${id}-<i>-t` its symbol, `${id}-<i>-n` its number,
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
  from?: number;
  to: number;
  head?: number | null;
  headLabel?: string;
  read?: number;
  index?: boolean;
  left?: boolean;
  roles?: Map<string, MarkRole>;
  blank?: string;
}

/**
 * A window of `width` cells that shows the head, moved in steps of half a window so the
 * camera seldom moves. `lo` is the leftmost cell that exists (0 on a one-way tape).
 */
export function tapeWindow(
  head: number,
  width: number,
  lo = -Infinity,
): { from: number; to: number } {
  const step = Math.max(1, Math.floor(width / 2));
  let from = Math.floor(head / step) * step - Math.floor(step / 2);
  if (from < lo) from = lo;
  if (head >= from + width) from = head - width + 1;
  return { from, to: from + width };
}

export function drawTape(shapes: Shape[], o: TapeOptions): Bounds {
  const id = o.id ?? 'tape';
  const from = o.from ?? 0;
  const roles = o.roles ?? new Map<string, MarkRole>();
  const blank = o.blank ?? BLANK;
  const headH = o.head == null ? 0 : o.headLabel ? 46 : 26;
  const top = o.y + headH;
  for (let i = from; i < o.to; i++) {
    const x = o.x + (i - from) * CELL_W;
    const cid = `${id}-${i}`;
    const sym = i >= 0 && i < o.cells.length ? o.cells[i]! : '';
    const shown = sym === '' || sym === '_' ? blank : sym;
    const done = o.read !== undefined && i < o.read;
    const role = roles.get(cid) ?? (o.head === i ? 'active' : undefined);
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
  if (o.left && from <= 0) {
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
  if (o.head != null) {
    const x = o.x + (o.head - from + 0.5) * CELL_W;
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
  return {
    x: o.x - (o.left ? 6 : 0),
    y: o.y,
    w: (o.to - from) * CELL_W + (o.left ? 6 : 0),
    h: headH + CELL_H + (o.index ? 20 : 0),
  };
}
