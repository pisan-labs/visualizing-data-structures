import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** The largest array this page draws (two rows of eight). */
export const MAX_CAPACITY = 16;

/** Each value written into the array gets a uid, so the view can animate that value. */
export interface Slot {
  uid: number;
  value: Value;
}

export interface DynState {
  capacity: number;
  /** Physical array contents. Slots at or above `size` may hold leftover (stale) values. */
  slots: (Slot | null)[];
  size: number;
  /** Which array is in use. A resize makes a new one, with new cell ids, so the old can fade. */
  gen: number;
  /** Element copies made by every resize so far. */
  copies: number;
  /** Successful appends so far. */
  appends: number;
  /** Elements moved by insert and remove shifting so far. */
  shifts: number;
  nextUid: number;
}

export interface DynSettings {
  [key: string]: Scalar;
  growth: '2' | '1.5';
  /** quarter: halve at a quarter full (CLRS). half: halve at half full, which can thrash. */
  shrink: 'quarter' | 'never' | 'half';
  start: number;
}

export interface DynExtra {
  /** A value waiting to be stored in A[at]. */
  incoming?: { uid: number; value: Value; error?: boolean; at: number };
  /** A copy of a value being returned. */
  out?: { value: Value; from: number; label: string };
  /** Draw A[0..live-1] as part of the array, overriding size for this step. */
  live?: number;
  /** The new array during a resize. */
  next?: { gen: number; capacity: number; slots: (Slot | null)[] };
  /** How many of A's items have been copied into the new array so far. */
  copied?: number;
}

type S = DynState;
type X = DynExtra;
type Op = OpSpec<S, DynSettings, X>;
type DynStep = Step<S, X>;

export const defaults: DynSettings = { growth: '2', shrink: 'quarter', start: 1 };

export function init(settings: DynSettings): S {
  const capacity = Math.max(1, Math.min(MAX_CAPACITY, settings.start));
  return {
    capacity,
    slots: Array(capacity).fill(null),
    size: 0,
    gen: 1,
    copies: 0,
    appends: 0,
    shifts: 0,
    nextUid: 1,
  };
}

export function fmt(v: Value): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

export const cellId = (gen: number, i: number) => `a${gen}-cell-${i}`;

/** The capacity append grows to. Rounding 1.5 up means even capacity 1 grows. */
export function grownCapacity(capacity: number, settings: DynSettings): number {
  return settings.growth === '2' ? 2 * capacity : Math.ceil(1.5 * capacity);
}

function growFormula(capacity: number, settings: DynSettings): string {
  return settings.growth === '2' ? `2 × ${capacity}` : `⌈1.5 × ${capacity}⌉`;
}

/** Whether a removal that left `size` items shrinks the array (integer division, as in code). */
export function shrinks(size: number, capacity: number, settings: DynSettings): boolean {
  if (settings.shrink === 'never') return false;
  return size > 0 && size === Math.floor(capacity / (settings.shrink === 'quarter' ? 4 : 2));
}

const per = (s: S) => Math.round((s.copies / s.appends) * 100) / 100;

function vars(s: S, more: Record<string, Scalar> = {}) {
  const out: Record<string, Scalar> = {
    ...more,
    size: s.size,
    capacity: s.capacity,
    copies: s.copies,
    appends: s.appends,
  };
  if (s.appends > 0) out['copies/append'] = per(s);
  out.shifts = s.shifts;
  return out;
}

/** "1 slot", "4 slots". */
const slotCount = (k: number) => `${k} slot${k === 1 ? '' : 's'}`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

function amortized(s: S): string {
  const copies = `${s.copies} ${s.copies === 1 ? 'copy' : 'copies'}`;
  const appends = s.appends === 1 ? '1 append has' : `${s.appends} appends have`;
  return `So far ${appends} cost ${copies}, ${per(s)} per append.`;
}

/**
 * Copy every item into a new array of `capacity` slots and switch to it. Yields an allocate
 * step, one step per copy (fine detail, except the last), and the switch.
 */
function* resize(
  s: S,
  capacity: number,
  reason: string,
  lines: string[],
  more: Record<string, Scalar>,
  keep: Pick<X, 'incoming' | 'out'>,
): Generator<DynStep, S, void> {
  const gen = s.gen + 1;
  const slots: (Slot | null)[] = Array(capacity).fill(null);
  const c = { c: capacity };
  yield {
    state: s,
    marks: [mark(`name-${gen}`, 'new')],
    say: `${reason} Allocate a new array B with ${slotCount(capacity)}.`,
    lines: [...lines, 'resize.alloc'],
    vars: vars(s, { ...more, ...c }),
    level: 2,
    extra: { ...keep, next: { gen, capacity, slots: [...slots] } },
  };
  let cur = s;
  for (let k = 0; k < s.size; k++) {
    const slot = s.slots[k]!;
    slots[k] = slot;
    cur = { ...cur, copies: cur.copies + 1 };
    const last = k === s.size - 1;
    const copied = `Copy A[${k}] = ${fmt(slot.value)} into B[${k}].`;
    yield {
      state: cur,
      marks: [mark(cellId(gen, k), 'new'), mark(`v${slot.uid}`, 'active')],
      say: last
        ? `${copied} ${s.size === 1 ? 'The only item is' : `All ${s.size} items are`} in B now: ${s.size} ${s.size === 1 ? 'copy' : 'copies'} for this resize, ${cur.copies} in total.`
        : copied,
      lines: ['resize.loop', 'resize.copy'],
      vars: vars(cur, { ...more, ...c, k }),
      level: last ? 2 : 3,
      extra: { ...keep, next: { gen, capacity, slots: [...slots] }, copied: k + 1 },
    };
  }
  const done: S = { ...cur, capacity, slots, gen };
  yield {
    state: done,
    marks: [mark('capacity', 'active'), mark(`name-${gen}`, 'active')],
    say: `A = B: the new array takes over and the old one is freed. capacity = ${capacity}.`,
    lines: ['resize.swap', 'resize.cap'],
    vars: vars(done, { ...more, ...c }),
    level: 2,
    extra: keep,
  };
  return done;
}

/** Grow before adding, or explain that this page cannot draw a bigger array. */
function* growIfFull(
  s: S,
  settings: DynSettings,
  op: 'append' | 'insert',
  more: Record<string, Scalar>,
  incoming: NonNullable<X['incoming']>,
): Generator<DynStep, S | null, void> {
  if (op === 'insert') {
    yield {
      state: s,
      marks: [mark('size', 'active'), mark('capacity', 'active')],
      say: `Is there room? size = ${s.size} and capacity = ${s.capacity}.`,
      lines: ['insert.full'],
      vars: vars(s, more),
      level: s.size < s.capacity ? 3 : 2,
      extra: { incoming },
    };
  }
  if (s.size < s.capacity) return s;
  const capacity = grownCapacity(s.capacity, settings);
  if (capacity > MAX_CAPACITY) {
    yield {
      state: s,
      marks: [mark('capacity', 'error'), mark(`v${incoming.uid}`, 'error')],
      say: `The array is full, and growing it would take ${capacity} slots. This page draws at most ${MAX_CAPACITY}, so it stops here; a real dynamic array would keep growing.`,
      lines: [`${op}.grow`],
      vars: vars(s, more),
      level: 1,
      extra: { incoming: { ...incoming, error: true } },
    };
    return null;
  }
  const reason = `size = ${s.size} equals capacity, so the array is full. Grow it to ${growFormula(s.capacity, settings)} = ${capacity}.`;
  return yield* resize(s, capacity, reason, [`${op}.grow`], more, { incoming });
}

/** Shrink after a removal if the setting says so; otherwise a fine-detail note. */
function* shrinkIfSparse(
  s: S,
  settings: DynSettings,
  op: 'removeAt' | 'removeLast',
  more: Record<string, Scalar>,
  out: NonNullable<X['out']>,
): Generator<DynStep, S, void> {
  if (settings.shrink === 'never') return s;
  const d = settings.shrink === 'quarter' ? 4 : 2;
  const part = d === 4 ? 'a quarter' : 'half';
  const limit = Math.floor(s.capacity / d);
  if (!shrinks(s.size, s.capacity, settings)) {
    yield {
      state: s,
      marks: [mark('size', 'compare')],
      say:
        s.size === 0
          ? `size is 0, so there is nothing to copy and the array keeps its ${slotCount(s.capacity)}.`
          : `Shrink? size = ${s.size}, and ${part} of capacity is ${s.capacity} / ${d} = ${limit}. Not equal, so no.`,
      lines: [`${op}.sparse`],
      vars: vars(s, more),
      level: 3,
      extra: { out },
    };
    return s;
  }
  const capacity = Math.floor(s.capacity / 2);
  const reason = `size = ${s.size} is ${part} of capacity = ${s.capacity}, so shrink to ${s.capacity} / 2 = ${capacity}.${d === 2 ? ' Shrinking this early leaves the new array full.' : ''}`;
  return yield* resize(s, capacity, reason, [`${op}.sparse`, `${op}.shrink`], more, { out });
}

/** null if `i` is a usable index from 0 to `max`, otherwise why not. */
function badIndex(i: Value, max: number): string | null {
  if (typeof i !== 'number' || !Number.isInteger(i))
    return `${fmt(i)} is not a whole number, so it cannot be an index.`;
  if (max < 0) return 'The array is empty, so no index is valid.';
  if (i < 0 || i > max) return `${i} is outside 0 to ${max}.`;
  return null;
}

/** The range check shared by get, set, insert and removeAt. Returns true if the index is bad. */
function* indexCheck(
  s: S,
  op: 'get' | 'set' | 'insert' | 'removeAt',
  i: Value,
  call: string,
  more: Record<string, Scalar>,
  keep: Pick<X, 'incoming'> = {},
): Generator<DynStep, boolean, void> {
  const max = op === 'insert' ? s.size : s.size - 1;
  yield {
    state: s,
    marks: [mark('size', 'active')],
    say:
      op === 'insert'
        ? `${call}: is ${fmt(i)} a valid position? Positions run from 0 to size = ${s.size}.`
        : s.size === 0
          ? `${call}: is ${fmt(i)} a valid index? size is 0, so there are none.`
          : `${call}: is ${fmt(i)} a valid index? Indices run from 0 to size - 1 = ${max}.`,
    lines: [`${op}.check`],
    vars: vars(s, more),
    level: 2,
    extra: keep,
  };
  const why = badIndex(i, max);
  if (!why) return false;
  yield {
    state: s,
    marks: [
      mark('size', 'error'),
      ...(keep.incoming ? [mark(`v${keep.incoming.uid}`, 'error')] : []),
    ],
    say: `${why} Index out of range: ${op === 'get' ? 'there is nothing to return' : 'nothing changes'}.`,
    lines: [`${op}.error`],
    vars: vars(s, more),
    level: 1,
    extra: keep.incoming ? { incoming: { ...keep.incoming, error: true } } : {},
  };
  return true;
}

const append: Op = {
  label: 'Append',
  arity: 1,
  *run(s, [x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const uid = s.nextUid;
    const incoming = { uid, value, at: s.size };
    const more = { x: value };
    yield {
      state: s,
      marks: [mark('size', 'active'), mark('capacity', 'active')],
      say: `append(${v}): is there room? size = ${s.size} and capacity = ${s.capacity}.`,
      lines: ['append.check'],
      vars: vars(s, more),
      level: 2,
      extra: { incoming },
    } satisfies DynStep;

    const cur = yield* growIfFull(s, settings, 'append', more, incoming);
    if (!cur) return s;

    const slots = [...cur.slots];
    slots[cur.size] = { uid, value };
    const stored: S = { ...cur, slots, nextUid: uid + 1 };
    yield {
      state: stored,
      marks: [mark(cellId(cur.gen, cur.size), 'new'), mark(`v${uid}`, 'new')],
      say: `${cur === s ? 'There is room. ' : ''}Store ${v} in A[size] = A[${cur.size}].`,
      lines: ['append.store'],
      vars: vars(cur, more),
      level: 2,
      extra: { live: cur.size + 1 },
    } satisfies DynStep;

    const done: S = { ...stored, size: cur.size + 1, appends: cur.appends + 1 };
    yield {
      state: done,
      marks: [mark('size', 'active'), mark(`v${uid}`, 'done')],
      say: `Increment size to ${done.size}. ${amortized(done)}`,
      lines: ['append.inc'],
      vars: vars(done, more),
      level: 1,
    } satisfies DynStep;
    return done;
  },
};

const insert: Op = {
  label: 'Insert',
  arity: 2,
  *run(s, [i, x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const uid = s.nextUid;
    const index = i as Value;
    const more = { i: index, x: value };
    const incoming = { uid, value, at: typeof index === 'number' ? index : s.size };
    const call = `insert(${fmt(index)}, ${v})`;
    if (yield* indexCheck(s, 'insert', index, call, more, { incoming })) return s;
    const at = index as number;

    const grown = yield* growIfFull(s, settings, 'insert', more, incoming);
    if (!grown) return s;

    // x keeps its uid while it waits; the leftover copies that shifting leaves get new ones.
    let cur: S = { ...grown, nextUid: uid + 1 };
    const moving = cur.size - at;
    for (let j = cur.size; j > at; j--) {
      const slots: (Slot | null)[] = [...cur.slots];
      const slot = slots[j - 1]!;
      slots[j] = slot;
      slots[j - 1] = { uid: cur.nextUid, value: slot.value };
      cur = { ...cur, slots, nextUid: cur.nextUid + 1, shifts: cur.shifts + 1 };
      const last = j === at + 1;
      const shifted = `Shift A[${j - 1}] = ${fmt(slot.value)} right into A[${j}].`;
      yield {
        state: cur,
        marks: [mark(cellId(cur.gen, j), 'active'), mark(`v${slot.uid}`, 'active')],
        say: last
          ? `${shifted} ${moving} ${moving === 1 ? 'item has' : 'items have'} moved right to make room at A[${at}].`
          : shifted,
        lines: ['insert.loop', 'insert.shift'],
        vars: vars(cur, { ...more, j }),
        level: last ? 2 : 3,
        extra: { incoming, live: cur.size + 1 },
      } satisfies DynStep;
    }

    const slots = [...cur.slots];
    slots[at] = { uid, value };
    const stored: S = { ...cur, slots };
    yield {
      state: stored,
      marks: [mark(cellId(cur.gen, at), 'new'), mark(`v${uid}`, 'new')],
      say:
        moving === 0
          ? `Nothing sits at or after A[${at}], so nothing shifts. Store ${v} in A[${at}].`
          : `Store ${v} in A[${at}], overwriting the leftover copy there.`,
      lines: ['insert.store'],
      vars: vars(cur, more),
      level: 2,
      extra: { live: cur.size + 1 },
    } satisfies DynStep;

    const done: S = { ...stored, size: cur.size + 1 };
    yield {
      state: done,
      marks: [mark('size', 'active'), mark(`v${uid}`, 'done')],
      say: `Increment size to ${done.size}. ${v} is now at index ${at}.`,
      lines: ['insert.inc'],
      vars: vars(done, more),
      level: 1,
    } satisfies DynStep;
    return done;
  },
};

const removeAt: Op = {
  label: 'Remove at',
  arity: 1,
  *run(s, [i], { settings }) {
    const index = i as Value;
    const call = `removeAt(${fmt(index)})`;
    if (yield* indexCheck(s, 'removeAt', index, call, { i: index })) return s;
    const at = index as number;
    const value = s.slots[at]!.value;
    const v = fmt(value);
    const more = { i: index, x: value };
    const outX = { value, from: at, label: 'x' };
    yield {
      state: s,
      marks: [mark(cellId(s.gen, at), 'active'), mark('out', 'active')],
      say: `Copy the item: x = A[${at}] = ${v}.`,
      lines: ['removeAt.read'],
      vars: vars(s, more),
      level: 2,
      extra: { out: outX },
    } satisfies DynStep;

    let cur = s;
    const moving = s.size - 1 - at;
    for (let j = at; j < s.size - 1; j++) {
      const slots = [...cur.slots];
      const slot = slots[j + 1]!;
      slots[j] = slot;
      slots[j + 1] = { uid: cur.nextUid, value: slot.value };
      cur = { ...cur, slots, nextUid: cur.nextUid + 1, shifts: cur.shifts + 1 };
      const last = j === s.size - 2;
      const shifted = `Shift A[${j + 1}] = ${fmt(slot.value)} left into A[${j}].`;
      yield {
        state: cur,
        marks: [mark(cellId(cur.gen, j), 'active'), mark(`v${slot.uid}`, 'active')],
        say: last
          ? `${shifted} ${moving} ${moving === 1 ? 'item has' : 'items have'} moved left to close the gap.`
          : shifted,
        lines: ['removeAt.loop', 'removeAt.shift'],
        vars: vars(cur, { ...more, j }),
        level: last ? 2 : 3,
        extra: { out: outX },
      } satisfies DynStep;
    }

    cur = { ...cur, size: cur.size - 1 };
    const leftover = cur.slots[cur.size]!;
    yield {
      state: cur,
      marks: [mark('size', 'active')],
      say:
        moving === 0
          ? `${at} was the last index, so nothing shifts. Decrement size to ${cur.size}.`
          : `Decrement size to ${cur.size}. A[${cur.size}] still holds a leftover copy of ${fmt(leftover.value)}, but it is past the end now.`,
      lines: ['removeAt.dec'],
      vars: vars(cur, more),
      level: 2,
      extra: { out: outX },
    } satisfies DynStep;

    cur = yield* shrinkIfSparse(cur, settings, 'removeAt', more, outX);
    yield {
      state: cur,
      marks: [mark('out', 'found')],
      say: `Return x = ${v}.`,
      lines: ['removeAt.return'],
      vars: vars(cur, { ...more, returned: value }),
      level: 1,
      extra: { out: { ...outX, label: 'returned' } },
    } satisfies DynStep;
    return cur;
  },
};

const removeLast: Op = {
  label: 'Remove last',
  arity: 0,
  *run(s, _args, { settings }) {
    yield {
      state: s,
      marks: [mark('size', 'active')],
      say: `removeLast(): is the array empty? size = ${s.size}.`,
      lines: ['removeLast.check'],
      vars: vars(s),
      level: 2,
    } satisfies DynStep;
    if (s.size === 0) {
      yield {
        state: s,
        marks: [mark('size', 'error')],
        say: 'size is 0, so the array is empty. There is nothing to remove.',
        lines: ['removeLast.empty'],
        vars: vars(s),
        level: 1,
      } satisfies DynStep;
      return s;
    }
    const at = s.size - 1;
    const value = s.slots[at]!.value;
    const v = fmt(value);
    let cur: S = { ...s, size: at };
    yield {
      state: cur,
      marks: [mark('size', 'active'), mark(cellId(s.gen, at), 'active')],
      say: `Decrement size to ${at}. A[${at}] holds the last item, ${v}.`,
      lines: ['removeLast.dec'],
      vars: vars(cur),
      level: 2,
      extra: { live: s.size },
    } satisfies DynStep;
    const outX = { value, from: at, label: 'x' };
    yield {
      state: cur,
      marks: [mark('out', 'active')],
      say: `Copy x = A[${at}] = ${v}. The value stays in the array as a leftover.`,
      lines: ['removeLast.read'],
      vars: vars(cur, { x: value }),
      level: 2,
      extra: { out: outX },
    } satisfies DynStep;
    cur = yield* shrinkIfSparse(cur, settings, 'removeLast', { x: value }, outX);
    yield {
      state: cur,
      marks: [mark('out', 'found')],
      say: `Return x = ${v}.`,
      lines: ['removeLast.return'],
      vars: vars(cur, { x: value, returned: value }),
      level: 1,
      extra: { out: { ...outX, label: 'returned' } },
    } satisfies DynStep;
    return cur;
  },
};

const get: Op = {
  label: 'Get',
  arity: 1,
  *run(s, [i]) {
    const index = i as Value;
    if (yield* indexCheck(s, 'get', index, `get(${fmt(index)})`, { i: index })) return s;
    const at = index as number;
    const value = s.slots[at]!.value;
    yield {
      state: s,
      marks: [mark(cellId(s.gen, at), 'found'), mark('out', 'found')],
      say: `Return A[${at}] = ${fmt(value)}. One step, however big the array is.`,
      lines: ['get.return'],
      vars: vars(s, { i: index, returned: value }),
      level: 1,
      extra: { out: { value, from: at, label: 'returned' } },
    } satisfies DynStep;
    return s;
  },
};

const set: Op = {
  label: 'Set',
  arity: 2,
  *run(s, [i, x]) {
    const index = i as Value;
    const value = x as Value;
    const v = fmt(value);
    const uid = s.nextUid;
    const more = { i: index, x: value };
    const incoming = { uid, value, at: typeof index === 'number' ? index : 0 };
    const call = `set(${fmt(index)}, ${v})`;
    if (yield* indexCheck(s, 'set', index, call, more, { incoming })) return s;
    const at = index as number;
    const old = s.slots[at]!.value;
    const slots = [...s.slots];
    slots[at] = { uid, value };
    const done: S = { ...s, slots, nextUid: uid + 1 };
    yield {
      state: done,
      marks: [mark(cellId(s.gen, at), 'new'), mark(`v${uid}`, 'done')],
      say: `A[${at}] = ${v}. The old value, ${fmt(old)}, is gone, and nothing else moves.`,
      lines: ['set.store'],
      vars: vars(done, more),
      level: 1,
    } satisfies DynStep;
    return done;
  },
};

export const ops = { append, insert, removeAt, removeLast, get, set };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: DynSettings): PseudoBlock[] {
  const double = settings.growth === '2';
  const grow = (op: string) => [
    L(`${op}.full`, 1, 'if size == capacity', 'If every slot is in use,'),
    L(
      `${op}.grow`,
      2,
      double ? 'resize(2 × capacity)' : 'resize(⌈1.5 × capacity⌉)',
      double
        ? 'move everything to an array twice as big.'
        : 'move everything to an array 1.5 times as big.',
    ),
  ];
  const d = settings.shrink === 'quarter' ? 4 : 2;
  const shrink = (op: string) =>
    settings.shrink === 'never'
      ? []
      : [
          L(
            `${op}.sparse`,
            1,
            `if size > 0 and size == capacity / ${d}`,
            `If the array is down to ${d === 4 ? 'a quarter' : 'half'} full (rounding down),`,
          ),
          L(`${op}.shrink`, 2, 'resize(capacity / 2)', 'move everything to an array half as big.'),
        ];
  const resize = [
    L('resize.sig', 0, 'resize(c)', 'To resize to c slots:'),
    L('resize.alloc', 1, 'B = new array of c slots', 'Get a new, empty array.'),
    L('resize.loop', 1, 'for k = 0 to size - 1', 'For each item, in order,'),
    L('resize.copy', 2, 'B[k] = A[k]', 'copy it to the same index in the new array.'),
    L('resize.swap', 1, 'A = B', 'Use the new array from now on. The old one is freed.'),
    L('resize.cap', 1, 'capacity = c', 'Remember the new capacity.'),
  ];
  const range = (op: string, test: string, plain: string) => [
    L(`${op}.check`, 1, test, plain),
    L(`${op}.error`, 2, 'error "index out of range"', 'stop: there is no such index.'),
  ];
  const valid = 'if i < 0 or i ≥ size';
  const validPlain = 'If i is not the index of an item,';
  return [
    {
      op: 'append',
      lines: [
        L('append.sig', 0, 'append(x)', 'To add x at the end:'),
        L('append.check', 1, 'if size == capacity', 'If every slot is in use,'),
        L(
          'append.grow',
          2,
          double ? 'resize(2 × capacity)' : 'resize(⌈1.5 × capacity⌉)',
          double
            ? 'move everything to an array twice as big.'
            : 'move everything to an array 1.5 times as big.',
        ),
        L('append.store', 1, 'A[size] = x', 'Put x in the first free slot.'),
        L('append.inc', 1, 'size = size + 1', 'Count one more item.'),
        ...resize,
      ],
    },
    {
      op: 'insert',
      lines: [
        L('insert.sig', 0, 'insert(i, x)', 'To insert x at index i:'),
        ...range('insert', 'if i < 0 or i > size', 'If i is not a position from 0 to size,'),
        ...grow('insert'),
        L('insert.loop', 1, 'for j = size down to i + 1', 'From the end back to i,'),
        L('insert.shift', 2, 'A[j] = A[j - 1]', 'move each item one slot right.'),
        L('insert.store', 1, 'A[i] = x', 'Put x in the gap.'),
        L('insert.inc', 1, 'size = size + 1', 'Count one more item.'),
        ...resize,
      ],
    },
    {
      op: 'removeAt',
      lines: [
        L('removeAt.sig', 0, 'removeAt(i)', 'To remove the item at index i:'),
        ...range('removeAt', valid, validPlain),
        L('removeAt.read', 1, 'x = A[i]', 'Copy the item.'),
        L('removeAt.loop', 1, 'for j = i to size - 2', 'From i to the end,'),
        L('removeAt.shift', 2, 'A[j] = A[j + 1]', 'move each later item one slot left.'),
        L('removeAt.dec', 1, 'size = size - 1', 'Count one fewer item.'),
        ...shrink('removeAt'),
        L('removeAt.return', 1, 'return x', 'Hand back the copy.'),
        ...(settings.shrink === 'never' ? [] : resize),
      ],
    },
    {
      op: 'removeLast',
      lines: [
        L('removeLast.sig', 0, 'removeLast()', 'To remove the last item:'),
        L('removeLast.check', 1, 'if size == 0', 'If there are no items,'),
        L('removeLast.empty', 2, 'error "array is empty"', 'stop: there is nothing to remove.'),
        L('removeLast.dec', 1, 'size = size - 1', 'Count one fewer item.'),
        L('removeLast.read', 1, 'x = A[size]', 'Copy the item that was last.'),
        ...shrink('removeLast'),
        L('removeLast.return', 1, 'return x', 'Hand back the copy.'),
        ...(settings.shrink === 'never' ? [] : resize),
      ],
    },
    {
      op: 'get',
      lines: [
        L('get.sig', 0, 'get(i)', 'To read index i:'),
        ...range('get', valid, validPlain),
        L('get.return', 1, 'return A[i]', 'Hand back the item. No searching needed.'),
      ],
    },
    {
      op: 'set',
      lines: [
        L('set.sig', 0, 'set(i, x)', 'To overwrite index i with x:'),
        ...range('set', valid, validPlain),
        L('set.store', 1, 'A[i] = x', 'Replace the item.'),
      ],
    },
  ];
}

export function initialSay(state: S, settings: DynSettings): string {
  const how = settings.growth === '2' ? 'twice as big' : 'about 1.5 times as big';
  return `An empty dynamic array: size = 0 and capacity = ${state.capacity}. When it fills up, append copies everything into a new array ${how}.`;
}

export function initialVars(state: S) {
  return vars(state);
}

/** The items, in order. */
export function items(state: S): Value[] {
  return state.slots.slice(0, state.size).map((s) => s!.value);
}

/** Screen-reader summary. */
export function describe(state: S, _settings?: DynSettings, extra?: X): string {
  const head = `Dynamic array with size ${state.size} and capacity ${state.capacity}`;
  const list = state.size ? `: ${items(state).join(', ')}.` : '.';
  const copying = extra?.next
    ? ` Copying into a new array of ${extra.next.capacity} slots: ${extra.copied ?? 0} of ${state.size} items copied.`
    : '';
  return `${head}${list}${copying}`;
}
