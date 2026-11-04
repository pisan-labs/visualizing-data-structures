import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** Each value written into the array gets a uid, so the view can animate that value. */
export interface Slot {
  uid: number;
  value: number;
}

export interface SortedState {
  capacity: number;
  /** Physical array contents. Slots at or above `size` may hold leftover (stale) values. */
  slots: (Slot | null)[];
  size: number;
  nextUid: number;
}

export interface SortedSettings {
  [key: string]: Scalar;
  mode: 'sorted' | 'unsorted';
  capacity: number;
}

export interface SortedExtra {
  /** The value being inserted (with its uid) or searched for, waiting above the array. */
  key?: { value: Value; uid?: number; error?: boolean };
  /** What the operation returns. */
  result?: { text: string; error?: boolean };
  /** Draw A[0..live-1] as part of the array, overriding size for this step. */
  live?: number;
  /** Pointers to draw: lo, hi and mid for binary search and bounds, i for a scan. */
  ptr?: { lo?: number; hi?: number; mid?: number; i?: number; j?: number };
  /** The cells still in play during a binary search, inclusive. Others are greyed out. */
  range?: [number, number];
}

type S = SortedState;
type X = SortedExtra;
type Op = OpSpec<S, SortedSettings, X>;
type SortedStep = Step<S, X>;

export const defaults: SortedSettings = { mode: 'sorted', capacity: 10 };

export function init(settings: SortedSettings): S {
  return {
    capacity: settings.capacity,
    slots: Array(settings.capacity).fill(null),
    size: 0,
    nextUid: 1,
  };
}

const sorted = (settings: SortedSettings) => settings.mode === 'sorted';
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const val = (s: S, i: number) => s.slots[i]!.value;
const fmt = (v: Value) => (typeof v === 'string' ? `"${v}"` : String(v));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Counters for the current operation, plus whatever the step adds. */
function vars(
  s: S,
  count: { comparisons: number; moves: number },
  more: Record<string, Scalar> = {},
) {
  return { ...more, size: s.size, capacity: s.capacity, ...count };
}

/** A step that refuses a value that is not a whole number. */
function* numberCheck(
  s: S,
  op: string,
  x: Value,
  lines: string[],
): Generator<SortedStep, boolean, void> {
  if (typeof x === 'number' && Number.isInteger(x)) return false;
  yield {
    state: s,
    marks: [mark('key', 'error')],
    say: `${op}(${fmt(x)}): this array holds whole numbers, so ${fmt(x)} cannot be compared with its items. Nothing changes.`,
    lines,
    vars: vars(s, { comparisons: 0, moves: 0 }, { x }),
    level: 1,
    extra: { key: { value: x, error: true } },
  };
  return true;
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [x], { settings }) {
    if (yield* numberCheck(s, 'insert', x as Value, ['insert.check'])) return s;
    const value = x as number;
    const uid = s.nextUid;
    const count = { comparisons: 0, moves: 0 };
    const key = { value, uid };
    yield {
      state: s,
      marks: [mark('size', 'active')],
      say: `insert(${value}): is there room? size = ${s.size} and capacity = ${s.capacity}.`,
      lines: ['insert.check'],
      vars: vars(s, count, { x: value }),
      level: 2,
      extra: { key },
    } satisfies SortedStep;
    if (s.size === s.capacity) {
      yield {
        state: s,
        marks: [mark('size', 'error'), mark(`v${uid}`, 'error')],
        say: `size equals capacity, so the array is full. ${value} is not inserted.`,
        lines: ['insert.full'],
        vars: vars(s, count, { x: value }),
        level: 1,
        extra: { key: { ...key, error: true } },
      } satisfies SortedStep;
      return s;
    }

    let cur: S = { ...s, nextUid: uid + 1 };
    let at = s.size;
    if (sorted(settings)) {
      let j = s.size - 1;
      // Shift the bigger items right, from the end, until one is not bigger than x.
      while (j >= 0 && val(cur, j) > value) {
        count.comparisons++;
        const slots = [...cur.slots];
        const slot = slots[j]!;
        slots[j + 1] = slot;
        slots[j] = { uid: cur.nextUid, value: slot.value };
        cur = { ...cur, slots, nextUid: cur.nextUid + 1 };
        count.moves++;
        const last = j === 0 || val(cur, j - 1) <= value;
        yield {
          state: cur,
          marks: [mark(`cell-${j + 1}`, 'active'), mark(`v${slot.uid}`, 'active')],
          say: `A[${j}] = ${slot.value} > ${value}, so shift ${slot.value} right into A[${j + 1}].`,
          lines: ['insert.loop', 'insert.shift', 'insert.dec'],
          vars: vars(cur, count, { x: value, j: j - 1 }),
          level: last ? 2 : 3,
          extra: { key, live: s.size + 1, ptr: { j: j - 1 } },
        } satisfies SortedStep;
        j--;
      }
      at = j + 1;
      if (j >= 0) count.comparisons++;
      yield {
        state: cur,
        marks: j >= 0 ? [mark(`cell-${j}`, 'compare')] : [mark('j', 'active')],
        say:
          j >= 0
            ? `A[${j}] = ${val(cur, j)} > ${value}? No, so ${value} belongs right after it, in A[${at}].`
            : `j = -1: every item was bigger, so ${value} goes in A[0].`,
        lines: ['insert.loop'],
        vars: vars(cur, count, { x: value, j }),
        level: 2,
        // The slot past the end joins the array once an item has shifted into it.
        extra: { key, live: count.moves > 0 ? s.size + 1 : s.size, ptr: { j } },
      } satisfies SortedStep;
    }

    const slots = [...cur.slots];
    slots[at] = { uid, value };
    const stored: S = { ...cur, slots };
    yield {
      state: stored,
      marks: [mark(`cell-${at}`, 'new'), mark(`v${uid}`, 'new')],
      say: sorted(settings)
        ? `Store ${value} in A[${at}].`
        : `The array is unsorted, so there is no place to find: store ${value} at the end, in A[size] = A[${at}].`,
      lines: ['insert.store'],
      vars: vars(cur, count, { x: value }),
      level: 2,
      extra: { live: s.size + 1 },
    } satisfies SortedStep;

    const done: S = { ...stored, size: s.size + 1 };
    yield {
      state: done,
      marks: [mark('size', 'active'), mark(`v${uid}`, 'done')],
      say: `Increment size to ${done.size}. That took ${plural(count.comparisons, 'comparison')} and ${plural(count.moves, 'move')}.`,
      lines: ['insert.inc'],
      vars: vars(done, count, { x: value }),
      level: 1,
    } satisfies SortedStep;
    return done;
  },
};

/**
 * Find x: binary search when sorted, a linear scan when not. Returns the index or -1. When
 * `final` is set, the found or not-found step ends the operation (level 1).
 */
function* find(
  s: S,
  settings: SortedSettings,
  x: number,
  count: { comparisons: number; moves: number },
  call: string,
  final: boolean,
): Generator<SortedStep, number, void> {
  const key = { value: x };
  if (!sorted(settings)) {
    if (s.size === 0) {
      yield {
        state: s,
        marks: [mark('size', 'compare')],
        say: `${call}: the array is empty, so ${x} is not here. Return -1.`,
        lines: ['search.loop', 'search.none'],
        vars: vars(s, count, { x, returned: -1 }),
        level: final ? 1 : 2,
        extra: { key, result: { text: '-1' } },
      };
      return -1;
    }
    for (let i = 0; i < s.size; i++) {
      count.comparisons++;
      const hit = val(s, i) === x;
      const step = {
        state: s,
        marks: [mark(`cell-${i}`, hit ? 'found' : 'compare'), mark('i', 'active')],
        lines: ['search.loop', 'search.eq'],
        vars: vars(s, count, { x, i }),
        extra: { key, ptr: { i } },
      };
      if (hit) {
        yield {
          ...step,
          say: `${call}: A[${i}] = ${x}. Found it at index ${i} after ${plural(count.comparisons, 'comparison')}.`,
          lines: ['search.eq', 'search.found'],
          vars: vars(s, count, { x, i, returned: i }),
          level: final ? 1 : 2,
          extra: { ...step.extra, result: { text: String(i) } },
        };
        return i;
      }
      yield {
        ...step,
        say: `${i === 0 ? `${call}: no order to use, so check every item. ` : ''}Is A[${i}] = ${val(s, i)} equal to ${x}? No.`,
        level: 2,
      };
    }
    yield {
      state: s,
      marks: [mark('size', 'compare')],
      say: `Checked all ${s.size} items: ${x} is not here. Return -1 after ${plural(count.comparisons, 'comparison')}.`,
      lines: ['search.none'],
      vars: vars(s, count, { x, returned: -1 }),
      level: final ? 1 : 2,
      extra: { key, result: { text: '-1' } },
    };
    return -1;
  }

  let lo = 0;
  let hi = s.size - 1;
  yield {
    state: s,
    marks: [mark('lo', 'active'), mark('hi', 'active')],
    say: `${call}: binary search. Start with the whole array: lo = 0 and hi = size - 1 = ${hi}.`,
    lines: ['search.init'],
    vars: vars(s, count, { x, lo, hi }),
    level: 2,
    extra: { key, ptr: { lo, hi }, range: [lo, hi] },
  };
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const m = val(s, mid);
    count.comparisons++;
    const base = { key, ptr: { lo, hi, mid }, range: [lo, hi] as [number, number] };
    if (m === x) {
      yield {
        state: s,
        marks: [mark(`cell-${mid}`, 'found'), mark('mid', 'active')],
        say: `mid = ⌊(${lo} + ${hi}) / 2⌋ = ${mid}. A[${mid}] = ${x}: found it after ${plural(count.comparisons, 'comparison')}.`,
        lines: ['search.mid', 'search.eq', 'search.found'],
        vars: vars(s, count, { x, lo, hi, mid, returned: mid }),
        level: final ? 1 : 2,
        extra: { ...base, result: { text: String(mid) } },
      };
      return mid;
    }
    yield {
      state: s,
      marks: [mark(`cell-${mid}`, 'compare'), mark('mid', 'active')],
      say: `mid = ⌊(${lo} + ${hi}) / 2⌋ = ${mid}. Is A[${mid}] = ${m} equal to ${x}? No.`,
      lines: ['search.loop', 'search.mid', 'search.eq'],
      vars: vars(s, count, { x, lo, hi, mid }),
      level: 2,
      extra: base,
    };
    count.comparisons++;
    if (m < x) {
      lo = mid + 1;
      yield {
        state: s,
        marks: [mark(`cell-${mid}`, 'compare'), mark('lo', 'active')],
        say: `${m} < ${x}, so ${x} can only be to the right of mid: lo = mid + 1 = ${lo}.`,
        lines: ['search.lt', 'search.right'],
        vars: vars(s, count, { x, lo, hi, mid }),
        level: 2,
        extra: { key, ptr: { lo, hi, mid }, range: [lo, hi] },
      };
    } else {
      hi = mid - 1;
      yield {
        state: s,
        marks: [mark(`cell-${mid}`, 'compare'), mark('hi', 'active')],
        say: `${m} > ${x}, so ${x} can only be to the left of mid: hi = mid - 1 = ${hi}.`,
        lines: ['search.lt', 'search.left'],
        vars: vars(s, count, { x, lo, hi, mid }),
        level: 2,
        extra: { key, ptr: { lo, hi, mid }, range: [lo, hi] },
      };
    }
  }
  yield {
    state: s,
    marks: [mark('lo', 'compare'), mark('hi', 'compare')],
    say:
      s.size === 0
        ? `The array is empty (hi = -1 < lo = 0), so ${x} is not here. Return -1.`
        : `lo = ${lo} > hi = ${hi}: nothing is left to check, so ${x} is not here. Return -1 after ${plural(count.comparisons, 'comparison')}.`,
    lines: ['search.loop', 'search.none'],
    vars: vars(s, count, { x, lo, hi, returned: -1 }),
    level: final ? 1 : 2,
    extra: { key, ptr: { lo, hi }, result: { text: '-1' } },
  };
  return -1;
}

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [x], { settings }) {
    if (yield* numberCheck(s, 'search', x as Value, ['search.sig'])) return s;
    const value = x as number;
    yield* find(s, settings, value, { comparisons: 0, moves: 0 }, `search(${value})`, true);
    return s;
  },
};

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [x], { settings }) {
    if (yield* numberCheck(s, 'delete', x as Value, ['delete.find'])) return s;
    const value = x as number;
    const count = { comparisons: 0, moves: 0 };
    const at = yield* find(s, settings, value, count, `delete(${value})`, false);
    if (at < 0) {
      yield {
        state: s,
        marks: [mark('key', 'error')],
        say: `${value} is not in the array, so there is nothing to delete.`,
        lines: ['delete.missing'],
        vars: vars(s, count, { x: value }),
        level: 1,
        extra: { key: { value, error: true } },
      } satisfies SortedStep;
      return s;
    }
    let cur = s;
    const moving = s.size - 1 - at;
    for (let j = at; j < s.size - 1; j++) {
      const slots = [...cur.slots];
      const slot = slots[j + 1]!;
      slots[j] = slot;
      slots[j + 1] = { uid: cur.nextUid, value: slot.value };
      cur = { ...cur, slots, nextUid: cur.nextUid + 1 };
      count.moves++;
      const last = j === s.size - 2;
      yield {
        state: cur,
        marks: [mark(`cell-${j}`, 'active'), mark(`v${slot.uid}`, 'active')],
        say: `Shift A[${j + 1}] = ${slot.value} left into A[${j}].${last ? ` ${plural(moving, 'item')} moved to close the gap.` : ''}`,
        lines: ['delete.loop', 'delete.shift'],
        vars: vars(cur, count, { x: value, j }),
        level: last ? 2 : 3,
      } satisfies SortedStep;
    }
    const done: S = { ...cur, size: s.size - 1 };
    yield {
      state: done,
      marks: [mark('size', 'active')],
      say: `${moving === 0 ? `${value} was the last item, so nothing shifts. ` : ''}Decrement size to ${done.size}. Deleting ${value} took ${plural(count.comparisons, 'comparison')} and ${plural(count.moves, 'move')}.`,
      lines: ['delete.dec'],
      vars: vars(done, count, { x: value }),
      level: 1,
    } satisfies SortedStep;
    return done;
  },
};

function extreme(which: 'min' | 'max'): Op {
  const smallest = which === 'min';
  const word = smallest ? 'smallest' : 'largest';
  return {
    label: smallest ? 'Min' : 'Max',
    arity: 0,
    *run(s, _args, { settings }) {
      const count = { comparisons: 0, moves: 0 };
      yield {
        state: s,
        marks: [mark('size', 'active')],
        say: `${which}(): is the array empty? size = ${s.size}.`,
        lines: [`${which}.check`],
        vars: vars(s, count),
        level: 2,
      } satisfies SortedStep;
      if (s.size === 0) {
        yield {
          state: s,
          marks: [mark('size', 'error')],
          say: `size is 0, so there is no ${word} item.`,
          lines: [`${which}.empty`],
          vars: vars(s, count),
          level: 1,
        } satisfies SortedStep;
        return s;
      }
      if (sorted(settings)) {
        const at = smallest ? 0 : s.size - 1;
        yield {
          state: s,
          marks: [mark(`cell-${at}`, 'found')],
          say: `The array is sorted, so the ${word} item is at the ${smallest ? 'start' : 'end'}: return A[${at}] = ${val(s, at)}. No comparisons needed.`,
          lines: [`${which}.return`],
          vars: vars(s, count, { returned: val(s, at) }),
          level: 1,
          extra: { result: { text: String(val(s, at)) } },
        } satisfies SortedStep;
        return s;
      }
      let best = 0;
      yield {
        state: s,
        marks: [mark('cell-0', 'active')],
        say: `Unsorted, so look at every item. Start with m = A[0] = ${val(s, 0)}.`,
        lines: [`${which}.first`],
        vars: vars(s, count, { m: val(s, 0) }),
        level: 2,
        extra: { ptr: { i: 0 } },
      } satisfies SortedStep;
      for (let i = 1; i < s.size; i++) {
        count.comparisons++;
        const v = val(s, i);
        const better = smallest ? v < val(s, best) : v > val(s, best);
        const old = val(s, best);
        if (better) best = i;
        yield {
          state: s,
          marks: [mark(`cell-${i}`, better ? 'active' : 'compare')],
          say: `Is A[${i}] = ${v} ${smallest ? '<' : '>'} m = ${old}? ${better ? `Yes, so m = ${v}.` : 'No.'}`,
          lines: better
            ? [`${which}.loop`, `${which}.test`, `${which}.take`]
            : [`${which}.loop`, `${which}.test`],
          vars: vars(s, count, { m: val(s, best), i }),
          level: 2,
          extra: { ptr: { i } },
        } satisfies SortedStep;
      }
      yield {
        state: s,
        marks: [mark(`cell-${best}`, 'found')],
        say: `Return m = ${val(s, best)}, after ${plural(count.comparisons, 'comparison')}.`,
        lines: [`${which}.result`],
        vars: vars(s, count, { m: val(s, best), returned: val(s, best) }),
        level: 1,
        extra: { result: { text: String(val(s, best)) } },
      } satisfies SortedStep;
      return s;
    },
  };
}

function bound(which: 'lower' | 'upper'): Op {
  const lower = which === 'lower';
  const op = lower ? 'lowerBound' : 'upperBound';
  const rel = lower ? '≥' : '>';
  return {
    label: lower ? 'Lower bound' : 'Upper bound',
    arity: 1,
    *run(s, [x], { settings }) {
      if (yield* numberCheck(s, op, x as Value, [`${op}.sorted`])) return s;
      const value = x as number;
      const count = { comparisons: 0, moves: 0 };
      const key = { value };
      if (!sorted(settings)) {
        yield {
          state: s,
          marks: [mark('key', 'error')],
          say: `${op}(${value}) answers "where would ${value} go in sorted order?", so it needs a sorted array. This one is unsorted. Switch the mode to sorted and try again.`,
          lines: [`${op}.sorted`],
          vars: vars(s, count, { x: value }),
          level: 1,
          extra: { key: { value, error: true } },
        } satisfies SortedStep;
        return s;
      }
      let lo = 0;
      let hi = s.size;
      yield {
        state: s,
        marks: [mark('lo', 'active'), mark('hi', 'active')],
        say: `${op}(${value}): find the first index whose item is ${rel} ${value}. The answer is somewhere from lo = 0 to hi = size = ${hi}.`,
        lines: [`${op}.init`],
        vars: vars(s, count, { x: value, lo, hi }),
        level: 2,
        extra: { key, ptr: { lo, hi }, range: [lo, hi - 1] },
      } satisfies SortedStep;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const m = val(s, mid);
        count.comparisons++;
        const right = lower ? m < value : m <= value;
        const test = `A[${mid}] = ${m} ${lower ? '<' : '≤'} ${value}?`;
        const before = { lo, hi };
        if (right) lo = mid + 1;
        else hi = mid;
        yield {
          state: s,
          marks: [mark(`cell-${mid}`, 'compare'), mark(right ? 'lo' : 'hi', 'active')],
          say: right
            ? `mid = ⌊(${before.lo} + ${before.hi}) / 2⌋ = ${mid}. ${test} Yes, so the answer is to the right: lo = mid + 1 = ${lo}.`
            : `mid = ⌊(${before.lo} + ${before.hi}) / 2⌋ = ${mid}. ${test} No, so the answer is mid or to its left: hi = mid = ${hi}.`,
          lines: [`${op}.loop`, `${op}.mid`, `${op}.test`, right ? `${op}.right` : `${op}.left`],
          vars: vars(s, count, { x: value, lo, hi, mid }),
          level: 2,
          extra: { key, ptr: { lo, hi, mid }, range: [lo, hi - 1] },
        } satisfies SortedStep;
      }
      const where =
        s.size === 0
          ? 'The array is empty, so the answer is 0.'
          : lo === s.size
            ? `Every item is ${lower ? 'smaller than' : 'at most'} ${value}, so the answer is size = ${lo}, just past the end.`
            : `A[${lo}] = ${val(s, lo)} is the first item ${rel} ${value}.`;
      yield {
        state: s,
        marks:
          lo < s.size ? [mark(`cell-${lo}`, 'found'), mark('lo', 'found')] : [mark('lo', 'found')],
        say: `lo = hi = ${lo}. Return ${lo}. ${where} That took ${plural(count.comparisons, 'comparison')}.`,
        lines: [`${op}.return`],
        vars: vars(s, count, { x: value, lo, hi, returned: lo }),
        level: 1,
        extra: { key, ptr: { lo, hi }, result: { text: String(lo) } },
      } satisfies SortedStep;
      return s;
    },
  };
}

export const ops = {
  insert,
  delete: del,
  search,
  min: extreme('min'),
  max: extreme('max'),
  lowerBound: bound('lower'),
  upperBound: bound('upper'),
};

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function searchLines(isSorted: boolean, indent: number) {
  const n = indent;
  if (!isSorted) {
    return [
      L('search.sig', n, 'search(x)', 'To find x:'),
      L('search.loop', n + 1, 'for i = 0 to size - 1', 'Look at each item in turn.'),
      L('search.eq', n + 2, 'if A[i] == x', 'If it is x,'),
      L('search.found', n + 3, 'return i', 'report where it is.'),
      L('search.none', n + 1, 'return -1', 'If none matched, report that x is missing.'),
    ];
  }
  return [
    L('search.sig', n, 'search(x)', 'To find x by halving:'),
    L('search.init', n + 1, 'lo = 0; hi = size - 1', 'x can be anywhere in the array.'),
    L('search.loop', n + 1, 'while lo ≤ hi', 'While some items are left to check,'),
    L('search.mid', n + 2, 'mid = ⌊(lo + hi) / 2⌋', 'look at the middle one.'),
    L('search.eq', n + 2, 'if A[mid] == x', 'If it is x,'),
    L('search.found', n + 3, 'return mid', 'report where it is.'),
    L('search.lt', n + 2, 'if A[mid] < x', 'If it is smaller than x,'),
    L('search.right', n + 3, 'lo = mid + 1', 'x can only be to its right.'),
    L('search.left', n + 2, 'else hi = mid - 1', 'Otherwise x can only be to its left.'),
    L('search.none', n + 1, 'return -1', 'Nothing left: x is missing.'),
  ];
}

function boundLines(op: 'lowerBound' | 'upperBound') {
  const lower = op === 'lowerBound';
  return [
    L(
      `${op}.sig`,
      0,
      `${op}(x)`,
      `To find the first index whose item is ${lower ? 'at least' : 'more than'} x:`,
    ),
    L(`${op}.sorted`, 1, 'require A sorted', 'This only works on a sorted array.'),
    L(`${op}.init`, 1, 'lo = 0; hi = size', 'The answer is somewhere from 0 to size.'),
    L(`${op}.loop`, 1, 'while lo < hi', 'While that range has more than one choice,'),
    L(`${op}.mid`, 2, 'mid = ⌊(lo + hi) / 2⌋', 'look at the middle item.'),
    L(
      `${op}.test`,
      2,
      lower ? 'if A[mid] < x' : 'if A[mid] ≤ x',
      lower ? 'If it is smaller than x,' : 'If it is at most x,',
    ),
    L(`${op}.right`, 3, 'lo = mid + 1', 'the answer is to its right.'),
    L(`${op}.left`, 2, 'else hi = mid', 'Otherwise the answer is mid or to its left.'),
    L(`${op}.return`, 1, 'return lo', 'lo is the answer.'),
  ];
}

function extremeLines(which: 'min' | 'max', isSorted: boolean) {
  const smallest = which === 'min';
  const head = [
    L(`${which}.sig`, 0, `${which}()`, `To find the ${smallest ? 'smallest' : 'largest'} item:`),
    L(`${which}.check`, 1, 'if size == 0', 'If there are no items,'),
    L(`${which}.empty`, 2, 'error "array is empty"', 'stop: there is nothing to return.'),
  ];
  if (isSorted) {
    return [
      ...head,
      L(
        `${which}.return`,
        1,
        smallest ? 'return A[0]' : 'return A[size - 1]',
        smallest ? 'The first item is the smallest.' : 'The last item is the largest.',
      ),
    ];
  }
  return [
    ...head,
    L(`${which}.first`, 1, 'm = A[0]', 'Start with the first item.'),
    L(`${which}.loop`, 1, 'for i = 1 to size - 1', 'Look at every other item.'),
    L(
      `${which}.test`,
      2,
      smallest ? 'if A[i] < m' : 'if A[i] > m',
      smallest ? 'If it is smaller,' : 'If it is larger,',
    ),
    L(`${which}.take`, 3, 'm = A[i]', 'remember it instead.'),
    L(`${which}.result`, 1, 'return m', 'Hand back the one you remembered.'),
  ];
}

export function pseudocode(settings: SortedSettings): PseudoBlock[] {
  const isSorted = sorted(settings);
  const check = [
    L('insert.check', 1, 'if size == capacity', 'If every slot is in use,'),
    L('insert.full', 2, 'error "array is full"', 'stop: there is no room.'),
  ];
  return [
    {
      op: 'insert',
      lines: isSorted
        ? [
            L('insert.sig', 0, 'insert(x)', 'To insert x in order:'),
            ...check,
            L('insert.start', 1, 'j = size - 1', 'Start at the last item.'),
            L(
              'insert.loop',
              1,
              'while j ≥ 0 and A[j] > x',
              'While the item there is bigger than x,',
            ),
            L('insert.shift', 2, 'A[j + 1] = A[j]', 'move it one slot right'),
            L('insert.dec', 2, 'j = j - 1', 'and step left.'),
            L('insert.store', 1, 'A[j + 1] = x', 'Put x in the gap.'),
            L('insert.inc', 1, 'size = size + 1', 'Count one more item.'),
          ]
        : [
            L('insert.sig', 0, 'insert(x)', 'To insert x:'),
            ...check,
            L('insert.store', 1, 'A[size] = x', 'Put x at the end. Order does not matter.'),
            L('insert.inc', 1, 'size = size + 1', 'Count one more item.'),
          ],
    },
    {
      op: 'delete',
      lines: [
        L('delete.sig', 0, 'delete(x)', 'To delete x:'),
        L('delete.find', 1, 'i = search(x)', 'Find it first.'),
        L('delete.none', 1, 'if i == -1', 'If it is not there,'),
        L('delete.missing', 2, 'return', 'there is nothing to do.'),
        L('delete.loop', 1, 'for j = i to size - 2', 'From the gap to the end,'),
        L('delete.shift', 2, 'A[j] = A[j + 1]', 'move each later item one slot left.'),
        L('delete.dec', 1, 'size = size - 1', 'Count one fewer item.'),
        ...searchLines(isSorted, 0),
      ],
    },
    { op: 'search', lines: searchLines(isSorted, 0) },
    { op: 'min', lines: extremeLines('min', isSorted) },
    { op: 'max', lines: extremeLines('max', isSorted) },
    { op: 'lowerBound', lines: boundLines('lowerBound') },
    { op: 'upperBound', lines: boundLines('upperBound') },
  ];
}

export function initialSay(state: S, settings: SortedSettings): string {
  return sorted(settings)
    ? `An empty array A with capacity ${state.capacity}, kept in sorted order. Insert has to make room in the right place; search can use binary search.`
    : `An empty array A with capacity ${state.capacity}, in no particular order. Insert just appends; search has to look at items one by one.`;
}

export function initialVars(state: S) {
  return vars(state, { comparisons: 0, moves: 0 });
}

/** The items, in array order. */
export function items(state: S): number[] {
  return state.slots.slice(0, state.size).map((s) => s!.value);
}

/** Screen-reader summary. */
export function describe(state: S, settings?: SortedSettings): string {
  const kind = settings && !sorted(settings) ? 'Unsorted' : 'Sorted';
  if (state.size === 0) return `${kind} array, empty, capacity ${state.capacity}.`;
  return `${kind} array with ${state.size} of ${state.capacity} slots used: ${items(state).join(', ')}.`;
}
