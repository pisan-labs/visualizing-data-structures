import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** Each value written into the array gets a uid, so the view can animate that value. */
export interface Slot {
  uid: number;
  value: Value;
}

export interface QueueState {
  /** Length of the array. */
  capacity: number;
  /** Physical array contents. Slots outside the queue may hold leftover (stale) values. */
  slots: (Slot | null)[];
  /** Index of the front item. */
  front: number;
  /** Index of the next free slot, one past the rear item. */
  rear: number;
  /**
   * Number of items. The drawing always needs it (front == rear is ambiguous on its own); the
   * code keeps it as a variable only when settings.full is 'count'.
   */
  count: number;
  nextUid: number;
}

export interface QueueSettings {
  [key: string]: Scalar;
  capacity: number;
  /** gap: leave one slot empty, so front == rear means empty (CLRS). count: keep a count. */
  full: 'gap' | 'count';
  layout: 'ring' | 'row';
}

export interface QueueExtra {
  /** A value waiting to be enqueued. */
  incoming?: { uid: number; value: Value; error?: boolean };
  /** Draw this slot as part of the queue even though front and count do not cover it yet. */
  hold?: number;
  /** A copy of a value being returned. */
  out?: { value: Value; from: number; label: string };
}

type S = QueueState;
type X = QueueExtra;
type Op = OpSpec<S, QueueSettings, X>;
type QueueStep = Step<S, X>;

export const defaults: QueueSettings = { capacity: 8, full: 'gap', layout: 'ring' };

export function init(settings: QueueSettings): S {
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

const counting = (settings: QueueSettings) => settings.full === 'count';

/** The code's variables. `count` can lag behind the state by one step, as it does in the code. */
function vars(s: S, settings: QueueSettings, more: Record<string, Scalar> = {}, count = s.count) {
  const out: Record<string, Scalar> = { ...more, front: s.front, rear: s.rear };
  if (counting(settings)) out.count = count;
  out.capacity = s.capacity;
  return out;
}

/** "1 item", "3 items". */
const itemCount = (k: number) => `${k} item${k === 1 ? '' : 's'}`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** "(7 + 1) mod 8 = 0", plus a note when the index runs off the end and wraps around. */
function advance(
  name: string,
  from: number,
  n: number,
): { to: number; say: string; wraps: boolean } {
  const to = (from + 1) % n;
  const wraps = to === 0 && n > 1;
  return {
    to,
    wraps,
    say: wraps
      ? `${name} = (${from} + 1) mod ${n} = 0. ${from} was the last index, so ${name} wraps around to the start of the array.`
      : `${name} = (${from} + 1) mod ${n} = ${to}.`,
  };
}

const enqueue: Op = {
  label: 'Enqueue',
  arity: 1,
  *run(s, [x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const n = s.capacity;
    const gap = !counting(settings);
    const uid = s.nextUid;
    const incoming = { uid, value };
    const next = (s.rear + 1) % n;
    const full = gap ? next === s.front : s.count === n;

    yield {
      state: s,
      marks: gap ? [mark('rear', 'active'), mark('front', 'active')] : [mark('count', 'active')],
      say: gap
        ? `enqueue(${v}): is there room? The slot after rear is (${s.rear} + 1) mod ${n} = ${next}, and front = ${s.front}.`
        : `enqueue(${v}): is there room? count = ${s.count} and capacity = ${n}.`,
      lines: ['enqueue.check'],
      vars: vars(s, settings, { x: value }),
      level: 2,
      extra: { incoming },
    } satisfies QueueStep;

    if (full) {
      yield {
        state: s,
        marks: [
          ...(gap ? [mark('rear', 'error'), mark('front', 'error')] : [mark('count', 'error')]),
          mark(`v${uid}`, 'error'),
        ],
        say: gap
          ? `The slot after rear is front itself, so the queue is full: it holds ${itemCount(n - 1)}, and the one free slot must stay empty. Queue overflow: ${v} is not added.`
          : `count equals capacity, so all ${n} slots are in use. Queue overflow: ${v} is not added.`,
        lines: ['enqueue.overflow'],
        vars: vars(s, settings, { x: value }),
        level: 1,
        extra: { incoming: { ...incoming, error: true } },
      } satisfies QueueStep;
      return s;
    }

    const slots = [...s.slots];
    slots[s.rear] = { uid, value };
    const stored: S = { ...s, slots, nextUid: uid + 1 };
    yield {
      state: stored,
      marks: [mark(`cell-${s.rear}`, 'new'), mark(`v${uid}`, 'new')],
      say: `There is room. Store ${v} in A[rear] = A[${s.rear}].`,
      lines: ['enqueue.store'],
      vars: vars(s, settings, { x: value }),
      level: 2,
      extra: { hold: s.rear },
    } satisfies QueueStep;

    const step = advance('rear', s.rear, n);
    const done: S = { ...stored, rear: step.to, count: s.count + 1 };
    const wrapMarks = step.wraps ? [mark('wrap', 'active')] : [];
    if (gap) {
      yield {
        state: done,
        marks: [mark('rear', 'active'), mark(`v${uid}`, 'done'), ...wrapMarks],
        say: `Move rear forward: ${step.say} ${v} is now at the rear of the queue.`,
        lines: ['enqueue.advance'],
        vars: vars(done, settings, { x: value }),
        level: 1,
      } satisfies QueueStep;
      return done;
    }
    yield {
      state: done,
      marks: [mark('rear', 'active'), ...wrapMarks],
      say: `Move rear forward: ${step.say}`,
      lines: ['enqueue.advance'],
      vars: vars(done, settings, { x: value }, s.count),
      level: 2,
    } satisfies QueueStep;
    yield {
      state: done,
      marks: [mark('count', 'active'), mark(`v${uid}`, 'done')],
      say: `Increment count to ${s.count + 1}. ${v} is now at the rear of the queue.`,
      lines: ['enqueue.count'],
      vars: vars(done, settings, { x: value }),
      level: 1,
    } satisfies QueueStep;
    return done;
  },
};

/** The empty check shared by dequeue and peek. Returns true if the queue is empty. */
function* emptyCheck(
  s: S,
  settings: QueueSettings,
  op: 'dequeue' | 'peek',
): Generator<QueueStep, boolean, void> {
  const gap = !counting(settings);
  yield {
    state: s,
    marks: gap ? [mark('front', 'active'), mark('rear', 'active')] : [mark('count', 'active')],
    say: gap
      ? `${op}(): is the queue empty? front = ${s.front} and rear = ${s.rear}.`
      : `${op}(): is the queue empty? count = ${s.count}.`,
    lines: [`${op}.check`],
    vars: vars(s, settings),
    level: 2,
  };
  if (s.count > 0) return false;
  const what =
    op === 'dequeue'
      ? 'Queue underflow: there is nothing to dequeue.'
      : 'There is nothing to peek at.';
  yield {
    state: s,
    marks: gap ? [mark('front', 'error'), mark('rear', 'error')] : [mark('count', 'error')],
    say: gap
      ? `front equals rear, so the queue is empty. ${what}`
      : `count is 0, so the queue is empty. ${what}`,
    lines: [op === 'dequeue' ? 'dequeue.underflow' : 'peek.empty'],
    vars: vars(s, settings),
    level: 1,
  };
  return true;
}

const dequeue: Op = {
  label: 'Dequeue',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'dequeue')) return s;
    const n = s.capacity;
    const f = s.front;
    const value = s.slots[f]!.value;
    const v = fmt(value);
    const leftover = `${v} stays in the array, but it is no longer part of the queue.`;

    yield {
      state: s,
      marks: [mark(`cell-${f}`, 'active'), mark('out', 'active')],
      say: `Copy the front item: x = A[front] = A[${f}] = ${v}.`,
      lines: ['dequeue.read'],
      vars: vars(s, settings, { x: value }),
      level: 2,
      extra: { out: { value, from: f, label: 'x' } },
    } satisfies QueueStep;

    const step = advance('front', f, n);
    const done: S = { ...s, front: step.to, count: s.count - 1 };
    const wrapMarks = step.wraps ? [mark('wrap', 'active')] : [];
    if (!counting(settings)) {
      yield {
        state: done,
        marks: [mark('front', 'active'), mark('out', 'found'), ...wrapMarks],
        say: `Move front forward: ${step.say} Return x = ${v}. ${leftover}`,
        lines: ['dequeue.advance', 'dequeue.return'],
        vars: vars(done, settings, { x: value, returned: value }),
        level: 1,
        extra: { out: { value, from: f, label: 'returned' } },
      } satisfies QueueStep;
      return done;
    }
    yield {
      state: done,
      marks: [mark('front', 'active'), mark('out', 'active'), ...wrapMarks],
      say: `Move front forward: ${step.say}`,
      lines: ['dequeue.advance'],
      vars: vars(done, settings, { x: value }, s.count),
      level: 2,
      extra: { out: { value, from: f, label: 'x' } },
    } satisfies QueueStep;
    yield {
      state: done,
      marks: [mark('count', 'active'), mark('out', 'found')],
      say: `Decrement count to ${s.count - 1} and return x = ${v}. ${leftover}`,
      lines: ['dequeue.count', 'dequeue.return'],
      vars: vars(done, settings, { x: value, returned: value }),
      level: 1,
      extra: { out: { value, from: f, label: 'returned' } },
    } satisfies QueueStep;
    return done;
  },
};

const peek: Op = {
  label: 'Peek',
  arity: 0,
  *run(s, _args, { settings }) {
    if (yield* emptyCheck(s, settings, 'peek')) return s;
    const f = s.front;
    const value = s.slots[f]!.value;
    yield {
      state: s,
      marks: [mark(`cell-${f}`, 'found'), mark('out', 'found')],
      say: `Return A[front] = A[${f}] = ${fmt(value)}. front does not move, so the queue is unchanged.`,
      lines: ['peek.return'],
      vars: vars(s, settings, { returned: value }),
      level: 1,
      extra: { out: { value, from: f, label: 'returned' } },
    } satisfies QueueStep;
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const empty: S = { ...s, front: 0, rear: 0, count: 0 };
    const reset = counting(settings)
      ? 'front = 0, rear = 0 and count = 0'
      : 'front = 0 and rear = 0';
    yield {
      state: empty,
      marks: [
        mark('front', 'active'),
        mark('rear', 'active'),
        ...(counting(settings) ? [mark('count', 'active')] : []),
      ],
      say:
        s.count === 0
          ? `clear(): set ${reset}. The queue was already empty.`
          : `clear(): set ${reset}. The old values stay in memory as leftovers, and later enqueues will overwrite them.`,
      lines: counting(settings)
        ? ['clear.front', 'clear.rear', 'clear.count']
        : ['clear.front', 'clear.rear'],
      vars: vars(empty, settings),
      level: 1,
    } satisfies QueueStep;
    return empty;
  },
};

export const ops = { enqueue, dequeue, peek, clear };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: QueueSettings): PseudoBlock[] {
  const count = counting(settings);
  const isFull = count ? 'if count == capacity' : 'if (rear + 1) mod capacity == front';
  const isEmpty = count ? 'if count == 0' : 'if front == rear';
  const fullPlain = count ? 'If every slot is in use,' : 'If rear is one step behind front,';
  const emptyPlain = count ? 'If there are no items,' : 'If front has caught up with rear,';
  return [
    {
      op: 'enqueue',
      lines: [
        L('enqueue.sig', 0, 'enqueue(x)', 'To enqueue x:'),
        L('enqueue.check', 1, isFull, fullPlain),
        L('enqueue.overflow', 2, 'error "queue overflow"', 'stop: the queue overflows.'),
        L('enqueue.store', 1, 'A[rear] = x', 'Put x in the free slot at rear.'),
        L(
          'enqueue.advance',
          1,
          'rear = (rear + 1) mod capacity',
          'Move rear one slot forward, wrapping past the end.',
        ),
        ...(count ? [L('enqueue.count', 1, 'count = count + 1', 'Count one more item.')] : []),
      ],
    },
    {
      op: 'dequeue',
      lines: [
        L('dequeue.sig', 0, 'dequeue()', 'To dequeue:'),
        L('dequeue.check', 1, isEmpty, emptyPlain),
        L('dequeue.underflow', 2, 'error "queue underflow"', 'stop: the queue underflows.'),
        L('dequeue.read', 1, 'x = A[front]', 'Copy the front item.'),
        L(
          'dequeue.advance',
          1,
          'front = (front + 1) mod capacity',
          'Move front one slot forward, wrapping past the end.',
        ),
        ...(count ? [L('dequeue.count', 1, 'count = count - 1', 'Count one fewer item.')] : []),
        L('dequeue.return', 1, 'return x', 'Hand back the copy.'),
      ],
    },
    {
      op: 'peek',
      lines: [
        L('peek.sig', 0, 'peek()', 'To peek:'),
        L('peek.check', 1, isEmpty, emptyPlain),
        L('peek.empty', 2, 'error "queue is empty"', 'stop: there is nothing to look at.'),
        L('peek.return', 1, 'return A[front]', 'Hand back the front item and leave it there.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To clear:'),
        L('clear.front', 1, 'front = 0', 'Start front at slot 0.'),
        L('clear.rear', 1, 'rear = 0', 'Start rear at slot 0 too. The old values stay in memory.'),
        ...(count ? [L('clear.count', 1, 'count = 0', 'Say there are no items.')] : []),
      ],
    },
  ];
}

export function initialSay(state: S, settings: QueueSettings): string {
  const n = state.capacity;
  return counting(settings)
    ? `An empty queue: an array A with capacity ${n}, front = 0, rear = 0 and count = 0. count tells full from empty, so all ${n} slots can be used.`
    : `An empty queue: an array A with capacity ${n}, front = 0 and rear = 0. front == rear means empty, so one slot always stays free and the queue holds at most ${itemCount(n - 1)}.`;
}

export function initialVars(state: S, settings: QueueSettings) {
  return vars(state, settings);
}

/** The items from front to rear. */
export function items(state: S): Value[] {
  return Array.from(
    { length: state.count },
    (_, k) => state.slots[(state.front + k) % state.capacity]!.value,
  );
}

/** Screen-reader summary. */
export function describe(state: S, settings?: QueueSettings): string {
  const usable = settings && !counting(settings) ? state.capacity - 1 : state.capacity;
  const where = `front = ${state.front}, rear = ${state.rear}`;
  if (state.count === 0) return `Empty queue in an array of capacity ${state.capacity}; ${where}.`;
  return `Queue with ${state.count} of ${usable} usable slots in use; ${where}. From front to rear: ${items(state).join(', ')}.`;
}
