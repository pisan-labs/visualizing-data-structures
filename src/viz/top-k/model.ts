/**
 * Top k: the k largest of n values, three ways, counting comparisons.
 *
 * - The pattern: a min-heap of size k holding the best k seen so far. Its root is the smallest of
 *   them, the one to beat. Each later value costs one comparison with the root, plus a sift-down
 *   (at most 2 log k comparisons) when it wins: O(n log k).
 * - The naive way: sort everything from largest to smallest (merge sort, bottom up) and take the
 *   first k: O(n log n) whatever k is.
 * - Quickselect: partition around the last value (Lomuto, as CLRS's PARTITION) until the pivot
 *   lands where the k-th largest belongs, A[n − k]; everything after it is at least as big. O(n)
 *   on average, O(n²) in the worst case (sorted input, with this pivot).
 *
 * All three leave A as it was: the sort and quickselect work on a copy, drawn in the extra. The
 * goal option asks for the k largest (in any order) or the k-th largest alone.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: one counter, comparisons (two values compared).
 * `naive total`, `pattern total` and `quickselect total` are what each way costs on this input.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { approachOf, Work, workVars, type Totals } from '../_patterns/kit';
import { mark, value } from '../_heaps2/draw';
import { CountingHeap, type HItem } from '../_heaps2/heap';
import { mergeSort, type MergeEvent, type Rows } from '../_heaps2/merge-sort';
import { and, ordinal, plural, readInt, readList, siftSay } from '../_heaps2/say';

export const MAX_N = 12;
export const MAX_K = 7;
export const MAX_VALUE = 99;

export const START = [5, 12, 3, 18, 7, 21, 9, 14, 2];
export const START_K = 3;

export type Method = 'pattern' | 'naive' | 'select';
export type Goal = 'top' | 'kth';

export interface TopSettings {
  [key: string]: Scalar;
  approach: Method;
  goal: Goal;
}

export const defaults: TopSettings = { approach: 'pattern', goal: 'top' };

export const methodOf = (s: { approach?: Scalar }): Method =>
  s.approach === 'select' ? 'select' : approachOf(s as TopSettings);

export interface TopState {
  a: HItem[];
  nextUid: number;
}

export interface TopExtra {
  k: number;
  /** The heap: its values, and the uids of A's values that are out (passed over or pushed out). */
  heap?: HItem[];
  out?: number[];
  /** The heap: the index of the value being read. */
  i?: number;
  /** The sort: the two rows, the pass's width, the merge in progress and the row it reads. */
  rows?: Rows;
  width?: number;
  from?: 0 | 1;
  merge?: { lo: number; mid: number; hi: number };
  /** Quickselect: the working copy and its indices. */
  work?: HItem[];
  p?: number;
  r?: number;
  pi?: number;
  j?: number;
  q?: number;
  t?: number;
  /** The final step: the uids of the answer. */
  answer?: number[];
  /** Frame: the most pointer lanes the operation uses. */
  lanes: number;
}

export type TopStep = Step<TopState, TopExtra>;
type Op = OpSpec<TopState, TopSettings, TopExtra>;
type Gen = Generator<TopStep, TopState, void>;

export function makeState(values: readonly number[], first = 1): TopState {
  return { a: values.map((key, k) => ({ uid: first + k, key })), nextUid: first + values.length };
}

export const init = (): TopState => makeState(START);

export const keys = (xs: readonly (HItem | null)[]) =>
  xs.filter((x): x is HItem => x !== null).map((x) => x.key);

// ----- Input -----

const RULES = { min: 0, max: MAX_VALUE, most: MAX_N };

/** For the input box: a list of values to load ("5 12 3"), or one number, k. */
export function parseInput(token: string): Value | Error {
  const tokens = token.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type k, such as 3, or a list of values to load.');
  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (!/^-?\d+$/.test(t)) return new Error(`"${t}" is not a whole number.`);
    const v = Number(t);
    if (v < 0 || v > MAX_VALUE) return new Error(`${t} is out of range. Use 0 to ${MAX_VALUE}.`);
    return v;
  }
  const vs = readList(tokens.join(' '), RULES);
  return typeof vs === 'string' ? new Error(vs) : vs.join(' ');
}

export const readValues = (arg: Value | undefined): number[] | string =>
  readList(String(arg ?? ''), RULES);

// ----- What each way costs (the same logic as the steps, without them) -----

export function heapCost(a: readonly number[], k: number): number {
  const h = new CountingHeap('min');
  a.forEach((key, uid) => {
    const x = { uid, key };
    if (h.size < k) h.push(x);
    else if (h.compare(h.top()!, x)) h.replaceTop(x);
  });
  return h.comparisons;
}

export const sortCost = (a: readonly number[]): number =>
  mergeSort(
    a.map((key, uid) => ({ uid, key })),
    'desc',
  ).comparisons;

/** Lomuto partition around the last value until the pivot lands on t = n − k. */
export function selectCost(a: readonly number[], k: number): number {
  const w = [...a];
  const t = w.length - k;
  let p = 0;
  let r = w.length - 1;
  let c = 0;
  while (p < r) {
    const x = w[r]!;
    let i = p - 1;
    for (let j = p; j < r; j++) {
      c++;
      if (w[j]! <= x) {
        i++;
        [w[i], w[j]] = [w[j]!, w[i]!];
      }
    }
    const q = i + 1;
    [w[q], w[r]] = [w[r]!, w[q]!];
    if (q === t) break;
    if (t < q) r = q - 1;
    else p = q + 1;
  }
  return c;
}

export interface AllTotals extends Totals {
  select: number;
}

export function totals(a: readonly number[], k: number): AllTotals {
  return { naive: sortCost(a), pattern: heapCost(a, k), select: selectCost(a, k) };
}

/** The k largest, from largest down: what every way must find. */
export const largest = (a: readonly number[], k: number) =>
  [...a].sort((x, y) => y - x).slice(0, k);

// ----- Steps -----

function refuse(s: TopState, why: string): TopStep {
  return {
    state: s,
    marks: [mark('a-name', 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.a.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const vs = readValues(arg);
    if (typeof vs === 'string') {
      yield refuse(s, `${vs} A stays as it was.`);
      return s;
    }
    const next = makeState(vs, s.nextUid);
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(vs.length, 'value')} into A: ${vs.join(', ')}. Type k and press Top k.`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
    };
    return next;
  },
};

/** "the 3 largest" or "the 3rd largest". */
const what = (k: number, goal: Goal) =>
  goal === 'kth' ? `the ${k === 1 ? '' : `${ordinal(k)} `}largest` : k === 1 ? 'the largest value' : `the ${k} largest`;

interface Ctx {
  s: TopState;
  k: number;
  goal: Goal;
  work: Work;
  tot: AllTotals;
  /** Words for the other two ways' costs. */
  others: string;
}

function varsOf(c: Ctx, own: Record<string, Scalar>): Record<string, Scalar> {
  return {
    k: c.k,
    ...own,
    ...workVars(c.work, c.tot),
    'quickselect total': c.tot.select,
  };
}

/** The last sentence: the answer, then the work. */
function done(c: Ctx, sorted: number[], kth: number, how: string): string {
  const answer =
    c.goal === 'kth'
      ? `Done: ${what(c.k, 'kth')} is ${kth}.`
      : c.k === 1
        ? `Done: the largest value is ${kth}.`
        : `Done: the ${c.k} largest are ${and(sorted)}.`;
  return `${answer} ${how} ${c.work.tally()}; ${c.others}.`;
}

/** The pattern: a min-heap of the best k so far. */
function* pattern(c: Ctx): Gen {
  const { s, k } = c;
  const a = s.a;
  const n = a.length;
  const h = new CountingHeap('min');
  const out: number[] = [];
  const extra = (i: number, heap: readonly HItem[], answer?: number[]): TopExtra => ({
    k,
    heap: [...heap],
    out: [...out],
    i,
    lanes: 1,
    ...(answer ? { answer } : {}),
  });
  const vars = (i: number, heap: readonly HItem[]) =>
    varsOf(c, { i, size: heap.length, root: heap[0]?.key ?? null });
  const step = (
    say: string,
    lines: string[],
    marks: Mark[],
    i: number,
    heap: readonly HItem[],
  ): TopStep => ({
    state: s,
    marks,
    say,
    lines,
    level: 2,
    vars: vars(i, heap),
    extra: extra(i, heap),
  });
  // The heap counts every comparison it makes; the work counter follows it.
  const sync = (count: number) => {
    const d = count - c.work.get('comparisons');
    if (d) c.work.add('comparisons', d);
  };

  yield step(
    `Find ${what(k, c.goal)} of ${n} values with a min-heap that holds the best ${k} seen so far. Its root is the smallest of them: the one a new value has to beat.`,
    ['init'],
    [],
    0,
    [],
  );

  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    if (h.size < k) {
      const placed = [...h.items, x];
      const events = h.push(x);
      yield step(
        placed.length === 1
          ? `A[${i}] = ${x.key} goes into the empty heap: it is the root.`
          : `A[${i}] = ${x.key}: the heap has room (${placed.length - 1} of ${k}), so ${x.key} goes in at the end.`,
        ['loop', 'room', 'push'],
        [value(x, 'new')],
        i,
        placed,
      );
      for (const ev of events) {
        sync(ev.comparisons);
        yield step(
          siftSay(ev, 'min'),
          ['push'],
          [value(ev.challenger, 'active'), value(ev.holder, 'compare')],
          i,
          ev.items,
        );
      }
      continue;
    }
    const root = h.top()!;
    const before = [...h.items];
    const wins = h.compare(root, x);
    sync(h.comparisons);
    if (!wins) {
      out.push(x.uid);
      yield step(
        `A[${i}] = ${x.key} against the root ${root.key}: ${x.key} ≤ ${root.key}, so it is not among the ${k} largest so far. Skip it.`,
        ['loop', 'beats'],
        [value(x, 'compare'), value(root, 'compare')],
        i,
        before,
      );
      continue;
    }
    out.push(root.uid);
    yield step(
      `A[${i}] = ${x.key} against the root ${root.key}: ${x.key} > ${root.key}, so ${root.key} drops out of the best ${k} and ${x.key} takes the root.`,
      ['loop', 'beats', 'replace'],
      [value(x, 'active'), value(root, 'remove')],
      i,
      [x, ...before.slice(1)],
    );
    for (const ev of h.replaceTop(x)) {
      sync(ev.comparisons);
      yield step(
        siftSay(ev, 'min'),
        ['replace'],
        [value(ev.moving, 'active'), value(ev.challenger, 'compare')],
        i,
        ev.items,
      );
    }
  }

  const root = h.top()!;
  const sorted = keys(h.items).sort((x, y) => y - x);
  const answer = c.goal === 'kth' ? [root.uid] : h.items.map((x) => x.uid);
  yield {
    state: s,
    marks: answer.map((u) => mark(`key-${u}`, 'found')),
    say: done(
      c,
      sorted,
      root.key,
      c.goal === 'kth'
        ? `It is the root of the heap, the smallest of the ${k} largest.`
        : k === 1
          ? 'It is the only value in the heap.'
          : `The heap holds them, in heap order, with the ${ordinal(k)} largest, ${root.key}, at the root.`,
    ),
    lines: ['ret'],
    level: 1,
    vars: varsOf(c, { i: n - 1, size: h.size, root: root.key, answer: answerVar(c.goal, sorted) }),
    extra: extra(n - 1, h.items, answer),
  };
  return s;
}

/** The answer as a variable: the k-th largest, or the k largest from largest down. */
const answerVar = (goal: Goal, sorted: number[]): Scalar =>
  goal === 'kth' ? sorted[sorted.length - 1]! : sorted.join(' ');

/** The naive way: sort everything from largest to smallest, then take the first k. */
function* naive(c: Ctx): Gen {
  const { s, k } = c;
  const n = s.a.length;
  const run = mergeSort(s.a, 'desc');
  const lanes = 0;
  const extra = (e: MergeEvent | null, rows: Rows, answer?: number[]): TopExtra => ({
    k,
    rows: [[...rows[0]], [...rows[1]]],
    width: e?.width ?? 0,
    from: e?.from ?? 0,
    ...(e && e.kind !== 'pass' && e.kind !== 'alone' ? { merge: { lo: e.lo, mid: e.mid, hi: e.hi } } : {}),
    lanes,
    ...(answer ? { answer } : {}),
  });
  const vars = (w: number) => varsOf(c, { width: w });
  const name = (row: 0 | 1) => (row === 0 ? 'A' : 'B');
  const start: Rows = [[...s.a], Array<HItem | null>(n).fill(null)];

  yield {
    state: s,
    marks: [],
    say: `Find ${what(k, c.goal)} of ${n} values the obvious way: sort all of them from largest to smallest, then read off the first ${k}. Merge sort, bottom up, works on a copy of A.`,
    lines: ['sig'],
    level: 2,
    vars: vars(0),
    extra: extra(null, start),
  };

  for (const e of run.events) {
    const src = name(e.from);
    const dst = name(e.from === 0 ? 1 : 0);
    if (e.kind === 'pass') {
      yield {
        state: s,
        marks: [],
        say:
          e.width === 1
            ? `Pass ${e.pass}: every value on its own is a sorted run of 1. Merge neighboring runs from ${src} into ${dst}, two values at a time.`
            : `Pass ${e.pass}: ${src} now holds sorted runs of ${e.width}. Merge each neighboring pair into one run of ${2 * e.width} in ${dst}.`,
        lines: ['pass'],
        level: 2,
        vars: vars(e.width),
        extra: extra(e, e.rows),
      };
      continue;
    }
    if (e.kind === 'take') {
      c.work.add('comparisons');
      yield {
        state: s,
        marks: [value(e.taken, 'active'), value(e.other, 'compare')],
        say: `Compare the heads of the two runs, ${e.taken.key} and ${e.other.key}: ${
          e.taken.key === e.other.key ? `equal, so the left one, ${e.taken.key}` : `${e.taken.key} is larger, so it`
        } goes to ${dst}[${e.dest}].`,
        lines: ['merge', 'take'],
        level: 2,
        vars: vars(e.width),
        extra: extra(e, e.rows),
      };
      continue;
    }
    const vs = e.moved.map((x) => x.key);
    yield {
      state: s,
      marks: e.moved.map((x) => value(x, 'new')),
      say:
        e.kind === 'alone'
          ? `${and(vs)} ${vs.length === 1 ? 'has' : 'have'} no run to merge with this pass, so ${vs.length === 1 ? 'it moves' : 'they move'} to ${dst} as ${vs.length === 1 ? 'it is' : 'they are'}.`
          : `The ${e.side === 'left' ? 'right' : 'left'} run is used up, so ${and(vs)} ${vs.length === 1 ? 'follows' : 'follow'} with no comparison.`,
      lines: e.kind === 'alone' ? ['merge'] : ['rest'],
      level: 3,
      vars: vars(e.width),
      extra: extra(e, e.rows),
    };
  }

  const last = run.events.at(-1);
  const rows: Rows = last ? last.rows : start;
  const sorted = run.sorted;
  const answer = c.goal === 'kth' ? [sorted[k - 1]!.uid] : sorted.slice(0, k).map((x) => x.uid);
  const final = name(run.result);
  yield {
    state: s,
    marks: answer.map((u) => mark(`key-${u}`, 'found')),
    say: done(
      c,
      sorted.slice(0, k).map((x) => x.key),
      sorted[k - 1]!.key,
      `${final} is sorted from largest down: ${keys(sorted).join(' ')}. ${c.goal === 'kth' ? `The answer is ${final}[${k - 1}].` : `The answer is ${final}[0..${k - 1}].`}`,
    ),
    lines: ['ret'],
    level: 1,
    vars: varsOf(c, {
      width: last?.width ?? 0,
      answer: answerVar(c.goal, keys(sorted.slice(0, k))),
    }),
    extra: extra(last ?? null, rows, answer),
  };
  return s;
}

/** Quickselect: partition around the last value until the pivot lands on t = n − k. */
function* select(c: Ctx): Gen {
  const { s, k } = c;
  const n = s.a.length;
  const w = [...s.a];
  const t = n - k;
  let p = 0;
  let r = n - 1;
  const lanes = 3;
  const extra = (o: Partial<TopExtra> = {}): TopExtra => ({ k, work: [...w], p, r, t, lanes, ...o });
  const vars = (o: Record<string, Scalar> = {}) => varsOf(c, { p, r, t, ...o });
  const at = (i: number) => `A[${i}] = ${w[i]!.key}`;
  const range = (lo: number, hi: number) => (lo === hi ? `A[${lo}]` : `A[${lo}..${hi}]`);

  yield {
    state: s,
    marks: [],
    say: `Find ${what(k, c.goal)} of ${n} values with quickselect, on a copy of A. In sorted order the ${k === 1 ? 'largest value belongs' : `${k} largest belong`} in ${t === n - 1 ? `A[${t}]` : `A[${t}..${n - 1}]`}, so look for the value that belongs in A[${t}]: t = n − k = ${t}.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  for (;;) {
    if (p >= r) {
      yield {
        state: s,
        marks: [value(w[t]!, 'active')],
        say: `The range is down to one value, ${at(t)}: it must be the one that belongs at t.`,
        lines: ['loop'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
      break;
    }
    const x = w[r]!;
    let i = p - 1;
    yield {
      state: s,
      marks: [value(x, 'active')],
      say: `Partition A[${p}..${r}] around its last value, the pivot ${x.key}: values no bigger than ${x.key} go to the left part, the rest stay right.`,
      lines: ['loop', 'pivot'],
      level: 2,
      vars: vars({ pivot: x.key }),
      extra: extra({ pi: i, j: p }),
    };
    for (let j = p; j < r; j++) {
      c.work.add('comparisons');
      const y = w[j]!;
      let say: string;
      if (y.key <= x.key) {
        i++;
        if (i !== j) {
          const z = w[i]!;
          [w[i], w[j]] = [w[j]!, w[i]!];
          say = `${y.key} ≤ ${x.key}, so i moves to ${i} and ${y.key} swaps with ${z.key} into the left part.`;
        } else say = `${y.key} ≤ ${x.key}, so i moves to ${i}; ${y.key} is already in the left part.`;
      } else say = `${y.key} > ${x.key}, so it stays in the right part.`;
      yield {
        state: s,
        marks: [value(y, y.key <= x.key ? 'active' : 'compare'), value(x, 'compare')],
        say: `A[${j}] = ${y.key} against the pivot ${x.key}: ${say}`,
        lines: y.key <= x.key ? ['cmp', 'swap'] : ['cmp'],
        level: 2,
        vars: vars({ pivot: x.key }),
        extra: extra({ pi: i, j }),
      };
    }
    const q = i + 1;
    if (q !== r) [w[q], w[r]] = [w[r]!, w[q]!];
    const left = q > p ? `${range(p, q - 1)} ≤ ${x.key}` : '';
    const right = q < r ? `${range(q + 1, r)} > ${x.key}` : '';
    const parts = [left, right].filter(Boolean).join(' and ');
    const placed = `The pivot ${x.key} goes to A[${q}]${parts ? `: ${parts}` : ''}.`;
    if (q === t) {
      yield {
        state: s,
        marks: [value(x, 'found')],
        say: `${placed} That is t, so ${x.key} is the ${ordinal(k)} largest, and everything after it is at least as big.`,
        lines: ['place', 'found'],
        level: 2,
        vars: vars({ pivot: x.key, q }),
        extra: extra({ q }),
      };
      break;
    }
    const goLeft = t < q;
    const [np, nr] = goLeft ? [p, q - 1] : [q + 1, r];
    yield {
      state: s,
      marks: [value(x, 'active')],
      say: `${placed} t = ${t} is to its ${goLeft ? 'left' : 'right'}, so only ${range(np, nr)} can hold the answer; the rest is out of play.`,
      lines: ['place', 'narrow'],
      level: 2,
      vars: vars({ pivot: x.key, q, p: np, r: nr }),
      extra: extra({ q, p: np, r: nr }),
    };
    p = np;
    r = nr;
  }

  const answer = c.goal === 'kth' ? [w[t]!.uid] : w.slice(t).map((x) => x.uid);
  const sorted = keys(w.slice(t)).sort((x, y) => y - x);
  yield {
    state: s,
    marks: answer.map((u) => mark(`key-${u}`, 'found')),
    say: done(
      c,
      sorted,
      w[t]!.key,
      c.goal === 'kth'
        ? `It is A[${t}] of the copy.`
        : `They are A[${t}..${n - 1}] of the copy, in no particular order.`,
    ),
    lines: ['ret'],
    level: 1,
    vars: varsOf(c, { p, r, t, answer: answerVar(c.goal, sorted) }),
    extra: extra({ answer }),
  };
  return s;
}

const top: Op = {
  label: 'Top k',
  arity: 1,
  *run(s, [arg], { settings }) {
    const n = s.a.length;
    const most = Math.min(n, MAX_K);
    const k = readInt(arg, 1, most, 'k');
    if (typeof k === 'string') {
      const why = !/must be from/.test(k)
        ? ''
        : n < MAX_K
          ? ` A holds only ${plural(n, 'value')}.`
          : ` At most ${MAX_K}, so the heap stays readable.`;
      yield refuse(s, `${k}${why}`);
      return s;
    }
    const a = s.a.map((x) => x.key);
    const tot = totals(a, k);
    const method = methodOf(settings);
    const others =
      method === 'pattern'
        ? `sorting everything takes ${tot.naive}, quickselect ${tot.select}`
        : method === 'naive'
          ? `a min-heap of size ${k} takes ${tot.pattern}, quickselect ${tot.select}`
          : `a min-heap of size ${k} takes ${tot.pattern}, sorting everything ${tot.naive}`;
    const c: Ctx = { s, k, goal: settings.goal === 'kth' ? 'kth' : 'top', work: new Work(['comparisons']), tot, others };
    if (method === 'naive') return yield* naive(c);
    if (method === 'select') return yield* select(c);
    return yield* pattern(c);
  },
};

export const ops: Record<string, Op> = { top, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: TopSettings): PseudoBlock[] {
  const kth = settings.goal === 'kth';
  const method = methodOf(settings);
  if (method === 'naive') {
    return [
      {
        op: 'top',
        lines: [
          L(
            'sig',
            0,
            'topK(A, k)   // sort everything',
            `To find the ${kth ? 'k-th largest value' : 'k largest values'} of A, sort all of A from largest to smallest:`,
          ),
          L('pass', 1, 'for w = 1, 2, 4, … while w < n', 'merge sort, bottom up: runs of length w,'),
          L(
            'merge',
            2,
            'merge each pair of runs of w into a run of 2w',
            'merge each pair of neighboring runs into one run twice as long,',
          ),
          L('take', 3, 'move the larger head; repeat', 'by moving the larger of the two front values, again and again;'),
          L('rest', 3, 'move the rest of the other run', 'when one run is used up, the rest of the other follows.'),
          L(
            'ret',
            1,
            kth ? 'return B[k − 1]' : 'return B[0..k − 1]',
            kth ? 'The k-th value of the sorted copy is the answer.' : 'The first k values of the sorted copy are the answer.',
          ),
        ],
      },
    ];
  }
  if (method === 'select') {
    return [
      {
        op: 'top',
        lines: [
          L(
            'sig',
            0,
            'topK(A, k)   // quickselect',
            `To find the ${kth ? 'k-th largest value' : 'k largest values'} of A, find the place where the k-th largest belongs:`,
          ),
          L(
            'init',
            1,
            'p = 0; r = n − 1; t = n − k',
            'In sorted order the k largest fill A[t..n − 1], t = n − k. Start with all of A.',
          ),
          L('loop', 1, 'while p < r', 'While the range A[p..r] holds more than one value:'),
          L('pivot', 2, 'x = A[r]; i = p − 1', 'take its last value as the pivot x;'),
          L('cmp', 2, 'for j = p to r − 1: if A[j] ≤ x', 'for each other value, if it is no bigger than x,'),
          L('swap', 3, 'i = i + 1; swap A[i], A[j]', 'move it into the left part;'),
          L('place', 2, 'q = i + 1; swap A[q], A[r]', 'then put the pivot between the parts, at q.'),
          L('found', 2, 'if q == t: break', 'If the pivot landed on t, stop.'),
          L('narrow', 2, 'if t < q: r = q − 1 else p = q + 1', 'Otherwise keep only the side that holds t.'),
          L(
            'ret',
            1,
            kth ? 'return A[t]' : 'return A[t..n − 1]',
            kth
              ? 'A[t] is the k-th largest.'
              : 'A[t] is the k-th largest, and everything after it is at least as big: the k largest.',
          ),
        ],
      },
    ];
  }
  return [
    {
      op: 'top',
      lines: [
        L(
          'sig',
          0,
          'topK(A, k)   // a min-heap of size k',
          `To find the ${kth ? 'k-th largest value' : 'k largest values'} of A, keep the best k so far in a min-heap:`,
        ),
        L('init', 1, 'H = empty min-heap', 'Start with an empty min-heap. Its root will be the smallest of the best k.'),
        L('loop', 1, 'for each x in A', 'Go through A once:'),
        L('room', 2, 'if H.size < k', 'while the heap has fewer than k values,'),
        L('push', 3, 'H.push(x)   // sift up', 'put x in at the end and let it rise past any bigger parent;'),
        L('beats', 2, 'else if x > H.min()', 'once it is full, compare x with the root, the smallest of the best k:'),
        L(
          'replace',
          3,
          'H.replaceMin(x)   // sift down',
          'if x is bigger, it takes the root’s place and sinks below any smaller child.',
        ),
        L(
          'ret',
          1,
          kth ? 'return H.min()' : 'return H',
          kth ? 'The root is the k-th largest.' : 'The heap holds the k largest, in heap order.',
        ),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: TopState): string {
  return `A holds ${plural(s.a.length, 'value')}: ${keys(s.a).join(', ')}.`;
}

export function initialSay(s: TopState): string {
  return `A holds ${plural(s.a.length, 'value')}. Type k, such as ${Math.min(START_K, s.a.length)}, and press Top k to find the k largest. Type a list of values and press Load to start over.`;
}

export const initialVars = (s: TopState) => ({ n: s.a.length });
