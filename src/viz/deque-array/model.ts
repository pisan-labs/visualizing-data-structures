import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** Each value written into the array gets a uid, so the view can animate that value. */
export interface Slot {
  uid: number;
  value: Value;
}

export interface DequeState {
  /** Length of the array. */
  capacity: number;
  /** Physical array contents. Slots outside the deque may hold leftover (stale) values. */
  slots: (Slot | null)[];
  /** Index of the first item. */
  front: number;
  /** Index of the slot after the last item. */
  rear: number;
  /**
   * Number of items. The drawing always needs it (front == rear is ambiguous on its own); the
   * code keeps it as a variable only when settings.full is 'count'.
   */
  count: number;
  nextUid: number;
}

export interface DequeSettings {
  [key: string]: Scalar;
  capacity: number;
  /** gap: leave one slot empty, so front == rear means empty. count: keep a count. */
  full: 'gap' | 'count';
  layout: 'ring' | 'row';
}

export interface DequeExtra {
  /** A value waiting to be added to cell `at`. */
  incoming?: { uid: number; value: Value; error?: boolean; at: number };
  /** Draw this slot as part of the deque even though front and count do not cover it. */
  hold?: number;
  /** Draw this slot as not written yet even though front and count cover it. */
  pending?: number;
  /** A copy of a value being returned. */
  out?: { value: Value; from: number; label: string };
}

type S = DequeState;
type X = DequeExtra;
type Op = OpSpec<S, DequeSettings, X>;
type DequeStep = Step<S, X>;

export const defaults: DequeSettings = { capacity: 8, full: 'gap', layout: 'ring' };

export function init(settings: DequeSettings): S {
  return {
    capacity: settings.capacity,
    slots: Array(settings.capacity).fill(null),
    front: 0,
    rear: 0,
    count: 0,
    nextUid: 1,
  };
}

export function fmt(v: Value): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

const counting = (settings: DequeSettings) => settings.full === 'count';

/** The code's variables. `count` can lag behind the state by one step, as it does in the code. */
function vars(s: S, settings: DequeSettings, more: Record<string, Scalar> = {}, count = s.count) {
  const out: Record<string, Scalar> = { ...more, front: s.front, rear: s.rear };
  if (counting(settings)) out.count = count;
  out.capacity = s.capacity;
  return out;
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/**
 * One step forward or back around the array, with a note when the index wraps. As in CLRS,
 * mod is the mathematical one: (0 - 1) mod 6 = 5.
 */
function move(name: string, from: number, n: number, dir: 1 | -1) {
  const to = (from + dir + n) % n;
  const wraps = dir === 1 ? to === 0 : from === 0;
  const formula = dir === 1 ? `(${from} + 1) mod ${n} = ${to}` : `(${from} - 1) mod ${n} = ${to}`;
  const note = !wraps
    ? ''
    : dir === 1
      ? ` ${from} was the last index, so ${name} wraps around to the start of the array.`
      : ` ${name} was at index 0, so it wraps around to the last index.`;
  return { to, wraps, say: `${name} = ${formula}.${note}` };
}

function* fullCheck(
  s: S,
  settings: DequeSettings,
  op: 'addFirst' | 'addLast',
  incoming: NonNullable<X['incoming']>,
): Generator<DequeStep, boolean, void> {
  const n = s.capacity;
  const gap = !counting(settings);
  const next = (s.rear + 1) % n;
  const v = fmt(incoming.value);
  yield {
    state: s,
    marks: gap ? [mark('rear', 'active'), mark('front', 'active')] : [mark('count', 'active')],
    say: gap
      ? `${op}(${v}): is there room? The slot after rear is (${s.rear} + 1) mod ${n} = ${next}, and front = ${s.front}.`
      : `${op}(${v}): is there room? count = ${s.count} and capacity = ${n}.`,
    lines: [`${op}.check`],
    vars: vars(s, settings, { x: incoming.value }),
    level: 2,
    extra: { incoming },
  };
  const full = gap ? next === s.front : s.count === n;
  if (!full) return false;
  yield {
    state: s,
    marks: [
      ...(gap ? [mark('rear', 'error'), mark('front', 'error')] : [mark('count', 'error')]),
      mark(`v${incoming.uid}`, 'error'),
    ],
    say: gap
      ? `The slot after rear is front itself, so the deque is full: it holds ${n - 1} items, and the one free slot must stay empty. Deque overflow: ${v} is not added.`
      : `count equals capacity, so all ${n} slots are in use. Deque overflow: ${v} is not added.`,
    lines: [`${op}.overflow`],
    vars: vars(s, settings, { x: incoming.value }),
    level: 1,
    extra: { incoming: { ...incoming, error: true } },
  };
  return true;
}

function* emptyCheck(
  s: S,
  settings: DequeSettings,
  op: 'removeFirst' | 'removeLast' | 'peekFirst' | 'peekLast',
): Generator<DequeStep, boolean, void> {
  const gap = !counting(settings);
  yield {
    state: s,
    marks: gap ? [mark('front', 'active'), mark('rear', 'active')] : [mark('count', 'active')],
    say: gap
      ? `${op}(): is the deque empty? front = ${s.front} and rear = ${s.rear}.`
      : `${op}(): is the deque empty? count = ${s.count}.`,
    lines: [`${op}.check`],
    vars: vars(s, settings),
    level: 2,
  };
  if (s.count > 0) return false;
  const removing = op.startsWith('remove');
  const what = removing
    ? 'Deque underflow: there is nothing to remove.'
    : 'There is nothing to peek at.';
  yield {
    state: s,
    marks: gap ? [mark('front', 'error'), mark('rear', 'error')] : [mark('count', 'error')],
    say: gap
      ? `front equals rear, so the deque is empty. ${what}`
      : `count is 0, so the deque is empty. ${what}`,
    lines: [removing ? `${op}.underflow` : `${op}.empty`],
    vars: vars(s, settings),
    level: 1,
  };
  return true;
}

const addFirst: Op = {
  label: 'Add first',
  arity: 1,
  *run(s, [x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const n = s.capacity;
    const uid = s.nextUid;
    const step = move('front', s.front, n, -1);
    const incoming = { uid, value, at: step.to };
    if (yield* fullCheck(s, settings, 'addFirst', incoming)) return s;

    const moved: S = { ...s, front: step.to, count: s.count + 1 };
    yield {
      state: moved,
      marks: [mark('front', 'active'), ...(step.wraps ? [mark('wrap', 'active')] : [])],
      say: `There is room. Move front back one slot: ${step.say}`,
      lines: ['addFirst.back'],
      vars: vars(moved, settings, { x: value }, s.count),
      level: 2,
      extra: { incoming, pending: step.to },
    } satisfies DequeStep;

    const slots = [...s.slots];
    slots[step.to] = { uid, value };
    const done: S = { ...moved, slots, nextUid: uid + 1 };
    const stored = `Store ${v} in A[front] = A[${step.to}].`;
    if (!counting(settings)) {
      yield {
        state: done,
        marks: [mark(`cell-${step.to}`, 'new'), mark(`v${uid}`, 'done')],
        say: `${stored} ${v} is now at the front of the deque.`,
        lines: ['addFirst.store'],
        vars: vars(done, settings, { x: value }),
        level: 1,
      } satisfies DequeStep;
      return done;
    }
    yield {
      state: done,
      marks: [mark(`cell-${step.to}`, 'new'), mark(`v${uid}`, 'new')],
      say: stored,
      lines: ['addFirst.store'],
      vars: vars(done, settings, { x: value }, s.count),
      level: 2,
    } satisfies DequeStep;
    yield {
      state: done,
      marks: [mark('count', 'active'), mark(`v${uid}`, 'done')],
      say: `Increment count to ${s.count + 1}. ${v} is now at the front of the deque.`,
      lines: ['addFirst.count'],
      vars: vars(done, settings, { x: value }),
      level: 1,
    } satisfies DequeStep;
    return done;
  },
};

const addLast: Op = {
  label: 'Add last',
  arity: 1,
  *run(s, [x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const n = s.capacity;
    const uid = s.nextUid;
    const incoming = { uid, value, at: s.rear };
    if (yield* fullCheck(s, settings, 'addLast', incoming)) return s;

    const slots = [...s.slots];
    slots[s.rear] = { uid, value };
    const stored: S = { ...s, slots, nextUid: uid + 1 };
    yield {
      state: stored,
      marks: [mark(`cell-${s.rear}`, 'new'), mark(`v${uid}`, 'new')],
      say: `There is room. Store ${v} in A[rear] = A[${s.rear}].`,
      lines: ['addLast.store'],
      vars: vars(s, settings, { x: value }),
      level: 2,
      extra: { hold: s.rear },
    } satisfies DequeStep;

    const step = move('rear', s.rear, n, 1);
    const done: S = { ...stored, rear: step.to, count: s.count + 1 };
    const wrapMarks = step.wraps ? [mark('wrap', 'active')] : [];
    if (!counting(settings)) {
      yield {
        state: done,
        marks: [mark('rear', 'active'), mark(`v${uid}`, 'done'), ...wrapMarks],
        say: `Move rear forward: ${step.say} ${v} is now at the back of the deque.`,
        lines: ['addLast.advance'],
        vars: vars(done, settings, { x: value }),
        level: 1,
      } satisfies DequeStep;
      return done;
    }
    yield {
      state: done,
      marks: [mark('rear', 'active'), ...wrapMarks],
      say: `Move rear forward: ${step.say}`,
      lines: ['addLast.advance'],
      vars: vars(done, settings, { x: value }, s.count),
      level: 2,
    } satisfies DequeStep;
    yield {
      state: done,
      marks: [mark('count', 'active'), mark(`v${uid}`, 'done')],
      say: `Increment count to ${s.count + 1}. ${v} is now at the back of the deque.`,
      lines: ['addLast.count'],
      vars: vars(done, settings, { x: value }),
      level: 1,
    } satisfies DequeStep;
    return done;
  },
};

const leftover = (v: string) => `${v} stays in the array, but it is no longer part of the deque.`;

const removeFirst: Op = {
  label: 'Remove first',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'removeFirst')) return s;
    const n = s.capacity;
    const f = s.front;
    const value = s.slots[f]!.value;
    const v = fmt(value);

    yield {
      state: s,
      marks: [mark(`cell-${f}`, 'active'), mark('out', 'active')],
      say: `Copy the first item: x = A[front] = A[${f}] = ${v}.`,
      lines: ['removeFirst.read'],
      vars: vars(s, settings, { x: value }),
      level: 2,
      extra: { out: { value, from: f, label: 'x' } },
    } satisfies DequeStep;

    const step = move('front', f, n, 1);
    const done: S = { ...s, front: step.to, count: s.count - 1 };
    const wrapMarks = step.wraps ? [mark('wrap', 'active')] : [];
    if (!counting(settings)) {
      yield {
        state: done,
        marks: [mark('front', 'active'), mark('out', 'found'), ...wrapMarks],
        say: `Move front forward: ${step.say} Return x = ${v}. ${leftover(v)}`,
        lines: ['removeFirst.advance', 'removeFirst.return'],
        vars: vars(done, settings, { x: value, returned: value }),
        level: 1,
        extra: { out: { value, from: f, label: 'returned' } },
      } satisfies DequeStep;
      return done;
    }
    yield {
      state: done,
      marks: [mark('front', 'active'), mark('out', 'active'), ...wrapMarks],
      say: `Move front forward: ${step.say}`,
      lines: ['removeFirst.advance'],
      vars: vars(done, settings, { x: value }, s.count),
      level: 2,
      extra: { out: { value, from: f, label: 'x' } },
    } satisfies DequeStep;
    yield {
      state: done,
      marks: [mark('count', 'active'), mark('out', 'found')],
      say: `Decrement count to ${s.count - 1} and return x = ${v}. ${leftover(v)}`,
      lines: ['removeFirst.count', 'removeFirst.return'],
      vars: vars(done, settings, { x: value, returned: value }),
      level: 1,
      extra: { out: { value, from: f, label: 'returned' } },
    } satisfies DequeStep;
    return done;
  },
};

const removeLast: Op = {
  label: 'Remove last',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'removeLast')) return s;
    const n = s.capacity;
    const step = move('rear', s.rear, n, -1);
    const last = step.to;
    const value = s.slots[last]!.value;
    const v = fmt(value);
    const done: S = { ...s, rear: last, count: s.count - 1 };

    yield {
      state: done,
      marks: [
        mark('rear', 'active'),
        mark(`cell-${last}`, 'active'),
        ...(step.wraps ? [mark('wrap', 'active')] : []),
      ],
      say: `Move rear back to the last item: ${step.say}`,
      lines: ['removeLast.back'],
      vars: vars(done, settings, {}, s.count),
      level: 2,
      extra: { hold: last },
    } satisfies DequeStep;

    if (!counting(settings)) {
      yield {
        state: done,
        marks: [mark('out', 'found')],
        say: `Copy x = A[rear] = A[${last}] = ${v} and return it. ${leftover(v)}`,
        lines: ['removeLast.read', 'removeLast.return'],
        vars: vars(done, settings, { x: value, returned: value }),
        level: 1,
        extra: { out: { value, from: last, label: 'returned' } },
      } satisfies DequeStep;
      return done;
    }
    yield {
      state: done,
      marks: [mark(`cell-${last}`, 'active'), mark('out', 'active')],
      say: `Copy the last item: x = A[rear] = A[${last}] = ${v}.`,
      lines: ['removeLast.read'],
      vars: vars(done, settings, { x: value }, s.count),
      level: 2,
      extra: { hold: last, out: { value, from: last, label: 'x' } },
    } satisfies DequeStep;
    yield {
      state: done,
      marks: [mark('count', 'active'), mark('out', 'found')],
      say: `Decrement count to ${s.count - 1} and return x = ${v}. ${leftover(v)}`,
      lines: ['removeLast.count', 'removeLast.return'],
      vars: vars(done, settings, { x: value, returned: value }),
      level: 1,
      extra: { out: { value, from: last, label: 'returned' } },
    } satisfies DequeStep;
    return done;
  },
};

const peekFirst: Op = {
  label: 'Peek first',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'peekFirst')) return s;
    const f = s.front;
    const value = s.slots[f]!.value;
    yield {
      state: s,
      marks: [mark(`cell-${f}`, 'found'), mark('out', 'found')],
      say: `Return A[front] = A[${f}] = ${fmt(value)}. Nothing moves, so the deque is unchanged.`,
      lines: ['peekFirst.return'],
      vars: vars(s, settings, { returned: value }),
      level: 1,
      extra: { out: { value, from: f, label: 'returned' } },
    } satisfies DequeStep;
    return s;
  },
};

const peekLast: Op = {
  label: 'Peek last',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'peekLast')) return s;
    const n = s.capacity;
    const last = (s.rear - 1 + n) % n;
    const value = s.slots[last]!.value;
    yield {
      state: s,
      marks: [mark(`cell-${last}`, 'found'), mark('out', 'found')],
      say: `The last item sits just before rear, at (${s.rear} - 1) mod ${n} = ${last}. Return A[${last}] = ${fmt(value)}. Nothing moves.`,
      lines: ['peekLast.return'],
      vars: vars(s, settings, { returned: value }),
      level: 1,
      extra: { out: { value, from: last, label: 'returned' } },
    } satisfies DequeStep;
    return s;
  },
};

export const ops = { addFirst, addLast, removeFirst, removeLast, peekFirst, peekLast };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: DequeSettings): PseudoBlock[] {
  const count = counting(settings);
  const full = (op: string) => [
    L(
      `${op}.check`,
      1,
      count ? 'if count == capacity' : 'if (rear + 1) mod capacity == front',
      count ? 'If every slot is in use,' : 'If rear is one step behind front,',
    ),
    L(`${op}.overflow`, 2, 'error "deque overflow"', 'stop: the deque overflows.'),
  ];
  const empty = (op: string, error: string, msg: string, plain: string) => [
    L(
      `${op}.check`,
      1,
      count ? 'if count == 0' : 'if front == rear',
      count ? 'If there are no items,' : 'If front has caught up with rear,',
    ),
    L(`${op}.${error}`, 2, `error "${msg}"`, plain),
  ];
  const inc = (op: string) =>
    count ? [L(`${op}.count`, 1, 'count = count + 1', 'Count one more item.')] : [];
  const dec = (op: string) =>
    count ? [L(`${op}.count`, 1, 'count = count - 1', 'Count one fewer item.')] : [];
  const underflow = 'stop: the deque underflows.';
  const nothing = 'stop: there is nothing to look at.';
  return [
    {
      op: 'addFirst',
      lines: [
        L('addFirst.sig', 0, 'addFirst(x)', 'To add x at the front:'),
        ...full('addFirst'),
        L(
          'addFirst.back',
          1,
          'front = (front - 1) mod capacity',
          'Move front back one slot, wrapping from 0 to the last index.',
        ),
        L('addFirst.store', 1, 'A[front] = x', 'Put x in that slot.'),
        ...inc('addFirst'),
      ],
    },
    {
      op: 'addLast',
      lines: [
        L('addLast.sig', 0, 'addLast(x)', 'To add x at the back:'),
        ...full('addLast'),
        L('addLast.store', 1, 'A[rear] = x', 'Put x in the free slot at rear.'),
        L(
          'addLast.advance',
          1,
          'rear = (rear + 1) mod capacity',
          'Move rear one slot forward, wrapping past the end.',
        ),
        ...inc('addLast'),
      ],
    },
    {
      op: 'removeFirst',
      lines: [
        L('removeFirst.sig', 0, 'removeFirst()', 'To remove the first item:'),
        ...empty('removeFirst', 'underflow', 'deque underflow', underflow),
        L('removeFirst.read', 1, 'x = A[front]', 'Copy the first item.'),
        L(
          'removeFirst.advance',
          1,
          'front = (front + 1) mod capacity',
          'Move front one slot forward, wrapping past the end.',
        ),
        ...dec('removeFirst'),
        L('removeFirst.return', 1, 'return x', 'Hand back the copy.'),
      ],
    },
    {
      op: 'removeLast',
      lines: [
        L('removeLast.sig', 0, 'removeLast()', 'To remove the last item:'),
        ...empty('removeLast', 'underflow', 'deque underflow', underflow),
        L(
          'removeLast.back',
          1,
          'rear = (rear - 1) mod capacity',
          'Move rear back to the last item, wrapping from 0 to the last index.',
        ),
        L('removeLast.read', 1, 'x = A[rear]', 'Copy that item.'),
        ...dec('removeLast'),
        L('removeLast.return', 1, 'return x', 'Hand back the copy.'),
      ],
    },
    {
      op: 'peekFirst',
      lines: [
        L('peekFirst.sig', 0, 'peekFirst()', 'To look at the first item:'),
        ...empty('peekFirst', 'empty', 'deque is empty', nothing),
        L('peekFirst.return', 1, 'return A[front]', 'Hand back the first item and leave it there.'),
      ],
    },
    {
      op: 'peekLast',
      lines: [
        L('peekLast.sig', 0, 'peekLast()', 'To look at the last item:'),
        ...empty('peekLast', 'empty', 'deque is empty', nothing),
        L(
          'peekLast.return',
          1,
          'return A[(rear - 1) mod capacity]',
          'Hand back the item just before rear and leave it there.',
        ),
      ],
    },
  ];
}

export function initialSay(state: S, settings: DequeSettings): string {
  const n = state.capacity;
  return counting(settings)
    ? `An empty deque: an array A with capacity ${n}, front = 0, rear = 0 and count = 0. Items can join or leave at either end, and all ${n} slots can be used.`
    : `An empty deque: an array A with capacity ${n}, front = 0 and rear = 0. Items can join or leave at either end. front == rear means empty, so one slot stays free and the deque holds at most ${n - 1} items.`;
}

export function initialVars(state: S, settings: DequeSettings) {
  return vars(state, settings);
}

/** The items from front to back. */
export function items(state: S): Value[] {
  return Array.from(
    { length: state.count },
    (_, k) => state.slots[(state.front + k) % state.capacity]!.value,
  );
}

/** Screen-reader summary. */
export function describe(state: S, settings?: DequeSettings, pending?: number): string {
  const usable = settings && !counting(settings) ? state.capacity - 1 : state.capacity;
  const where = `front = ${state.front}, rear = ${state.rear}`;
  if (state.count === 0) return `Empty deque in an array of capacity ${state.capacity}; ${where}.`;
  const list = Array.from({ length: state.count }, (_, k) => {
    const i = (state.front + k) % state.capacity;
    return i === pending ? 'not written yet' : String(state.slots[i]?.value ?? 'not written yet');
  });
  return `Deque with ${state.count} of ${usable} usable slots in use; ${where}. From front to back: ${list.join(', ')}.`;
}
