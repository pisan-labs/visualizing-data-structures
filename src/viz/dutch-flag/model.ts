/**
 * The Dutch national flag: put the values of A in three groups around a pivot p, those below
 * p, then those equal to p, then those above, as in a three-way partition.
 *
 * - The pattern: three indices, low, mid and high, in one pass (Dijkstra's method). They split A
 *   into four regions that hold at every step:
 *     A[0..low − 1]      below p
 *     A[low..mid − 1]    equal to p
 *     A[mid..high]       not looked at yet
 *     A[high + 1..n − 1] above p
 *   Each step looks at A[mid] and shrinks the unknown region by one: below p, swap it with
 *   A[low] (an equal value, or itself) and move low and mid on; equal, move mid on; above, swap
 *   it with A[high] and move high back, leaving mid where it is, since the value that came from
 *   high is still unknown. n comparisons, at most n − 1 swaps, O(1) extra space.
 * - The naive approach counts, then rewrites: one pass counts each kind, which tells where each
 *   kind starts in an output array B; a second pass copies each value to the next free slot of
 *   its kind in B; then B is copied back into A. That is counting sort with three keys: 2n
 *   comparisons, 2n writes and n extra slots. (Counting alone and writing the counts back is
 *   enough only when equal kinds are equal values, as with the colors 0, 1 and 2.)
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a comparison asks whether one value is below,
 * equal to or above p (one three-way comparison); a swap exchanges two different slots of A (the
 * code also "swaps" a slot with itself, which moves nothing, so the counter skips it, as on
 * /quick-sort/); a write puts one value in a slot. Both return the same bounds: the values equal
 * to p end in A[low..high].
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
} from '../../engine/types';
import type { BarsPointer, BarsRegion } from '../../layouts/bars';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import {
  loadOp,
  makeState,
  mark,
  plural,
  span,
  vid,
  type ArrayState,
  type Draw,
  type Item,
} from '../_sorting/kit';
import { intArg } from '../_techniques/kit';

/** The array the page starts with, and a pivot with three of each kind. */
export const START = [7, 2, 5, 9, 5, 1, 8, 5, 3];
export const START_P = 5;
export const MAX_PIVOT = 99;

export interface FlagSettings {
  [key: string]: Scalar;
  approach: Approach;
  draw: Draw;
}

export const defaults: FlagSettings = { approach: 'pattern', draw: 'bars' };

export type Kind = 'below' | 'equal' | 'above';

export const kindOf = (v: number, p: number): Kind => (v < p ? 'below' : v > p ? 'above' : 'equal');

/** View-only data for a step of partition. */
export interface FlagExtra {
  p: number;
  pointers: BarsPointer[];
  regions: BarsRegion[];
  /** Count then rewrite: the output array B, aligned with A (stale items are old copies). */
  b?: (Item | null)[];
  /** Regions of B, once the counts say where each kind starts. */
  bRegions?: BarsRegion[];
}

export type FlagStep = Step<ArrayState, FlagExtra>;
type Op = OpSpec<ArrayState, FlagSettings, FlagExtra>;
type Gen = Generator<FlagStep, ArrayState, void>;

export const UNITS = ['comparisons', 'swaps', 'writes'] as const;

export const init = (): ArrayState => makeState(START);

/** "A[2] = 5". */
const at = (i: number, v: number) => `A[${i}] = ${v}`;

/** An index for narration, with a true minus sign: high can reach −1. */
const ix = (i: number) => (i < 0 ? `−${-i}` : String(i));

/** "is below 5", "equals 5", "is above 5". */
const word: Record<Kind, string> = { below: 'is below', equal: 'equals', above: 'is above' };

// ----- What each approach costs (computed first, so the totals stay fixed) -----

/**
 * The pattern on plain numbers: the partitioned values, the bounds (low, high), and the swaps of
 * two different slots.
 */
export function partitionValues(
  vs: readonly number[],
  p: number,
): { a: number[]; low: number; high: number; swaps: number } {
  const a = [...vs];
  let low = 0;
  let mid = 0;
  let high = a.length - 1;
  let swaps = 0;
  while (mid <= high) {
    if (a[mid]! < p) {
      if (low !== mid) swaps++;
      [a[low], a[mid]] = [a[mid]!, a[low]!];
      low++;
      mid++;
    } else if (a[mid]! > p) {
      if (mid !== high) swaps++;
      [a[mid], a[high]] = [a[high]!, a[mid]!];
      high--;
    } else mid++;
  }
  return { a, low, high, swaps };
}

/** What each approach costs: 2n comparisons and 2n writes, against n comparisons and the swaps. */
export const totals = (vs: readonly number[], p: number): Totals => ({
  naive: 4 * vs.length,
  pattern: vs.length + partitionValues(vs, p).swaps,
});

// ----- Text -----

/** "A[0..2] < 5", "A[3] = 5", or "no value equals 5". */
function regionText(lo: number, hi: number, sign: string, p: number, none: string): string {
  return hi < lo ? none : `${span(lo, hi)} ${sign} ${p}`;
}

/** "A[0..2] < 5, A[3..5] = 5 and A[6..8] > 5", starting with a capital. */
export function outcome(n: number, low: number, high: number, p: number): string {
  const parts = [
    regionText(0, low - 1, '<', p, `no value is below ${p}`),
    regionText(low, high, '=', p, `no value equals ${p}`),
    regionText(high + 1, n - 1, '>', p, `no value is above ${p}`),
  ];
  const text = `${parts[0]}, ${parts[1]} and ${parts[2]}`;
  return text[0]!.toUpperCase() + text.slice(1);
}

// ----- Steps -----

function refuse(s: ArrayState, why: string): FlagStep {
  return {
    state: s,
    marks: [mark('row-a', 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.a.length },
  };
}

/** The pattern: low, mid and high in one pass. */
function* threePointers(s: ArrayState, p: number): Gen {
  const a = [...s.a];
  const n = a.length;
  const tot = totals(
    a.map((x) => x.value),
    p,
  );
  const work = new Work(UNITS);
  let low = 0;
  let mid = 0;
  let high = n - 1;
  const state = (): ArrayState => ({ a: [...a], nextUid: s.nextUid });
  const regions = (): BarsRegion[] => [
    { id: 'lt', from: 0, to: low - 1, tone: 'plain', label: `< ${p}` },
    { id: 'eq', from: low, to: mid - 1, tone: 'plain', label: `= ${p}` },
    { id: 'unknown', from: mid, to: high, tone: 'window', label: 'unknown' },
    { id: 'gt', from: high + 1, to: n - 1, tone: 'plain', label: `> ${p}` },
  ];
  const extra = (role?: { mid?: MarkRole }): FlagExtra => ({
    p,
    pointers: [
      { name: 'low', at: low },
      { name: 'mid', at: mid, role: role?.mid ?? 'active' },
      { name: 'high', at: high },
    ],
    regions: regions(),
  });
  const vars = (): Record<string, Scalar> => ({ p, low, mid, high, ...workVars(work, tot) });
  const step = (say: string, lines: string[], marks: Mark[], level: 1 | 2 = 2): FlagStep => ({
    state: state(),
    marks,
    say,
    lines,
    level,
    vars: vars(),
    extra: extra(),
  });

  yield step(
    `Partition around p = ${p} in one pass. low = 0, mid = 0 and high = ${n - 1}: the whole array is unknown. Each step looks at A[mid] and makes the unknown region one smaller.`,
    ['init'],
    [],
  );

  while (mid <= high) {
    const x = a[mid]!.value;
    work.add('comparisons');
    const kind = kindOf(x, p);
    const look = `${at(mid, x)} ${word[kind]} ${p}`;
    if (kind === 'below') {
      const from = low;
      const self = low === mid;
      const was = a[low]!.value;
      [a[low], a[mid]] = [a[mid]!, a[low]!];
      if (!self) work.add('swaps');
      low++;
      mid++;
      yield step(
        self
          ? `${look}. low = mid = ${from}, so the swap trades A[${from}] with itself: nothing moves, and swaps stays at ${work.get('swaps')}. low and mid move on to ${mid}.`
          : `${look}: swap it with A[low] = A[${from}] = ${was}, the first ${p}. Now ${x} sits with the values below and the ${p} with the ${p}s. low = ${low}, mid = ${mid}.`,
        ['loop', 'lt', 'swapLow', 'moveLow'],
        self
          ? [mark(vid(a[from]!), 'active')]
          : [mark(vid(a[from]!), 'active'), mark(vid(a[mid - 1]!), 'active')],
      );
    } else if (kind === 'above') {
      const from = high;
      const self = mid === high;
      const was = a[high]!.value;
      [a[mid], a[high]] = [a[high]!, a[mid]!];
      if (!self) work.add('swaps');
      high--;
      yield step(
        self
          ? `${look}. mid = high = ${from}, so the swap trades A[${from}] with itself: nothing moves, and swaps stays at ${work.get('swaps')}. high moves back to ${ix(high)}.`
          : `${look}: swap it with A[high] = A[${from}] = ${was}. ${x} joins the values above, and high = ${high}. mid stays at ${mid}: ${was} came from the unknown region, so it has not been looked at yet.`,
        ['loop', 'gt', 'swapHigh', 'moveHigh'],
        self
          ? [mark(vid(a[from]!), 'active')]
          : [mark(vid(a[from]!), 'active'), mark(vid(a[mid]!), 'compare')],
      );
    } else {
      mid++;
      yield step(
        `${look}: it is already in the right region. mid = ${mid}.`,
        ['loop', 'eq', 'moveMid'],
        [mark(vid(a[mid - 1]!), 'active')],
      );
    }
  }

  yield {
    state: state(),
    marks: [],
    say: `mid = ${mid} has passed high = ${ix(high)}: nothing is unknown. ${outcome(n, low, high, p)}. One pass took ${work.tally()}; counting then rewriting takes ${2 * n} comparisons and ${2 * n} writes.`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: extra({ mid: undefined }),
  };
  return state();
}

/** Count then rewrite: count the kinds, copy each value into its place in B, copy B back. */
function* countRewrite(s: ArrayState, p: number): Gen {
  const a: Item[] = [...s.a];
  const n = a.length;
  const tot = totals(
    a.map((x) => x.value),
    p,
  );
  const work = new Work(UNITS);
  const b: (Item | null)[] = Array(n).fill(null);
  const count: Record<Kind, number> = { below: 0, equal: 0, above: 0 };
  let i = 0;
  let starts: Record<Kind, number> | null = null;
  const state = (): ArrayState => ({ a: [...a], nextUid: s.nextUid });
  const bRegions = (): BarsRegion[] =>
    starts
      ? [
          { id: 'b-lt', row: 'b', from: 0, to: starts.equal - 1, tone: 'plain', label: `< ${p}` },
          {
            id: 'b-eq',
            row: 'b',
            from: starts.equal,
            to: starts.above - 1,
            tone: 'plain',
            label: `= ${p}`,
          },
          { id: 'b-gt', row: 'b', from: starts.above, to: n - 1, tone: 'plain', label: `> ${p}` },
        ]
      : [];
  const extra = (pointers: BarsPointer[] = [{ name: 'i', at: i, role: 'active' }]): FlagExtra => ({
    p,
    pointers,
    regions: [],
    b: [...b],
    bRegions: bRegions(),
  });
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    p,
    i,
    below: count.below,
    equal: count.equal,
    above: count.above,
    ...more,
    ...workVars(work, tot),
  });

  yield {
    state: state(),
    marks: [],
    say: `Partition around p = ${p} by counting, then rewriting. Pass 1 counts the values below, equal to and above ${p}.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra([]),
  };

  for (i = 0; i < n; i++) {
    const x = a[i]!.value;
    const kind = kindOf(x, p);
    work.add('comparisons');
    count[kind]++;
    yield {
      state: state(),
      marks: [mark(vid(a[i]!), 'compare')],
      say: `${at(i, x)} ${word[kind]} ${p}: ${kind} = ${count[kind]}.`,
      lines: ['count', 'tally'],
      level: 2,
      vars: vars(),
      extra: extra(),
    };
  }

  starts = { below: 0, equal: count.below, above: count.below + count.equal };
  const next: Record<Kind, number> = { ...starts };
  i = 0;
  yield {
    state: state(),
    marks: [],
    say: `${plural(count.below, 'value')} below ${p}, ${count.equal} equal and ${count.above} above. So in a new array B the values below ${p} start at B[0], the ${p}s at B[${starts.equal}] and the values above at B[${starts.above}]. Pass 2 copies each value to the next free slot of its kind.`,
    lines: ['starts'],
    level: 2,
    vars: vars(),
    extra: extra([]),
  };

  for (i = 0; i < n; i++) {
    const item = a[i]!;
    const kind = kindOf(item.value, p);
    work.add('comparisons');
    const to = next[kind]++;
    b[to] = item;
    a[i] = { uid: 0, value: item.value, stale: true };
    work.add('writes');
    yield {
      state: state(),
      marks: [mark(vid(item), 'new')],
      say: `${at(i, item.value)} ${word[kind]} ${p}, so it goes to B[${to}], the next free slot for its kind.`,
      lines: ['place', 'write'],
      level: 2,
      vars: vars(),
      extra: extra([
        { name: 'i', at: i, role: 'active' },
        { name: 'to', at: to, row: 'b', role: 'active' },
      ]),
    };
  }

  i = 0;
  for (let k = 0; k < n; k++) {
    const item = b[k]!;
    a[k] = item;
    b[k] = { uid: 0, value: item.value, stale: true };
    work.add('writes');
    yield {
      state: state(),
      marks: [mark(vid(item), 'new')],
      say: `Copy B[${k}] = ${item.value} back to A[${k}].`,
      lines: ['copy'],
      level: 2,
      vars: vars(),
      extra: extra([{ name: 'k', at: k, role: 'active' }]),
    };
  }

  const low = count.below;
  const high = count.below + count.equal - 1;
  yield {
    state: state(),
    marks: [],
    say: `${outcome(n, low, high, p)}. Two passes and a copy took ${work.tally()}, and B needed ${plural(n, 'extra slot')}. Three pointers take ${n} comparisons and ${plural(tot.pattern - n, 'swap')}, in place.`,
    lines: ['ret'],
    level: 1,
    vars: vars({ low, high }),
    extra: extra([]),
  };
  return state();
}

const partition: Op = {
  label: 'Partition',
  arity: 1,
  *run(s, [arg], { settings }) {
    const p = intArg(arg, 0, MAX_PIVOT, 'The pivot');
    if (typeof p === 'string') {
      yield refuse(s, p);
      return s;
    }
    return approachOf(settings) === 'naive'
      ? yield* countRewrite(s, p)
      : yield* threePointers(s, p);
  },
};

export const ops: Record<string, Op> = {
  partition,
  // A load step carries no extra, so the sorting kit's load fits this page's steps too.
  load: loadOp<FlagSettings>({ ready: 'Type a pivot and press Partition.' }) as unknown as Op,
};

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FlagSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'partition',
        lines: [
          L(
            'sig',
            0,
            'countThenRewrite(A, p)',
            'To put the values of A below p first, then those equal to p, then those above, by counting:',
          ),
          L('init', 1, 'count = [0, 0, 0]', 'No values counted yet.'),
          L('count', 1, 'for i = 0 to n − 1', 'Pass 1: for each value,'),
          L('tally', 2, 'count[kind(A[i], p)] += 1', 'count it as below, equal to or above p.'),
          L(
            'starts',
            1,
            'next = [0, count[0], count[0] + count[1]]',
            'In a new array B, the values below p start at 0, the ps after them, the values above after those.',
          ),
          L('place', 1, 'for i = 0 to n − 1', 'Pass 2: for each value, in order,'),
          L(
            'write',
            2,
            'k = kind(A[i], p); B[next[k]] = A[i]; next[k] += 1',
            'copy it to the next free slot of its kind in B.',
          ),
          L('copy', 1, 'copy B into A', 'Copy B back into A.'),
          L(
            'ret',
            1,
            'return (count[0], count[0] + count[1] − 1)',
            'The values equal to p are now in A[low..high]: hand back low and high.',
          ),
        ],
      },
    ];
  }
  return [
    {
      op: 'partition',
      lines: [
        L(
          'sig',
          0,
          'threeWayPartition(A, p)',
          'To put the values of A below p first, then those equal to p, then those above, in one pass:',
        ),
        L(
          'init',
          1,
          'low = 0; mid = 0; high = n − 1',
          'Everything is unknown: below, equal and above are all empty.',
        ),
        L('loop', 1, 'while mid ≤ high', 'While some value is unknown, look at A[mid]:'),
        L('lt', 2, 'if A[mid] < p', 'if it is below p,'),
        L(
          'swapLow',
          3,
          'swap A[low] and A[mid]',
          'swap it with the first p (or with itself if there is none yet),',
        ),
        L(
          'moveLow',
          3,
          'low = low + 1; mid = mid + 1',
          'and grow the below and equal regions by one each;',
        ),
        L('gt', 2, 'else if A[mid] > p', 'if it is above p,'),
        L('swapHigh', 3, 'swap A[mid] and A[high]', 'swap it with the last unknown value,'),
        L(
          'moveHigh',
          3,
          'high = high − 1',
          'and grow the above region; the value that came to mid is still unknown;',
        ),
        L('eq', 2, 'else', 'if it equals p,'),
        L('moveMid', 3, 'mid = mid + 1', 'leave it and move on.'),
        L(
          'ret',
          1,
          'return (low, high)',
          'The values equal to p are in A[low..high]: hand back low and high.',
        ),
      ],
    },
  ];
}

// ----- Start -----

export function initialSay(s: ArrayState): string {
  return `A holds ${plural(s.a.length, 'value')}. Type a pivot, such as ${START_P}, and press Partition: values below it go first, then the ones equal to it, then the ones above. Type a list of values and press Load to start over.`;
}

export const initialVars = (s: ArrayState) => ({ n: s.a.length });
