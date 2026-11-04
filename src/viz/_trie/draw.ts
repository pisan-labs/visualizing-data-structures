/**
 * Pieces both trie views draw: the word being processed as a row of letter cells, a refused
 * argument, and the list of words startsWith writes.
 */
import type { MarkRole } from '../../engine/types';
import type { Bounds, Shape } from '../../render/scene';

export const CELL = { w: 24, h: 28 };
const LETTER = 16;

export interface WordArg {
  name: string;
  text: string;
  /** The letter being looked at; letters before it are done. */
  at: number;
  bad?: boolean;
}

/** Width of the argument row: its name and one cell per letter. */
export function argWidth(arg: WordArg): number {
  const label = arg.name.length * 8 + 12;
  if (arg.bad) return label + Math.min(arg.text.length, 16) * 9 + 20;
  return label + arg.text.length * CELL.w;
}

/**
 * The argument as a row of letter cells, ids `arg-<i>` (cell) and `argt-<i>` (letter), with
 * its name in front. Cells before `at` are done (role visit) unless a mark says otherwise.
 * A refused argument is one box, `arg-bad`.
 */
export function drawArg(
  arg: WordArg,
  x: number,
  cy: number,
  roles: ReadonlyMap<string, MarkRole>,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const label = arg.name.length * 8 + 12;
  shapes.push({
    kind: 'text',
    id: 'arg-name',
    x,
    y: cy + 5,
    text: arg.name,
    size: 14,
    cls: 'label',
    mono: true,
  });
  if (arg.bad) {
    const text = arg.text.length > 16 ? `${arg.text.slice(0, 15)}…` : arg.text;
    const w = Math.max(40, text.length * 9 + 16);
    shapes.push({
      kind: 'rect',
      id: 'arg-bad',
      x: x + label,
      y: cy - CELL.h / 2,
      w,
      h: CELL.h,
      r: 5,
      cls: 'ghost',
      role: roles.get('arg-bad') ?? 'error',
    });
    shapes.push({
      kind: 'text',
      id: 'arg-bad-text',
      x: x + label + w / 2,
      y: cy + 5,
      text,
      size: 14,
      anchor: 'middle',
      mono: true,
      role: 'error',
    });
    return { shapes, bounds: { x, y: cy - CELL.h / 2, w: label + w, h: CELL.h } };
  }
  [...arg.text].forEach((ch, i) => {
    const cx = x + label + i * CELL.w;
    const role = roles.get(`arg-${i}`) ?? (i < arg.at ? 'visit' : undefined);
    shapes.push({
      kind: 'rect',
      id: `arg-${i}`,
      x: cx,
      y: cy - CELL.h / 2,
      w: CELL.w,
      h: CELL.h,
      r: 3,
      cls: 'live',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `argt-${i}`,
      x: cx + CELL.w / 2,
      y: cy + LETTER * 0.36,
      text: ch,
      size: LETTER,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: role === 'active' || role === 'error' ? role : undefined,
    });
  });
  return { shapes, bounds: { x, y: cy - CELL.h / 2, w: argWidth(arg), h: CELL.h } };
}

/**
 * The words startsWith has written, as boxes `out-<i>` (text `outt-<i>`) flowing left to
 * right from (x, y) and wrapping at `width`. New boxes slide in from `from(i)`.
 */
export function drawOutput(
  words: string[],
  x: number,
  y: number,
  width: number,
  roles: ReadonlyMap<string, MarkRole>,
  from?: (i: number) => { x: number; y: number } | undefined,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const size = 14;
  const h = 26;
  const labelW = 62;
  shapes.push({
    kind: 'text',
    id: 'out-label',
    x,
    y: y + h / 2 + 5,
    text: 'output',
    size,
    cls: 'label',
    mono: true,
  });
  let cx = x + labelW;
  let row = 0;
  let right = cx;
  words.forEach((word, i) => {
    const w = word.length * size * 0.6 + 14;
    if (cx > x + labelW && cx + w > x + Math.max(width, labelW + w)) {
      row += 1;
      cx = x + labelW;
    }
    const top = y + row * (h + 8);
    const enter = from?.(i);
    shapes.push({
      kind: 'rect',
      id: `out-${i}`,
      x: cx,
      y: top,
      w,
      h,
      r: 5,
      cls: 'live',
      role: roles.get(`out-${i}`),
      enterFrom: enter && { x: enter.x - w / 2, y: enter.y - h / 2 },
    });
    shapes.push({
      kind: 'text',
      id: `outt-${i}`,
      x: cx + w / 2,
      y: top + h / 2 + size * 0.36,
      text: word,
      size,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(`out-${i}`) === 'new' ? 'new' : undefined,
      enterFrom: enter,
    });
    cx += w + 6;
    right = Math.max(right, cx);
  });
  return {
    shapes,
    bounds: { x, y, w: Math.max(right - x, labelW + 40), h: (row + 1) * (h + 8) - 8 },
  };
}
