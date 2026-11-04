import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** Each value written into the array gets a uid, so the view can animate that value. */
export interface Slot {
  uid: number;
  value: Value;
}

export interface StackState {
  capacity: number;
  /** Physical array contents. Slots at or above `size` may hold leftover (stale) values. */
  slots: (Slot | null)[];
  /** Number of items in the stack. */
  size: number;
  nextUid: number;
}

export interface StackSettings {
  [key: string]: Scalar;
  capacity: number;
  /** count: top = number of items (next free slot). index: top = index of top item, -1 if empty. */
  top: 'count' | 'index';
  layout: 'vertical' | 'horizontal';
}

export interface StackExtra {
  /** A value waiting to be pushed, drawn above the array. */
  incoming?: { uid: number; value: Value; error?: boolean };
  /** Draw this slot as part of the stack even though it is at or above `size`. */
  hold?: number;
  /** Draw this slot as not yet written even though it is below `size`. */
  pending?: number;
  /** A copy of a value being returned. */
  out?: { value: Value; from: number; label: string };
}

type S = StackState;
type X = StackExtra;
type Op = OpSpec<S, StackSettings, X>;
type StackStep = Step<S, X>;

export const defaults: StackSettings = { capacity: 8, top: 'count', layout: 'vertical' };

export function init(settings: StackSettings): S {
  return {
    capacity: settings.capacity,
    slots: Array(settings.capacity).fill(null),
    size: 0,
    nextUid: 1,
  };
}

/** The value of the `top` variable under the chosen convention. */
export function topOf(state: S, settings: StackSettings): number {
  return settings.top === 'count' ? state.size : state.size - 1;
}

export function fmt(v: Value): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

function vars(state: S, settings: StackSettings, more: Record<string, Scalar> = {}) {
  return { ...more, top: topOf(state, settings), capacity: state.capacity };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

const push: Op = {
  label: 'Push',
  arity: 1,
  *run(s, [x], { settings }) {
    const value = x as Value;
    const count = settings.top === 'count';
    const top = topOf(s, settings);
    const uid = s.nextUid;
    const incoming = { uid, value };
    const v = fmt(value);

    yield {
      state: s,
      marks: [mark('top', 'active')],
      say: count
        ? `push(${v}): is there room? top = ${top} and capacity = ${s.capacity}.`
        : `push(${v}): is there room? top = ${top} and the last index is capacity - 1 = ${s.capacity - 1}.`,
      lines: ['push.check'],
      vars: vars(s, settings, { x: value }),
      level: 2,
      extra: { incoming },
    } satisfies StackStep;

    if (s.size === s.capacity) {
      yield {
        state: s,
        marks: [mark('top', 'error'), mark(`v${uid}`, 'error')],
        say: count
          ? `top equals capacity, so the array is full. Stack overflow: ${v} is not pushed.`
          : `top is already capacity - 1, so the array is full. Stack overflow: ${v} is not pushed.`,
        lines: ['push.overflow'],
        vars: vars(s, settings, { x: value }),
        level: 1,
        extra: { incoming: { ...incoming, error: true } },
      } satisfies StackStep;
      return s;
    }

    const slot = s.size;
    const slots = [...s.slots];
    slots[slot] = { uid, value };
    const stored: S = { ...s, slots, nextUid: uid + 1 };
    const grown: S = { ...s, size: s.size + 1 };
    const done: S = { ...stored, size: s.size + 1 };

    if (count) {
      yield {
        state: stored,
        marks: [mark(`cell-${slot}`, 'new'), mark(`v${uid}`, 'new')],
        say: `There is room. Store ${v} in A[${top}], the first free slot.`,
        lines: ['push.store'],
        vars: vars(s, settings, { x: value }),
        level: 2,
        extra: { hold: slot },
      } satisfies StackStep;
      yield {
        state: done,
        marks: [mark('top', 'active'), mark(`v${uid}`, 'done')],
        say: `Increment top to ${top + 1}. ${v} is now the top of the stack.`,
        lines: ['push.inc'],
        vars: vars(done, settings, { x: value }),
        level: 1,
      } satisfies StackStep;
    } else {
      yield {
        state: grown,
        marks: [mark('top', 'active'), mark(`cell-${slot}`, 'active')],
        say: `There is room. Increment top to ${top + 1}.`,
        lines: ['push.inc'],
        vars: vars(grown, settings, { x: value }),
        level: 2,
        extra: { incoming, pending: slot },
      } satisfies StackStep;
      yield {
        state: done,
        marks: [mark(`cell-${slot}`, 'new'), mark(`v${uid}`, 'done')],
        say: `Store ${v} in A[${top + 1}]. ${v} is now the top of the stack.`,
        lines: ['push.store'],
        vars: vars(done, settings, { x: value }),
        level: 1,
      } satisfies StackStep;
    }
    return done;
  },
};

function* emptyCheck(
  s: S,
  settings: StackSettings,
  op: 'pop' | 'peek',
): Generator<StackStep, boolean, void> {
  const top = topOf(s, settings);
  yield {
    state: s,
    marks: [mark('top', 'active')],
    say: `${op}(): is the stack empty? top = ${top}.`,
    lines: [`${op}.check`],
    vars: vars(s, settings),
    level: 2,
  };
  if (s.size > 0) return false;
  const what =
    op === 'pop' ? 'Stack underflow: there is nothing to pop.' : 'There is nothing to peek at.';
  yield {
    state: s,
    marks: [mark('top', 'error')],
    say: `top is ${top}, so the stack is empty. ${what}`,
    lines: [op === 'pop' ? 'pop.underflow' : 'peek.empty'],
    vars: vars(s, settings),
    level: 1,
  };
  return true;
}

const pop: Op = {
  label: 'Pop',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'pop')) return s;
    const slot = s.size - 1;
    const value = s.slots[slot]!.value;
    const v = fmt(value);
    const top = topOf(s, settings);
    const shrunk: S = { ...s, size: s.size - 1 };
    const leftover = `${v} stays in the array, but it is no longer part of the stack.`;

    if (settings.top === 'count') {
      yield {
        state: shrunk,
        marks: [mark('top', 'active'), mark(`cell-${slot}`, 'active')],
        say: `Decrement top to ${top - 1}. A[${top - 1}] holds the top item, ${v}.`,
        lines: ['pop.dec'],
        vars: vars(shrunk, settings),
        level: 2,
        extra: { hold: slot },
      } satisfies StackStep;
      yield {
        state: shrunk,
        marks: [mark('out', 'found')],
        say: `Return A[${top - 1}] = ${v}. ${leftover}`,
        lines: ['pop.return'],
        vars: vars(shrunk, settings, { returned: value }),
        level: 1,
        extra: { out: { value, from: slot, label: 'returned' } },
      } satisfies StackStep;
    } else {
      yield {
        state: s,
        marks: [mark(`cell-${slot}`, 'active'), mark('out', 'active')],
        say: `Copy the top item: x = A[${top}] = ${v}.`,
        lines: ['pop.read'],
        vars: vars(s, settings, { x: value }),
        level: 2,
        extra: { out: { value, from: slot, label: 'x' } },
      } satisfies StackStep;
      yield {
        state: shrunk,
        marks: [mark('top', 'active'), mark('out', 'found')],
        say: `Decrement top to ${top - 1} and return x = ${v}. ${leftover}`,
        lines: ['pop.dec', 'pop.return'],
        vars: vars(shrunk, settings, { x: value, returned: value }),
        level: 1,
        extra: { out: { value, from: slot, label: 'returned' } },
      } satisfies StackStep;
    }
    return shrunk;
  },
};

const peek: Op = {
  label: 'Peek',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'peek')) return s;
    const slot = s.size - 1;
    const value = s.slots[slot]!.value;
    const where = settings.top === 'count' ? `A[top - 1] = A[${slot}]` : `A[top] = A[${slot}]`;
    yield {
      state: s,
      marks: [mark(`cell-${slot}`, 'found'), mark('out', 'found')],
      say: `Return ${where} = ${fmt(value)}. top does not change, so the stack is the same as before.`,
      lines: ['peek.return'],
      vars: vars(s, settings, { returned: value }),
      level: 1,
      extra: { out: { value, from: slot, label: 'returned' } },
    } satisfies StackStep;
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const empty: S = { ...s, size: 0 };
    const reset = settings.top === 'count' ? 'top = 0' : 'top = -1';
    yield {
      state: empty,
      marks: [mark('top', 'active')],
      say:
        s.size === 0
          ? `clear(): set ${reset}. The stack was already empty.`
          : `clear(): set ${reset}. That is all it takes: the old values stay in memory as leftovers, and later pushes will overwrite them.`,
      lines: ['clear.reset'],
      vars: vars(empty, settings),
      level: 1,
    } satisfies StackStep;
    return empty;
  },
};

export const ops = { push, pop, peek, clear };

const L = (id: string, indent: number, text: string) => ({ id, indent, text });

export function pseudocode(settings: StackSettings): PseudoBlock[] {
  if (settings.top === 'count') {
    return [
      {
        op: 'push',
        lines: [
          L('push.sig', 0, 'push(x)'),
          L('push.check', 1, 'if top == capacity'),
          L('push.overflow', 2, 'error "stack overflow"'),
          L('push.store', 1, 'A[top] = x'),
          L('push.inc', 1, 'top = top + 1'),
        ],
      },
      {
        op: 'pop',
        lines: [
          L('pop.sig', 0, 'pop()'),
          L('pop.check', 1, 'if top == 0'),
          L('pop.underflow', 2, 'error "stack underflow"'),
          L('pop.dec', 1, 'top = top - 1'),
          L('pop.return', 1, 'return A[top]'),
        ],
      },
      {
        op: 'peek',
        lines: [
          L('peek.sig', 0, 'peek()'),
          L('peek.check', 1, 'if top == 0'),
          L('peek.empty', 2, 'error "stack is empty"'),
          L('peek.return', 1, 'return A[top - 1]'),
        ],
      },
      { op: 'clear', lines: [L('clear.sig', 0, 'clear()'), L('clear.reset', 1, 'top = 0')] },
    ];
  }
  return [
    {
      op: 'push',
      lines: [
        L('push.sig', 0, 'push(x)'),
        L('push.check', 1, 'if top == capacity - 1'),
        L('push.overflow', 2, 'error "stack overflow"'),
        L('push.inc', 1, 'top = top + 1'),
        L('push.store', 1, 'A[top] = x'),
      ],
    },
    {
      op: 'pop',
      lines: [
        L('pop.sig', 0, 'pop()'),
        L('pop.check', 1, 'if top == -1'),
        L('pop.underflow', 2, 'error "stack underflow"'),
        L('pop.read', 1, 'x = A[top]'),
        L('pop.dec', 1, 'top = top - 1'),
        L('pop.return', 1, 'return x'),
      ],
    },
    {
      op: 'peek',
      lines: [
        L('peek.sig', 0, 'peek()'),
        L('peek.check', 1, 'if top == -1'),
        L('peek.empty', 2, 'error "stack is empty"'),
        L('peek.return', 1, 'return A[top]'),
      ],
    },
    { op: 'clear', lines: [L('clear.sig', 0, 'clear()'), L('clear.reset', 1, 'top = -1')] },
  ];
}

export function initialSay(state: S, settings: StackSettings): string {
  return settings.top === 'count'
    ? `An empty stack: an array A with capacity ${state.capacity}, and top = 0. Here top counts the items, so it is also the index of the next free slot.`
    : `An empty stack: an array A with capacity ${state.capacity}, and top = -1. Here top is the index of the top item, so -1 means empty.`;
}

export function initialVars(state: S, settings: StackSettings) {
  return vars(state, settings);
}

/**
 * Screen-reader summary. `pending` is a slot already inside the stack but not yet written
 * (between "top = top + 1" and "A[top] = x" when top starts at -1).
 */
export function describe(state: S, _settings?: StackSettings, pending?: number): string {
  if (state.size === 0) return `Empty stack in an array of capacity ${state.capacity}.`;
  const items = state.slots
    .slice(0, state.size)
    .map((s, i) => (i === pending || !s ? 'not written yet' : String(s.value)));
  return `Stack with ${state.size} of ${state.capacity} slots used. From bottom to top: ${items.join(', ')}.`;
}
