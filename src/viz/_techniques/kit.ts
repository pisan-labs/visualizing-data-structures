/**
 * Shared code for the technique pages (two-pointers, sliding-window, monotonic-stack,
 * monotonic-queue): reading "values, or one number" from the input box, checking a number an
 * operation takes, and the rows these pages draw under the array (an answer per index, and a
 * stack or deque of boxes). The array itself is the sorting kit's (src/viz/_sorting/kit.ts),
 * drawn with the bars layout. This folder has no index.ts, so the registry does not treat it as
 * a page.
 */
import type { MarkRole, Value } from '../../engine/types';
import type { BarsGeometry } from '../../layouts/bars';
import type { Bounds, Shape } from '../../render/scene';
import { listFromArg, MAX_N, MAX_VALUE, parseValues } from '../_sorting/kit';

/**
 * For the input box: a list of values ("5 3 8 1", each 0 to 99) for Load, or one whole number
 * up to `maxSingle` for an operation's argument (a target sum, a window size). One small
 * number stays a number, so Load can take it too.
 */
export function parseInputUpTo(maxSingle: number) {
  return (token: string): Value | Error => {
    const t = token.trim();
    if (/^-?\d+$/.test(t)) {
      const v = Number(t);
      if (v < 0 || v > maxSingle) return new Error(`${t} is out of range. Use 0 to ${maxSingle}.`);
      return v;
    }
    const vs = parseValues(t);
    if (vs instanceof Error) return vs;
    return vs.length === 1 ? vs[0]! : vs.join(' ');
  };
}

/** An operation's whole-number argument from lo to hi, or a sentence saying what is wrong. */
export function intArg(
  arg: Value | undefined,
  lo: number,
  hi: number,
  what: string,
): number | string {
  if (typeof arg === 'number') {
    if (!Number.isInteger(arg)) return `${what} must be a whole number, not ${arg}.`;
    if (arg < lo || arg > hi) return `${what} must be from ${lo} to ${hi}, not ${arg}.`;
    return arg;
  }
  const t = String(arg ?? '').trim();
  if (!/^-?\d+$/.test(t))
    return `Type ${what.toLowerCase()} as one whole number, such as ${lo + 1}.`;
  return intArg(Number(t), lo, hi, what);
}

export { listFromArg, MAX_N, MAX_VALUE };

// ----- Rows under the array -----

/** One text per array column, in boxes aligned with the array (an answer, a window's sum). */
export interface CellRow {
  /** Shape ids: `<id>-<i>` a box, `<id>-<i>-t` its text, `<id>-name` the row's name. */
  id: string;
  name: string;
  /** Text per column; null leaves the column out, '' draws an empty box. */
  texts: readonly (string | null)[];
  roles?: ReadonlyMap<string, MarkRole>;
  /** A role per column that stays (an answer just written); marks win. */
  tones?: readonly (MarkRole | undefined)[];
}

/** One box in a stack, a deque or a list of counts. */
export interface ListItem {
  /** Identity: the shapes are `<row id>-<key>`, so a box keeps its place in the animation. */
  key: string | number;
  text: string;
  /** Small text under the box: the array index it came from, a count. */
  sub?: string;
  /** Where the box slides in from when it first appears (its array column). */
  from?: { x: number; y: number };
}

export interface ListRow {
  /** Shape ids: `<id>-<key>` a box, `<id>-<key>-t` its text, `<id>-<key>-s` the text under it. */
  id: string;
  name: string;
  items: readonly ListItem[];
  /** Empty slots drawn for this many boxes (the frame), so the row keeps its size as it fills. */
  slots: number;
  roles?: ReadonlyMap<string, MarkRole>;
}

export const ROW_H = 46;
const NAME = 22;
const VALUE = 22;
const INDEX = 20;
const LIST_H = 46;
/** Height a list row takes: its name, the boxes and the indices under them. */
export const LIST_ROW_H = 30 + LIST_H + 30;

/**
 * A row of boxes under the array's columns, at y. Its name sits above its first box, left
 * aligned, so a long name ("next greater") needs no room left of the array.
 */
export function cellRowShapes(g: BarsGeometry, row: CellRow, y: number): Shape[] {
  const shapes: Shape[] = [];
  const roles = row.roles ?? new Map<string, MarkRole>();
  shapes.push({
    kind: 'text',
    id: `${row.id}-name`,
    x: g.left(0),
    y: y + 20,
    text: row.name,
    size: NAME,
    anchor: 'start',
    cls: 'label',
  });
  const top = y + 30;
  const w = g.pitch - 4;
  row.texts.forEach((text, i) => {
    if (text === null) return;
    const id = `${row.id}-${i}`;
    const role = roles.get(id) ?? row.tones?.[i];
    shapes.push({
      kind: 'rect',
      id,
      x: g.left(i) + 2,
      y: top,
      w,
      h: ROW_H - 6,
      r: 5,
      cls: text ? 'cell live' : 'cell',
      role,
    });
    if (text) {
      const size = Math.min(VALUE, Math.floor((w - 4) / (Math.max(2, text.length) * 0.6)));
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: g.center(i),
        y: top + (ROW_H - 6) / 2 + size * 0.36,
        text,
        size,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`${id}-t`) ?? role,
      });
    }
  });
  return shapes;
}

/** Height a cell row takes. */
export const CELL_ROW_H = 30 + ROW_H;

/**
 * A stack, a deque or a list of counts drawn as boxes in a row under the array, from the left,
 * each with its text and small text under it. Boxes keep their key, so a box slides when the
 * front of a deque pops, and comes in from its array column when pushed.
 */
export function listRowShapes(g: BarsGeometry, row: ListRow, y: number): Shape[] {
  const shapes: Shape[] = [];
  const roles = row.roles ?? new Map<string, MarkRole>();
  const w = g.pitch - 6;
  const top = y + 30;
  shapes.push({
    kind: 'text',
    id: `${row.id}-name`,
    x: g.left(0),
    y: y + 20,
    text: row.name,
    size: NAME,
    anchor: 'start',
    cls: 'label',
  });
  for (let k = 0; k < row.slots; k++) {
    shapes.push({
      kind: 'rect',
      id: `${row.id}-slot-${k}`,
      x: g.left(k) + 3,
      y: top,
      w,
      h: LIST_H,
      r: 6,
      cls: 'ghost',
      z: 0.5,
    });
  }
  row.items.forEach((item, k) => {
    const id = `${row.id}-${item.key}`;
    const role = roles.get(id);
    const size = Math.min(VALUE, Math.floor((w - 4) / (Math.max(2, item.text.length) * 0.6)));
    shapes.push({
      kind: 'rect',
      id,
      x: g.left(k) + 3,
      y: top,
      w,
      h: LIST_H,
      r: 6,
      cls: 'cell live',
      role,
      ...(item.from ? { enterFrom: { x: item.from.x - w / 2, y: item.from.y - LIST_H / 2 } } : {}),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: g.center(k),
      y: top + LIST_H / 2 + size * 0.36,
      text: item.text,
      size,
      anchor: 'middle',
      weight: 'bold',
      role,
      ...(item.from ? { enterFrom: item.from } : {}),
    });
    if (item.sub)
      shapes.push({
        kind: 'text',
        id: `${id}-s`,
        x: g.center(k),
        y: top + LIST_H + 21,
        text: item.sub,
        size: INDEX,
        anchor: 'middle',
        mono: true,
        cls: 'index',
        role: roles.get(`${id}-s`),
      });
  });
  return shapes;
}

/** Bounds grown to take in a box. */
export function grow(b: Bounds, x: number, y: number, w: number, h: number): Bounds {
  const x1 = Math.min(b.x, x);
  const y1 = Math.min(b.y, y);
  const x2 = Math.max(b.x + b.w, x + w);
  const y2 = Math.max(b.y + b.h, y + h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
