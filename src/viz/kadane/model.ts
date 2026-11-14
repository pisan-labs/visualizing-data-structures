/**
 * Kadane's maximum subarray: the subarray (one or more values in a row) of A with the largest
 * sum, and where it is.
 *
 * - The pattern makes one pass and keeps `run`, the best sum of a subarray that ends at the
 *   current value. At A[j] there are two choices: extend the run that ended at A[j − 1], or
 *   restart at A[j]. Extending is worse exactly when the run so far is negative, so: if run < 0,
 *   restart here; then add A[j]. `best` keeps the largest run seen and where it was.
 * - The naive approach tries every pair of ends: for each start i, extend the end j and keep the
 *   sum of A[i..j], n(n + 1)/2 sums in all.
 *
 * Ties: both approaches report the same subarray, the one that starts first and, of those, ends
 * first. The pass keeps the run going when it is exactly 0 (restart only when negative), so a
 * run starts as early as it can, and it replaces best only when a run is strictly larger. The
 * naive scan, start by start and end by end, also keeps the first it sees.
 *
 * The empty subarray: by default a subarray has at least one value (as in CLRS), so an
 * all-negative array's answer is its largest value. The `empty` setting allows the empty
 * subarray too (as Bentley's Programming Pearls does): best starts at 0, for the empty one, and
 * an all-negative array's answer is 0. The loop is the same.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a sum is one addition, a comparison is one
 * test of two numbers. The pass does n sums and 2n comparisons (run < 0, run > best); every
 * pair of ends does n(n + 1)/2 of each.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import { fmt, plural, plus, readInts, span as spanOf } from '../_arr1/kit';

export { fmt, plural };

export const MAX_N = 12;
export const MIN_VALUE = -99;
export const MAX_VALUE = 99;

/** The array the page starts with: a dip worth crossing, and one that is not. */
export const START = [3, -4, 5, -2, -1, 6, -7, 2, 1];

export interface KSettings {
  [key: string]: Scalar;
  approach: Approach;
  empty: boolean;
}

export const defaults: KSettings = { approach: 'pattern', empty: false };

export interface KState {
  a: number[];
}

/** A subarray A[lo..hi], both ends included; hi = lo − 1 is the empty one. */
export interface Span {
  lo: number;
  hi: number;
}

export interface KExtra {
  /** The pattern: run[j], the best sum of a subarray ending at A[j], once reached. */
  run?: (number | null)[];
  /** The pattern: where each run started, in order (the first is 0). */
  starts?: number[];
  /** Every pair of ends: tri[i][j] is the sum of A[i..j] once computed (j ≥ i). */
  tri?: (number | null)[][];
  /** The run (pattern) or the pair (naive) being looked at, and its sum. */
  cur?: Span & { sum: number };
  /** The best so far: null before any (no empty subarray allowed). */
  best: (Span & { sum: number }) | null;
}

export type KStep = Step<KState, KExtra>;
type Op = OpSpec<KState, KSettings, KExtra>;

export const init = (): KState => ({ a: [...START] });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export const span = (s: Span): string => (s.hi < s.lo ? 'the empty subarray' : spanOf(s.lo, s.hi));

/** "A[2..5] = 5, −2, −1, 6". */
const spelled = (a: readonly number[], s: Span) =>
  s.hi < s.lo
    ? 'the empty subarray'
    : `${span(s)} = ${a
        .slice(s.lo, s.hi + 1)
        .map(fmt)
        .join(', ')}`;

// ----- Input -----

const LIMITS = { max: MAX_N, lo: MIN_VALUE, hi: MAX_VALUE, example: '3 -4 5 -2' };

/** For the input box: a list of values to load ("3 -4 5"). */
export function parseInput(token: string): Value | Error {
  const vs = readValues(token);
  return typeof vs === 'string' ? new Error(vs) : vs.join(' ');
}

export const readValues = (arg: Value | undefined): number[] | string => readInts(arg, LIMITS);

// ----- The answer, computed straight -----

/** What each approach costs on n values: 3n against n(n + 1). */
export const totals = (n: number): Totals => ({ naive: n * (n + 1), pattern: 3 * n });

/**
 * The maximum subarray by the pass: its sum and ends, and where each run started. With `empty`
 * and no positive sum, the empty subarray (lo 0, hi −1, sum 0).
 */
export function kadane(a: readonly number[], empty: boolean) {
  let best: (Span & { sum: number }) | null = empty ? { lo: 0, hi: -1, sum: 0 } : null;
  let run = 0;
  let start = 0;
  const starts = [0];
  for (let j = 0; j < a.length; j++) {
    if (run < 0) {
      run = 0;
      start = j;
      starts.push(j);
    }
    run += a[j]!;
    if (!best || run > best.sum) best = { lo: start, hi: j, sum: run };
  }
  return { best: best!, starts };
}

// ----- Steps -----

function refuse(s: KState, why: string): KStep {
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
      yield refuse(s, `${vs} The array stays as it was.`);
      return s;
    }
    const next = { a: vs };
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(vs.length, 'value')} into A: ${vs.map(fmt).join(', ')}. Press Max subarray.`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
    };
    return next;
  },
};

const bestVar = (b: KExtra['best']): Scalar => (b ? b.sum : '−∞');

function done(a: readonly number[], best: Span & { sum: number }, empty: boolean): string {
  if (best.hi < best.lo)
    return `Done: every value is negative${a.some((v) => v === 0) ? ' or 0' : ''}, so no subarray beats the empty one: best = 0, the empty subarray.`;
  const allNeg = a.every((v) => v < 0);
  return `Done: the maximum subarray is ${spelled(a, best)}, with sum ${fmt(best.sum)}.${
    allNeg && !empty ? ' Every value is negative, so the best is the largest single value.' : ''
  }`;
}

/** The pattern: one pass, extend or restart. */
function* pattern(s: KState, settings: KSettings): Generator<KStep, KState, void> {
  const a = s.a;
  const n = a.length;
  const tot = totals(n);
  const work = new Work(['sums', 'comparisons']);
  const run: (number | null)[] = Array(n).fill(null);
  const starts: number[] = [0];
  let best: KExtra['best'] = settings.empty ? { lo: 0, hi: -1, sum: 0 } : null;
  let r = 0;
  let start = 0;
  let cur: KExtra['cur'];
  const extra = (): KExtra => ({
    run: [...run],
    starts: [...starts],
    ...(cur ? { cur: { ...cur } } : {}),
    best: best && { ...best },
  });
  const vars = (j: number): Record<string, Scalar> => ({
    j,
    run: r,
    best: bestVar(best),
    ...workVars(work, tot),
  });

  yield {
    state: s,
    marks: [],
    say: settings.empty
      ? 'Find the subarray with the largest sum, the empty one allowed. Start with best = 0, for the empty subarray, and an empty run. At each value, extend the run or restart there.'
      : 'Find the subarray (one or more values in a row) with the largest sum. Start with no best yet (−∞) and an empty run. At each value, extend the run or restart there.',
    lines: ['init', 'run'],
    level: 2,
    vars: vars(0),
    extra: extra(),
  };

  for (let j = 0; j < n; j++) {
    const x = a[j]!;
    const was = r;
    work.add('comparisons');
    const restart = r < 0;
    if (restart) {
      r = 0;
      start = j;
      starts.push(j);
    }
    r += x;
    work.add('sums');
    run[j] = r;
    cur = { lo: start, hi: j, sum: r };
    work.add('comparisons');
    const better = !best || r > best.sum;
    const before = best;
    if (better) best = { lo: start, hi: j, sum: r };

    let how: string;
    if (j === 0) how = `A[0] = ${fmt(x)} starts the first run: run = ${fmt(r)}.`;
    else if (restart)
      how = `The run so far is ${fmt(was)}, negative: it would only drag A[${j}] down. Restart here: run = ${fmt(x)}.`;
    else
      how = `The run so far is ${fmt(was)}, not negative, so extend it: run = ${plus(was, x)} = ${fmt(r)}.`;
    const verdict = better
      ? before
        ? ` Better than best = ${fmt(before.sum)}: best = ${fmt(r)}, ${span(cur)}.`
        : ` The first best: ${fmt(r)}, ${span(cur)}.`
      : ` Not better than best = ${fmt(before!.sum)}.`;
    yield {
      state: s,
      marks: [
        mark(`a-${j}`, 'active'),
        mark(`r-${j}`, better ? 'found' : restart ? 'new' : 'active'),
        ...(restart && j > 0 ? [mark(`cut-${j}`, 'new')] : []),
      ],
      say: how + verdict,
      lines: [
        'loop',
        'check',
        ...(restart ? ['restart'] : []),
        'extend',
        'better',
        ...(better ? ['keep'] : []),
      ],
      level: 2,
      vars: vars(j),
      extra: extra(),
    };
  }

  cur = undefined;
  const b = best!;
  yield {
    state: s,
    marks: b.hi >= b.lo ? [mark('br-best', 'found')] : [],
    say: `${done(a, b, settings.empty)} One pass did ${work.tally()}; every pair of ends takes ${tot.naive / 2} sums and ${tot.naive / 2} comparisons.`,
    lines: ['ret'],
    level: 1,
    vars: { ...vars(n - 1), lo: b.lo, hi: b.hi, length: b.hi - b.lo + 1 },
    extra: extra(),
  };
  return s;
}

/** Every pair of ends: for each start, extend the end and keep the sum. */
function* naive(s: KState, settings: KSettings): Generator<KStep, KState, void> {
  const a = s.a;
  const n = a.length;
  const tot = totals(n);
  const work = new Work(['sums', 'comparisons']);
  const tri: (number | null)[][] = a.map(() => Array(n).fill(null));
  let best: KExtra['best'] = settings.empty ? { lo: 0, hi: -1, sum: 0 } : null;
  let sum = 0;
  let cur: KExtra['cur'];
  const extra = (): KExtra => ({
    tri: tri.map((r) => [...r]),
    ...(cur ? { cur: { ...cur } } : {}),
    best: best && { ...best },
  });
  const vars = (i: number, j: number): Record<string, Scalar> => ({
    i,
    j,
    sum,
    best: bestVar(best),
    ...workVars(work, tot),
  });

  yield {
    state: s,
    marks: [],
    say: `Find the subarray with the largest sum by trying every pair of ends: for each start i, extend the end j one value at a time and keep the sum of A[i..j]. ${
      settings.empty ? 'best starts at 0, for the empty subarray.' : 'No best yet (−∞).'
    }`,
    lines: ['init'],
    level: 2,
    vars: vars(0, 0),
    extra: extra(),
  };

  for (let i = 0; i < n; i++) {
    sum = 0;
    for (let j = i; j < n; j++) {
      const was = sum;
      sum += a[j]!;
      work.add('sums');
      tri[i]![j] = sum;
      cur = { lo: i, hi: j, sum };
      work.add('comparisons');
      const before = best;
      const better = !best || sum > best.sum;
      if (better) best = { lo: i, hi: j, sum };
      const rowDone =
        j === n - 1
          ? ` That was the last end for start ${i}: row ${i} has its ${plural(n - i, 'sum')}.`
          : '';
      yield {
        state: s,
        marks: [mark(`a-${j}`, 'active'), mark(`t-${i}-${j}`, better ? 'found' : 'new')],
        say: `${span(cur)}: sum = ${j === i ? fmt(sum) : `${plus(was, a[j]!)} = ${fmt(sum)}`}.${
          better
            ? before
              ? ` Better than best = ${fmt(before.sum)}: best = ${fmt(sum)}.`
              : ` The first best: ${fmt(sum)}.`
            : ` Not better than best = ${fmt(before!.sum)}.`
        }${rowDone}`,
        lines: [
          ...(j === i ? ['outer', 'reset'] : []),
          'inner',
          'add',
          'better',
          ...(better ? ['keep'] : []),
        ],
        // Every pair is a step at normal detail: the naive way takes longer to play, too.
        level: 2,
        vars: vars(i, j),
        extra: extra(),
      };
    }
  }

  cur = undefined;
  const b = best!;
  yield {
    state: s,
    marks: b.hi >= b.lo ? [mark('br-best', 'found')] : [],
    say: `${done(a, b, settings.empty)} Every pair of ends took ${work.tally()}; one pass takes ${n} sums and ${2 * n} comparisons.`,
    lines: ['ret'],
    level: 1,
    vars: { ...vars(n - 1, n - 1), lo: b.lo, hi: b.hi, length: b.hi - b.lo + 1 },
    extra: extra(),
  };
  return s;
}

const find: Op = {
  label: 'Max subarray',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.a.length === 0) {
      yield refuse(s, 'A is empty. Load some values first.');
      return s;
    }
    return approachOf(settings) === 'naive'
      ? yield* naive(s, settings)
      : yield* pattern(s, settings);
  },
};

export const ops: Record<string, Op> = { find, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: KSettings): PseudoBlock[] {
  const init = settings.empty
    ? L('init', 1, 'best = 0; lo = 0; hi = −1', 'The empty subarray, sum 0, is the best so far.')
    : L('init', 1, 'best = −∞', 'No best yet.');
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'find',
        lines: [
          L(
            'sig',
            0,
            'maxSubarray(A)   // every pair of ends',
            'To find the subarray of A with the largest sum, try every pair of ends:',
          ),
          init,
          L('outer', 1, 'for i = 0 to n − 1', 'For each start i,'),
          L('reset', 2, 'sum = 0', 'start the sum from nothing,'),
          L('inner', 2, 'for j = i to n − 1', 'and for each end j from i on:'),
          L('add', 3, 'sum = sum + A[j]', 'add A[j], so sum is the sum of A[i..j];'),
          L('better', 3, 'if sum > best', 'if it beats the best so far,'),
          L('keep', 4, 'best = sum; lo = i; hi = j', 'keep it and where it is.'),
          L('ret', 1, 'return best, A[lo..hi]', 'Hand back the best sum and its subarray.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'find',
      lines: [
        L(
          'sig',
          0,
          'maxSubarray(A)',
          'To find the subarray of A with the largest sum, in one pass:',
        ),
        init,
        L('run', 1, 'run = 0; start = 0', 'The run, the best subarray ending here, starts empty.'),
        L('loop', 1, 'for j = 0 to n − 1', 'Go through A once, left to right:'),
        L('check', 2, 'if run < 0', 'if the run so far is negative, it only drags A[j] down,'),
        L('restart', 3, 'run = 0; start = j', 'so drop it and restart at A[j];'),
        L('extend', 2, 'run = run + A[j]', 'add A[j] to the run;'),
        L('better', 2, 'if run > best', 'if the run beats the best so far,'),
        L('keep', 3, 'best = run; lo = start; hi = j', 'keep it and where it is.'),
        L('ret', 1, 'return best, A[lo..hi]', 'Hand back the best sum and its subarray.'),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: KState): string {
  return `A holds ${plural(s.a.length, 'value')}: ${s.a.map(fmt).join(', ')}.`;
}

export function initialSay(s: KState): string {
  return `A holds ${plural(s.a.length, 'value')}, some negative. Which subarray has the largest sum? Press Max subarray. Type a list of values and press Load to start over.`;
}

export const initialVars = (s: KState) => ({ n: s.a.length });
