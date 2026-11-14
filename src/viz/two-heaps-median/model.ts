/**
 * The running median of a stream, two ways, counting comparisons.
 *
 * - The pattern: two heaps. `low`, a max-heap, holds the smaller half of the values so far;
 *   `high`, a min-heap, the larger half. A new value goes into low when it is no bigger than
 *   low's top (or low is empty), otherwise into high. Then, if low has two more than high, low's
 *   top moves to high; if high has more than low, high's top moves to low. So low holds the extra
 *   value when the count is odd, and the median is low's top, or the mean of the two tops. Each
 *   value costs O(log n).
 * - The naive way: keep every value so far in a sorted list, and slide each new value in from the
 *   end past every bigger one (one pass of insertion sort): O(n) per value.
 *
 * The state is the stream so far. Both structures depend only on it, so they are rebuilt from it
 * (`replay`) and each `add` animates the newest value only. The counters run over the whole
 * stream: `comparisons` starts where the values before stopped, and `naive total` and
 * `pattern total` are what each way has cost after this value, so a long stream shows the gap.
 *
 * The median of an even count is the mean of the two middle values by default; the option
 * "lower" gives the lower of the two, as CLRS defines the median.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { approachOf, Work, workVars, type Approach } from '../_patterns/kit';
import { mark, value } from '../_heaps2/draw';
import { CountingHeap, type HItem, type Order, type SiftEvent } from '../_heaps2/heap';
import { plural, siftSay } from '../_heaps2/say';

export const MAX_STREAM = 12;
export const MAX_VALUE = 99;

export type Even = 'mean' | 'lower';

export interface MedianSettings {
  [key: string]: Scalar;
  approach: Approach;
  even: Even;
}

export const defaults: MedianSettings = { approach: 'pattern', even: 'mean' };

export interface MedianState {
  /** The values so far, in the order they came. */
  stream: HItem[];
  nextUid: number;
}

export interface MedianExtra {
  low: HItem[];
  high: HItem[];
  sorted: HItem[];
  /** The stream's index of the value being added. */
  cur: number;
  /** The median after each value, this one's once it is known. */
  medians: (number | null)[];
}

export type MedianStep = Step<MedianState, MedianExtra>;
type Op = OpSpec<MedianState, MedianSettings, MedianExtra>;
type Gen = Generator<MedianStep, MedianState, void>;

export const init = (): MedianState => ({ stream: [], nextUid: 1 });

// ----- Input -----

export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!/^-?\d+$/.test(t)) return new Error('Type a whole number from 0 to 99, such as 7.');
  const v = Number(t);
  if (v < 0 || v > MAX_VALUE) return new Error(`${t} is out of range. Use 0 to ${MAX_VALUE}.`);
  return v;
}

// ----- The two ways, without steps (used to rebuild the state and for the totals) -----

/** The two heaps after a value, and the comparisons it cost. */
function heapsAdd(low: CountingHeap, high: CountingHeap, x: HItem): void {
  if (low.size === 0 || !low.compare(x, low.top()!)) {
    // x ≤ low's top (or low is empty): x does not belong above low's top, so it goes in low.
    low.push(x);
  } else high.push(x);
  if (low.size > high.size + 1) high.push(low.pop().top);
  else if (high.size > low.size) low.push(high.pop().top);
}

/** The sorted list after a value, and the comparisons it cost. */
function sortedAdd(s: HItem[], x: HItem): number {
  let j = s.length;
  let c = 0;
  s.push(x);
  while (j > 0) {
    c++;
    if (s[j - 1]!.key <= x.key) break;
    s[j] = s[j - 1]!;
    j--;
  }
  s[j] = x;
  return c;
}

export interface Rebuilt {
  low: HItem[];
  high: HItem[];
  sorted: HItem[];
  /** Comparisons so far, each way. */
  pattern: number;
  naive: number;
  medians: number[];
}

export function median(sorted: readonly number[], even: Even): number {
  const m = sorted.length;
  if (m % 2) return sorted[(m - 1) / 2]!;
  const a = sorted[m / 2 - 1]!;
  return even === 'lower' ? a : (a + sorted[m / 2]!) / 2;
}

/** Both structures after every value of the stream. */
export function replay(stream: readonly HItem[], even: Even = 'mean'): Rebuilt {
  const low = new CountingHeap('max');
  const high = new CountingHeap('min');
  const sorted: HItem[] = [];
  let naive = 0;
  const medians: number[] = [];
  for (const x of stream) {
    heapsAdd(low, high, x);
    naive += sortedAdd(sorted, x);
    medians.push(median(sorted.map((y) => y.key), even));
  }
  return {
    low: low.items,
    high: high.items,
    sorted,
    pattern: low.comparisons + high.comparisons,
    naive,
    medians,
  };
}

/** Comparisons for a whole stream, each way. */
export function streamCost(keys: readonly number[]): { pattern: number; naive: number } {
  const r = replay(keys.map((key, uid) => ({ uid, key })));
  return { pattern: r.pattern, naive: r.naive };
}

// ----- Words -----

/** "6.5", "6". */
export const fmt = (v: number) => String(v);

const half = (order: Order) => (order === 'max' ? 'low half' : 'high half');

/** A heap comparison, said for the half it happens in. */
function siftIn(ev: SiftEvent, order: Order): string {
  const s = siftSay(ev, order);
  return s.startsWith('Compare') ? `In the ${half(order)}, c${s.slice(1)}` : s;
}

function medianSay(r: { low: HItem[]; high: HItem[] }, even: Even, n: number): string {
  if (r.low.length > r.high.length)
    return `The median of ${plural(n, 'value')} is ${r.low[0]!.key}, the top of the low half, which holds one more.`;
  const a = r.low[0]!.key;
  const b = r.high[0]!.key;
  if (even === 'lower')
    return `${plural(n, 'value')}, an even count: the lower median is ${a}, the top of the low half.`;
  return `${plural(n, 'value')}, an even count: the median is the mean of the two tops, (${a} + ${b}) / 2 = ${fmt((a + b) / 2)}.`;
}

// ----- Steps -----

const add: Op = {
  label: 'Add',
  arity: 1,
  *run(s, [arg], { settings }) {
    const t = String(arg ?? '').trim();
    const v = /^-?\d+$/.test(t) ? Number(t) : NaN;
    if (Number.isNaN(v) || v < 0 || v > MAX_VALUE || s.stream.length >= MAX_STREAM) {
      yield {
        state: s,
        marks: [mark('in-name', 'error')],
        say:
          s.stream.length >= MAX_STREAM
            ? `Nothing added: the stream already holds ${MAX_STREAM} values, as many as fit. Press Clear to start again.`
            : Number.isNaN(v)
              ? 'Nothing added. Type a whole number from 0 to 99, such as 7.'
              : `Nothing added. ${t} is out of range: use 0 to ${MAX_VALUE}.`,
        lines: [],
        level: 1,
        vars: { n: s.stream.length },
      };
      return s;
    }
    const x: HItem = { uid: s.nextUid, key: v };
    const next: MedianState = { stream: [...s.stream, x], nextUid: s.nextUid + 1 };
    const even: Even = settings.even === 'lower' ? 'lower' : 'mean';
    const before = replay(s.stream, even);
    const after = replay(next.stream, even);
    const ctx: Ctx = {
      s: next,
      x,
      even,
      before,
      after,
      work: new Work(['comparisons']),
      n: next.stream.length,
    };
    ctx.work.add('comparisons', approachOf(settings) === 'naive' ? before.naive : before.pattern);
    if (approachOf(settings) === 'naive') return yield* naive(ctx);
    return yield* pattern(ctx);
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run() {
    const s = init();
    yield {
      state: s,
      marks: [],
      say: 'Cleared: no values, so no median yet. Add values one at a time.',
      lines: [],
      level: 1,
      vars: { n: 0 },
    };
    return s;
  },
};

export const ops: Record<string, Op> = { add, clear };

interface Ctx {
  s: MedianState;
  x: HItem;
  even: Even;
  before: Rebuilt;
  after: Rebuilt;
  work: Work;
  n: number;
}

function varsOf(c: Ctx, own: Record<string, Scalar>): Record<string, Scalar> {
  return {
    n: c.n,
    x: c.x.key,
    ...own,
    ...workVars(c.work, { naive: c.after.naive, pattern: c.after.pattern }),
  };
}

function* pattern(c: Ctx): Gen {
  const { s, x, n } = c;
  const low = new CountingHeap('max', c.before.low);
  const high = new CountingHeap('min', c.before.high);
  const cur = n - 1;
  const medians = (done: boolean) => [
    ...c.before.medians,
    ...(done ? [c.after.medians[cur]!] : [null]),
  ];
  // One comparison per heap event, and one for x against the low half's top.
  const tick = () => c.work.add('comparisons');
  const step = (
    say: string,
    lines: string[],
    marks: Mark[],
    l: readonly HItem[],
    h: readonly HItem[],
    done = false,
  ): MedianStep => ({
    state: s,
    marks,
    say,
    lines,
    level: done ? 1 : 2,
    vars: varsOf(c, {
      'low size': l.length,
      'high size': h.length,
      'low top': l[0]?.key ?? null,
      'high top': h[0]?.key ?? null,
      ...(done ? { median: c.after.medians[cur]! } : {}),
    }),
    extra: { low: [...l], high: [...h], sorted: [], cur, medians: medians(done) },
  });
  // Where x goes.
  let goesLow: boolean;
  let say: string;
  const top = low.top();
  if (!top) {
    goesLow = true;
    say = `${x.key} arrives. The low half is empty, so ${x.key} goes into it.`;
  } else {
    goesLow = !low.compare(x, top);
    tick();
    say = goesLow
      ? `${x.key} arrives. Compare it with the top of the low half, ${top.key}: ${x.key} ≤ ${top.key}, so it belongs in the low half.`
      : `${x.key} arrives. Compare it with the top of the low half, ${top.key}: ${x.key} > ${top.key}, so it belongs in the high half.`;
  }
  const into = goesLow ? low : high;
  const order: Order = goesLow ? 'max' : 'min';
  const placed = [...into.items, x];
  const ups = into.push(x);
  yield step(
    `${say} It goes in at the end${placed.length === 1 ? ', as the only value there' : ''}.`,
    goesLow ? ['cmp', 'low'] : ['cmp', 'high'],
    [value(x, 'new'), ...(top ? [value(top, 'compare')] : [])],
    goesLow ? placed : low.items,
    goesLow ? high.items : placed,
  );
  for (const ev of ups) {
    tick();
    yield step(
      siftIn(ev, order),
      [goesLow ? 'low' : 'high'],
      [value(ev.challenger, 'active'), value(ev.holder, 'compare')],
      goesLow ? ev.items : low.items,
      goesLow ? high.items : ev.items,
    );
  }

  // Rebalance.
  const fromLow = low.size > high.size + 1;
  const fromHigh = !fromLow && high.size > low.size;
  if (fromLow || fromHigh) {
    const src = fromLow ? low : high;
    const dst = fromLow ? high : low;
    const top = src.top()!;
    const rest = src.items.slice(1);
    const last = rest.at(-1);
    const srcPlaced = last ? [last, ...rest.slice(0, -1)] : [];
    const dstPlaced = [...dst.items, top];
    const { events: downs } = src.pop();
    const ups2 = dst.push(top);
    const sizes = `${fromLow ? 'low' : 'high'} ${src.size + 1}, ${fromLow ? 'high' : 'low'} ${dst.size - 1}`;
    yield step(
      fromLow
        ? `Now the low half has two more than the high half (${sizes}). Its top, ${top.key}, moves over to the high half${last ? `, and its last value, ${last.key}, takes the empty root` : ''}.`
        : `Now the high half has more than the low half (${sizes}). Its top, ${top.key}, moves over to the low half${last ? `, and its last value, ${last.key}, takes the empty root` : ''}.`,
      fromLow ? ['balance', 'moveUp'] : ['balance', 'balance2', 'moveDown'],
      [value(top, 'active'), ...(last ? [value(last, 'compare')] : [])],
      fromLow ? srcPlaced : dstPlaced,
      fromLow ? dstPlaced : srcPlaced,
    );
    const srcOrder: Order = fromLow ? 'max' : 'min';
    for (const ev of downs) {
      tick();
      yield step(
        siftIn(ev, srcOrder),
        fromLow ? ['moveUp'] : ['moveDown'],
        [value(ev.moving, 'active'), value(ev.challenger, 'compare')],
        fromLow ? ev.items : dstPlaced,
        fromLow ? dstPlaced : ev.items,
      );
    }
    const srcAfter = [...src.items];
    for (const ev of ups2) {
      tick();
      yield step(
        siftIn(ev, fromLow ? 'min' : 'max'),
        fromLow ? ['moveUp'] : ['moveDown'],
        [value(ev.challenger, 'active'), value(ev.holder, 'compare')],
        fromLow ? srcAfter : ev.items,
        fromLow ? ev.items : srcAfter,
      );
    }
  }

  const tops = [low.top(), high.top()].filter((t): t is HItem => t !== undefined);
  const marks =
    low.size > high.size || c.even === 'lower'
      ? [value(low.top()!, 'found')]
      : tops.map((t) => value(t, 'found'));
  yield step(
    `${medianSay({ low: low.items, high: high.items }, c.even, n)} So far the two heaps took ${plural(c.after.pattern, 'comparison')}; a sorted list ${c.after.naive}.`,
    ['median'],
    marks,
    low.items,
    high.items,
    true,
  );
  return s;
}

function* naive(c: Ctx): Gen {
  const { s, x, n } = c;
  const list = [...c.before.sorted];
  const cur = n - 1;
  const medians = (done: boolean) => [
    ...c.before.medians,
    ...(done ? [c.after.medians[cur]!] : [null]),
  ];
  const step = (
    say: string,
    lines: string[],
    marks: Mark[],
    level: 1 | 2 = 2,
    own: Record<string, Scalar> = {},
  ): MedianStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: varsOf(c, { j: list.indexOf(x), ...own }),
    extra: { low: [], high: [], sorted: [...list], cur, medians: medians(level === 1) },
  });

  list.push(x);
  yield step(
    list.length === 1
      ? `${x.key} arrives. The sorted list is empty, so ${x.key} is all of it.`
      : `${x.key} arrives. Put it at the end of the sorted list S, then slide it left past every bigger value.`,
    ['add'],
    [value(x, 'new')],
  );
  let j = list.length - 1;
  while (j > 0) {
    const y = list[j - 1]!;
    c.work.add('comparisons');
    if (y.key <= x.key) {
      yield step(
        `${y.key} ≤ ${x.key}, so ${x.key} stops here, at S[${j}].`,
        ['cmp'],
        [value(x, 'active'), value(y, 'compare')],
      );
      break;
    }
    list[j] = y;
    list[j - 1] = x;
    j--;
    yield step(
      `${y.key} > ${x.key}, so ${y.key} shifts right and ${x.key} moves left to S[${j}].`,
      ['cmp', 'shift'],
      [value(x, 'active'), value(y, 'compare')],
    );
  }
  const keys = list.map((y) => y.key);
  const m = keys.length;
  const mid = m % 2 ? [(m - 1) / 2] : c.even === 'lower' ? [m / 2 - 1] : [m / 2 - 1, m / 2];
  const med = c.after.medians[cur]!;
  const say =
    m % 2
      ? `The median of ${plural(m, 'value')} is the middle one, S[${mid[0]}] = ${med}.`
      : c.even === 'lower'
        ? `${plural(m, 'value')}, an even count: the lower median is S[${mid[0]}] = ${med}.`
        : `${plural(m, 'value')}, an even count: the median is the mean of S[${mid[0]}] and S[${mid[1]}], (${keys[mid[0]!]} + ${keys[mid[1]!]}) / 2 = ${fmt(med)}.`;
  yield step(
    `${say} So far the sorted list took ${plural(c.after.naive, 'comparison')}; two heaps ${c.after.pattern}.`,
    ['median'],
    mid.map((i) => value(list[i]!, 'found')),
    1,
    { median: med },
  );
  return s;
}

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MedianSettings): PseudoBlock[] {
  const lower = settings.even === 'lower';
  if (approachOf(settings) === 'naive')
    return [
      {
        op: 'add',
        lines: [
          L('sig', 0, 'add(x)   // a sorted list S', 'To add x and keep the median, keep every value in a sorted list S:'),
          L('add', 1, 'S.append(x); j = len(S) − 1', 'put x at the end;'),
          L('cmp', 1, 'while j > 0 and S[j − 1] > x', 'while the value to its left is bigger,'),
          L('shift', 2, 'S[j] = S[j − 1]; S[j − 1] = x; j = j − 1', 'that value shifts right and x moves left.'),
          L(
            'median',
            1,
            lower
              ? 'median = S[(len(S) − 1) // 2]'
              : 'median = S[m // 2] if m is odd, else (S[m/2 − 1] + S[m/2]) / 2',
            lower
              ? 'The (lower) median is the middle value, the left one of the two for an even count.'
              : 'The median is the middle value, or the mean of the two middle values for an even count.',
          ),
        ],
      },
    ];
  return [
    {
      op: 'add',
      lines: [
        L('sig', 0, 'add(x)   // low: a max-heap, high: a min-heap', 'To add x and keep the median:'),
        L(
          'cmp',
          1,
          'if low is empty or x ≤ low.max()',
          'if x is no bigger than the top of the low half (or the low half is empty),',
        ),
        L('low', 2, 'low.push(x)', 'it goes into the low half, a max-heap;'),
        L('high', 1, 'else: high.push(x)', 'otherwise into the high half, a min-heap.'),
        L('balance', 1, 'if low.size > high.size + 1', 'If the low half has two more values than the high half,'),
        L('moveUp', 2, 'high.push(low.popMax())', 'its top moves to the high half.'),
        L('balance2', 1, 'else if high.size > low.size', 'If the high half has more than the low half,'),
        L('moveDown', 2, 'low.push(high.popMin())', 'its top moves to the low half.'),
        L(
          'median',
          1,
          lower
            ? 'median = low.max()'
            : 'median = low.max() if low.size > high.size, else (low.max() + high.min()) / 2',
          lower
            ? 'The (lower) median is the top of the low half.'
            : 'The median is the top of the low half when it has one more, or else the mean of the two tops.',
        ),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: MedianState): string {
  return s.stream.length
    ? `${plural(s.stream.length, 'value')} so far, in the order they came: ${s.stream.map((x) => x.key).join(', ')}.`
    : 'No values yet.';
}

export function initialSay(s: MedianState): string {
  return s.stream.length
    ? `${plural(s.stream.length, 'value')} so far. Type the next value and press Add to see the median move.`
    : 'No values yet. Type a value, such as 7, and press Add; or type several, such as 5 15 1 3, to add them one at a time.';
}

export const initialVars = (s: MedianState) => ({ n: s.stream.length });
