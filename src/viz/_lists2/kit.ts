/**
 * The linked-list tricks kit (PLAN.md 21.6, "Linked list tricks"): what fast-slow-pointers,
 * merge-sorted-lists and reverse-k-group share. This folder has no index.ts, so the registry does
 * not treat it as a page.
 *
 * - Nodes: `LNode` (uid, value, next). Values are whole numbers 0 to 99, so two digits fit a
 *   node's value field. `nid(uid)` is the node's shape id in src/layouts/linked.ts.
 * - Input: `readValues` and `readK` read an operation's argument (an error message for the
 *   learner otherwise); `parseValuesOrK` is the input box's parser: one number (a k, or a
 *   one-node list) or a list of values.
 * - Text: `plural`, `and`, `ordinal`, `arrows` ("1 → 2 → 3 → null").
 * - Work: `workOf` runs an approach's steps with zero totals and adds up its counters, so the
 *   'naive total' and 'pattern total' of src/viz/_patterns/kit.ts come from the model itself.
 * - Drawing: `chainCols` picks drawChain's nodes per row for the stage; `heading` is the line
 *   at the top left saying what is asked; `drawArray` is an array of copied values whose values
 *   keep the identity of the node they came from, so a copy slides out of its node.
 */
import type { MarkRole, Scalar, StageSize, Step, Value } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { drawChain, pointerText, type Roles } from '../../layouts/linked';
import type { Bounds, Shape } from '../../render/scene';

export const MIN_VALUE = 0;
export const MAX_VALUE = 99;

/** A node in memory. `next` is the uid of the node it points at, or null. */
export interface LNode {
  uid: number;
  value: number;
  next: number | null;
}

export const nid = (uid: number) => `n${uid}`;

// ----- Text -----

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
export function ordinal(k: number): string {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return `${k}th`;
  return `${k}${['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
}

/** "1 → 2 → 3 → null", or "null" for no values. */
export const arrows = (vs: readonly number[]) => [...vs.map(String), 'null'].join(' → ');

// ----- Input -----

const INT = /^\d+$/;

/** A list of up to `max` whole numbers from 0 to 99, or why it cannot be read. */
export function readValues(arg: Value | undefined, max: number): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length === 0) return 'Type some values first, such as 1 2 3 2 1.';
  if (tokens.length > max)
    return `That is ${tokens.length} values. Use at most ${max}, so the list fits on screen.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!INT.test(t)) return `"${t}" is not a whole number from ${MIN_VALUE} to ${MAX_VALUE}.`;
    const v = Number(t);
    if (v > MAX_VALUE) return `${t} is too big. Use whole numbers from ${MIN_VALUE} to ${MAX_VALUE}.`;
    out.push(v);
  }
  return out;
}

/** A k from 1 to `max`, or why it cannot be read. */
export function readK(arg: Value | undefined, max: number): number | string {
  const t = String(arg ?? '').trim();
  if (!INT.test(t)) return 'Type k as one whole number, such as 2.';
  const k = Number(t);
  if (k < 1) return 'k must be at least 1.';
  if (k > max) return `k must be at most ${max}, not ${k}.`;
  return k;
}

/** The input box: one whole number (a k, or a one-node list), or a list of values. */
export function parseValuesOrK(token: string, max: number): Value | Error {
  const tokens = token.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type k, such as 2, or a list of values.');
  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (!INT.test(t)) return new Error(`"${t}" is not a whole number.`);
    const v = Number(t);
    if (v > MAX_VALUE) return new Error(`${t} is too big. Use 0 to ${MAX_VALUE}.`);
    return v;
  }
  const vs = readValues(tokens.join(' '), max);
  return typeof vs === 'string' ? new Error(vs) : vs.join(' ');
}

// ----- Lists in memory -----

/** The uids from `head`, following next (stops if it ever loops). */
export function order(nodes: readonly LNode[], head: number | null): number[] {
  const byUid = new Map(nodes.map((n) => [n.uid, n]));
  const out: number[] = [];
  const seen = new Set<number>();
  for (let u = head; u !== null && !seen.has(u); u = byUid.get(u)?.next ?? null) {
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Nodes `values`, linked in order, with uids from `uid0`. */
export function makeNodes(values: readonly number[], uid0: number): LNode[] {
  return values.map((value, i) => ({
    uid: uid0 + i,
    value,
    next: i + 1 < values.length ? uid0 + i + 1 : null,
  }));
}

// ----- Work -----

/**
 * What an approach costs: run its steps (made with zero totals) to the end and add up the
 * counters named `units` in the last step's vars.
 */
export function workOf<S, X>(steps: Iterable<Step<S, X>>, units: readonly string[]): number {
  let last: Step<S, X> | undefined;
  for (const s of steps) last = s;
  return units.reduce((t, u) => t + Number(last?.vars?.[u] ?? 0), 0);
}

/** A pointer variable for the variables panel: the value it points at, or null. */
export const valueVar = (nodes: readonly LNode[], uid: number | null): Scalar =>
  uid === null ? null : (nodes.find((n) => n.uid === uid)?.value ?? null);

// ----- Drawing -----

/** The line at the top left that says what is asked, clear of the zoom buttons on the right. */
export function heading(text: string, role?: MarkRole): Shape {
  return { kind: 'text', id: 'ask', x: 12, y: 27, text, size: 15, anchor: 'start', role };
}

/**
 * Nodes per row for a drawChain of `slots` nodes on this stage, with `extra` scene units of
 * panels under it. One row when it is drawn at least `ONE_ROW` as large as it would be at
 * scale 1, else whichever of 4, 5 or 6 draws largest. With no stage (tests, thumbnails,
 * practice pictures), 4, as on /linked-list/.
 */
const ONE_ROW = 0.85;
export function chainCols(stage: StageSize | undefined, slots: number, extra = 0): number {
  if (!stage) return 4;
  const bounds = (cols: number): Bounds => {
    const nodes = Array.from({ length: Math.max(1, slots) }, (_, i) => ({ id: `m${i}`, text: '' }));
    const b = drawChain({ kind: 'single', nodes, links: [], cols, minRows: 1 }, new Map()).bounds;
    return { ...b, h: b.h + extra };
  };
  const one = bounds(Math.max(1, slots));
  const s = Math.min(stage.w / one.w, stage.h / one.h);
  if (slots <= 10 && s >= ONE_ROW) return Math.max(1, slots);
  return pickLayout(
    stage,
    [4, 5, 6].map((cols) => ({ cols, bounds: bounds(cols) })),
  ).cols;
}

/** An array cell's copy of a node's value: `uid` is the node it came from. */
export interface Copy {
  uid: number;
  value: number;
}

/** Cell size; `below` is the room under the cells for the indices and the i, j markers. */
export const ARRAY = { w: 36, h: 34, pitch: 40, below: 54 };

/**
 * An array of `size` cells at (x0, y): the box `arr-${i}`, its index `arr-${i}.i`, the value
 * `cp-${uid}` (identity of the node it was copied from, sliding in from `from(uid)` when it
 * first appears), and index markers (i, j) under the cells as `ix:${name}` with an arrow
 * `ix:${name}:a`. A value can be `lifted` above its cell (a key being inserted). `name` is the
 * array's name, left of the row.
 */
export function drawArray(o: {
  x0: number;
  y: number;
  size: number;
  cells: readonly (Copy | null)[];
  roles: Roles;
  name?: string;
  markers?: Record<string, number>;
  lifted?: { copy: Copy; at: number };
  from?: (uid: number) => { x: number; y: number } | undefined;
}): Shape[] {
  const shapes: Shape[] = [];
  const cx = (i: number) => o.x0 + i * ARRAY.pitch + ARRAY.w / 2;
  if (o.name)
    shapes.push({
      kind: 'text',
      id: 'arr-name',
      x: o.x0 - 10,
      y: o.y + ARRAY.h / 2 + 5,
      text: o.name,
      size: 15,
      anchor: 'end',
      mono: true,
    });
  const value = (c: Copy, x: number, y: number): Shape => ({
    kind: 'text',
    id: `cp-${c.uid}`,
    x,
    y,
    text: String(c.value),
    size: 17,
    anchor: 'middle',
    weight: 'bold',
    role: o.roles.get(`cp-${c.uid}`),
    enterFrom: o.from?.(c.uid),
  });
  for (let i = 0; i < o.size; i++) {
    const role = o.roles.get(`arr-${i}`);
    shapes.push({
      kind: 'rect',
      id: `arr-${i}`,
      x: o.x0 + i * ARRAY.pitch,
      y: o.y,
      w: ARRAY.w,
      h: ARRAY.h,
      r: 4,
      cls: 'cell',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `arr-${i}.i`,
      x: cx(i),
      y: o.y + ARRAY.h + 14,
      text: String(i),
      size: 12,
      anchor: 'middle',
      cls: 'label',
    });
    const c = o.cells[i];
    if (c) shapes.push(value(c, cx(i), o.y + ARRAY.h / 2 + 6));
  }
  if (o.lifted) shapes.push(value(o.lifted.copy, cx(o.lifted.at), o.y - 10));
  for (const [name, i] of Object.entries(o.markers ?? {})) {
    const role = o.roles.get(`ix:${name}`);
    const x = cx(i);
    shapes.push(pointerText(`ix:${name}`, name, x, o.y + ARRAY.h + 48, role));
    shapes.push({
      kind: 'arrow',
      id: `ix:${name}:a`,
      x1: x,
      y1: o.y + ARRAY.h + 34,
      x2: x,
      y2: o.y + ARRAY.h + 19,
      role,
    });
  }
  return shapes;
}
