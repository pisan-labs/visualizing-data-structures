/**
 * Shared pieces of the "Design a data structure" pages min-stack, two-stack-queue and
 * randomized-set. This folder has no index.ts, so the registry does not treat it as a page.
 *
 * TEXT. `fmt` writes a number with a true minus sign; `plural`, `and` and `list` word counts
 * and lists for narration. `readInt` reads an operation's argument as a whole number in range.
 *
 * COSTS. A design page runs a sequence of operations, so its work counters run over the whole
 * session, as on /two-heaps-median/: the live counter starts where the operations before
 * stopped, and 'naive total' and 'pattern total' (src/viz/_patterns/kit.ts) are what each design
 * has cost after this operation. `Costs` keeps both totals in the state.
 *
 * STACKS. `stacksGeometry` lays out one or more stacks of `cap` slots: side by side as columns
 * with the bottom at the bottom (`vertical`, for a tall phone stage), or one above another as
 * rows with the bottom at the left (`horizontal`, for a wide laptop stage). `pickStacks` keeps
 * whichever is drawn larger on the stage (the columns with no stage). `drawStacks` draws the
 * slots (`<key>-<i>`), each value as a text whose id follows the value, and the stack's name
 * (`<key>-name`). `opLabel` is the call and its result, at the top left (`op-label`).
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Shape } from '../../render/scene';

// ----- Text -----

/** A number for narration, with a true minus sign: "−3". */
export const fmt = (v: number): string => (v < 0 ? `−${-v}` : String(v));

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export function and(xs: readonly string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Values as a list for narration: "5, 3 and 7", or "nothing". */
export const list = (vs: readonly number[]): string => (vs.length ? and(vs.map(fmt)) : 'nothing');

const INT = /^[-−]?\d+$/;

/** An operation's argument as a whole number from lo to hi, or why it cannot be read. */
export function readInt(arg: unknown, lo: number, hi: number): number | string {
  const t = String(arg ?? '').trim();
  const range = `Use a whole number from ${fmt(lo)} to ${hi}.`;
  if (!INT.test(t))
    return t ? `"${t}" is not a whole number. ${range}` : `Type a value first. ${range}`;
  const v = Number(t.replace('−', '-'));
  if (v < lo || v > hi) return `${t} is out of range. ${range}`;
  return v === 0 ? 0 : v;
}

/** The input box's parser for one whole number from lo to hi. */
export function intParser(lo: number, hi: number) {
  return (token: string): number | Error => {
    const v = readInt(token, lo, hi);
    return typeof v === 'string' ? new Error(v) : v;
  };
}

// ----- Costs over a session -----

/** What each design has cost so far, in the page's work units. */
export interface Costs {
  naive: number;
  pattern: number;
}

export const NO_COSTS: Costs = { naive: 0, pattern: 0 };

export const addCosts = (a: Costs, b: Costs): Costs => ({
  naive: a.naive + b.naive,
  pattern: a.pattern + b.pattern,
});

// ----- Stacks -----

export type Orient = 'vertical' | 'horizontal';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StacksGeometry {
  orient: Orient;
  count: number;
  cap: number;
  /** Slot i (0 is the bottom) of stack s. */
  cell(s: number, i: number): Rect;
  /** Where stack s's name goes. */
  name(s: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  /** The stacks, their names and the room above them. */
  bounds: Bounds;
}

export interface StacksFrame {
  /** How many stacks. */
  count: number;
  /** Slots per stack. */
  cap: number;
  /** Room above the stacks, for the call and anything a page puts there. */
  head: number;
  /** Space between two stacks, for the links a page draws between them. */
  gap?: number;
  /** The narrowest the drawing may be, so a call written at the top fits. */
  minW?: number;
}

const COL = { w: 64, h: 36, gap: 72, side: 24 };
const ROW = { w: 52, h: 44, gap: 54, nameW: 56 };

export function stacksGeometry(orient: Orient, f: StacksFrame): StacksGeometry {
  const { count, cap, head } = f;
  if (orient === 'vertical') {
    const gap = f.gap ?? COL.gap;
    const inner = count * COL.w + (count - 1) * gap;
    const w = Math.max(f.minW ?? 0, inner + 2 * COL.side);
    const x0 = (w - inner) / 2;
    const xOf = (s: number) => x0 + s * (COL.w + gap);
    const yOf = (i: number) => head + (cap - 1 - i) * COL.h;
    return {
      orient,
      count,
      cap,
      cell: (s, i) => ({ x: xOf(s), y: yOf(i), w: COL.w, h: COL.h }),
      name: (s) => ({ x: xOf(s) + COL.w / 2, y: head + cap * COL.h + 24, anchor: 'middle' }),
      bounds: { x: 0, y: 0, w, h: head + cap * COL.h + 36 },
    };
  }
  const gap = f.gap ?? ROW.gap;
  const x0 = ROW.nameW + 14;
  const inner = x0 + cap * ROW.w + 16;
  const w = Math.max(f.minW ?? 0, inner);
  const yOf = (s: number) => head + s * (ROW.h + gap);
  return {
    orient,
    count,
    cap,
    cell: (s, i) => ({ x: x0 + i * ROW.w, y: yOf(s), w: ROW.w, h: ROW.h }),
    name: (s) => ({ x: x0 - 12, y: yOf(s) + ROW.h / 2 + 5, anchor: 'end' }),
    bounds: { x: 0, y: 0, w, h: head + count * ROW.h + (count - 1) * gap + 16 },
  };
}

/**
 * The columns or the rows, whichever is drawn larger on the stage; the columns with no stage.
 * `extra` adds room a page needs beside the stacks for each orientation (a chart), so the choice
 * holds for the whole drawing.
 */
export function pickStacks(
  f: StacksFrame,
  stage?: StageSize,
  extra: (g: StacksGeometry) => Bounds = (g) => g.bounds,
): { g: StacksGeometry; bounds: Bounds } {
  const options = (['vertical', 'horizontal'] as const).map((o) => {
    const g = stacksGeometry(o, f);
    return { g, bounds: extra(g) };
  });
  return pickLayout(stage, options);
}

export interface StackValue {
  /** The value's shape id, which follows the value from slot to slot and stack to stack. */
  id: string;
  text: string;
  /** Where the value slides in from when it first appears. */
  enterFrom?: { x: number; y: number };
}

export interface StackView {
  /** Shape id prefix: slots are `<key>-<i>`, the name is `<key>-name`. */
  key: string;
  name: string;
  /** Bottom to top. */
  values: readonly StackValue[];
}

const valueSize = (text: string) => (text.length <= 3 ? 18 : 15);

/** The middle of a slot, where its value is written (the text's baseline). */
export function valueAt(c: Rect, text = '00'): { x: number; y: number } {
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 + valueSize(text) * 0.35 };
}

export function drawStacks(
  g: StacksGeometry,
  stacks: readonly StackView[],
  roles: ReadonlyMap<string, MarkRole>,
): Shape[] {
  const shapes: Shape[] = [];
  stacks.forEach((st, s) => {
    for (let i = 0; i < g.cap; i++) {
      const id = `${st.key}-${i}`;
      const value = st.values[i];
      shapes.push({
        kind: 'rect',
        id,
        ...g.cell(s, i),
        cls: value ? 'cell live' : 'cell',
        // A mark on a value colors its slot too, so it shows on the box as well as the digits.
        role: roles.get(id) ?? (value ? roles.get(value.id) : undefined),
        opacity: value ? 1 : 0.45,
      });
    }
    st.values.forEach((v, i) => {
      const at = valueAt(g.cell(s, i), v.text);
      shapes.push({
        kind: 'text',
        id: v.id,
        ...at,
        text: v.text,
        size: valueSize(v.text),
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(v.id),
        ...(v.enterFrom ? { enterFrom: v.enterFrom } : {}),
      });
    });
    const n = g.name(s);
    const id = `${st.key}-name`;
    shapes.push({
      kind: 'text',
      id,
      ...n,
      text: st.name,
      size: 15,
      mono: true,
      cls: 'label',
      role: roles.get(id),
    });
  });
  return shapes;
}

/** The call and, once known, its result: "pop() → 7". */
export function opLabel(text: string, role?: MarkRole): Shape {
  return { kind: 'text', id: 'op-label', x: 10, y: 26, text, size: 16, mono: true, role };
}
