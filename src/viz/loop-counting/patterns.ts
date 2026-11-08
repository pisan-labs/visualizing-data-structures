/**
 * The loop patterns: their code, the iteration space each one is drawn on, the loops themselves
 * (as generators of events the run turns into steps), and the exact count with the Big-O it
 * simplifies to.
 */
import type { PseudoLine, Scalar } from '../../engine/types';
import { L, plural } from '../_recursion/kit';

export const PATTERNS = [
  'single',
  'nested',
  'triangle',
  'pairs',
  'sequence',
  'halving',
  'sqrt',
  'doubling',
  'geometric',
  'search',
  'triple',
] as const;
export type PatternId = (typeof PATTERNS)[number];

/** Where the early-exit search finds x. */
export type Found = 'first' | 'middle' | 'missing';

/** Orders of growth, slowest first. */
export const ORDERS = ['1', 'log n', '√n', 'n', 'n log n', 'n²', 'n³'] as const;
export type Order = (typeof ORDERS)[number];

/** What doubling n does to a count of each order. */
export const DOUBLING: Record<Order, string> = {
  '1': 'stays the same',
  'log n': 'goes up by about 1',
  '√n': 'grows about ×1.4',
  n: 'about doubles',
  'n log n': 'a bit more than doubles',
  'n²': 'grows about ×4',
  'n³': 'grows about ×8',
};

/** A cell of the iteration space: slice (one per i, triple loops only), row, column; 0-based. */
export type Cell = readonly [s: number, r: number, c: number];

/** The iteration space a run lights up: a row, a grid, or a grid per i. */
export interface Frame {
  slices: number;
  rows: number;
  cols: number;
  rowNames: string[];
  colNames: string[];
  /** Names the header lanes, in the top left corner: "i", "i\j". */
  corner: string;
  /** One title per slice ("i = 1"), when there is more than one. */
  sliceNames?: string[];
  /** Text inside the cells of the one row: the array of the early-exit search. */
  values?: string[];
  /** What the drawing shows, for the first step of a run. */
  describe: string;
}

/** One moment of the loops a learner can stop on. */
export interface Ev {
  /** The counted line ran for this cell. */
  body?: Cell;
  /** A loop test looked at this cell and failed: drawn without lighting it. */
  probe?: Cell;
  /** An outer iteration ended: its row (or, for the triple loop, its slice). */
  row?: { s: number; r: number | null };
  /** The early exit: x is in this cell. */
  found?: Cell;
  say: () => string;
  lines: string[];
  level: 2 | 3;
  /** Loop variables and the count, as the code has them now. */
  v: Record<string, Scalar>;
}

type Walk = Generator<Ev, void, void>;

export interface Pattern {
  id: PatternId;
  /** Option label in the settings. */
  label: string;
  /** Short name for narration: "the triangle". */
  name: string;
  /** Largest n the run draws. */
  maxN: number;
  /** The pseudocode, ids init ... ret. */
  lines: PseudoLine[];
  /** Ids of the lines drawn on the stage's code card. */
  card: string[];
  /** Ids of the counted lines. */
  counted: string[];
  frame(n: number): Frame;
  walk(n: number, found: Found): Walk;
  /** T(n) in closed form. */
  exact(n: number, found: Found): number;
  /** The right side of T(n) = ... */
  formula(found: Found): string;
  /** A definition the formula uses, such as k = ⌊log₂ n⌋. */
  where?: string;
  /** T(n) worked out for this n, before "= value": "8·9/2". */
  plug(n: number, found: Found): string;
  /** How the loops give the formula, for narration. */
  why(found: Found): string;
  /** T(n) written as a sum of terms, when that shows what to drop. */
  expand(found: Found): string | null;
  /** Which terms Big-O drops and why, for narration. */
  drop(found: Found): string;
  /** The same for the drawing, in a few words. */
  dropShort(found: Found): string;
  order(found: Found): Order;
}

// ----- Helpers -----

/** ⌊log₂ n⌋ for n ≥ 1, by halving, as the loops do it. */
export function lg(n: number): number {
  let k = 0;
  for (let m = n; m > 1; m = Math.floor(m / 2)) k++;
  return k;
}

/** ⌊√n⌋ for n ≥ 0. */
export function isqrt(n: number): number {
  let r = 0;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};
export const sup = (n: number) => [...String(n)].map((c) => SUP[c] ?? c).join('');

const range = (n: number) => Array.from({ length: n }, (_, k) => String(k + 1));
const times = (k: number) => plural(k, 'time');

/** The array the early-exit search looks through: distinct, in no order. */
export const VALUES = [17, 42, 8, 33, 25, 61, 9, 50, 14, 76, 38, 3, 91, 27, 66, 45];
/** A value that is not in the array. */
export const MISSING = 99;

/** The position (1-based) of x for each case, or 0 when x is not in A. */
export function targetIndex(n: number, found: Found): number {
  if (found === 'first') return 1;
  if (found === 'middle') return Math.ceil(n / 2);
  return 0;
}

export const targetValue = (n: number, found: Found) => {
  const at = targetIndex(n, found);
  return at ? VALUES[at - 1]! : MISSING;
};

const row1 = (n: number, corner: string, rowName: string, describe: string): Frame => ({
  slices: 1,
  rows: 1,
  cols: n,
  rowNames: [rowName],
  colNames: range(n),
  corner,
  describe,
});

const square = (n: number, describe: string): Frame => ({
  slices: 1,
  rows: n,
  cols: n,
  rowNames: range(n),
  colNames: range(n),
  corner: 'i\\j',
  describe,
});

const pairsText = (n: number) =>
  `The grid has a cell for every pair (i, j), each from 1 to ${n}; only some of them will light.`;

// ----- The patterns -----

const single: Pattern = {
  id: 'single',
  label: 'One loop: for i = 1 to n',
  name: 'the single loop',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('outer', 0, 'for i = 1 to n', 'For each i from 1 to n,'),
    L('body', 1, 'count = count + 1', 'do the work once and count it.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['outer', 'body'],
  counted: ['body'],
  frame: (n) => row1(n, 'i', '', `The row has a cell for each value of i, 1 to ${n}.`),
  *walk(n): Walk {
    let count = 0;
    for (let i = 1; i <= n; i++) {
      count++;
      const c = count;
      yield {
        body: [0, 0, i - 1],
        say: () => `i = ${i}: the body runs. count = ${c}.`,
        lines: ['body'],
        level: 2,
        v: { i, count: c },
      };
    }
    yield {
      say: () =>
        `i = ${n + 1} is past n, so the loop stops. Its test ran ${n + 1} times, but the body ran ${times(n)}: count the body.`,
      lines: ['outer'],
      level: 2,
      v: { i: n + 1, count },
    };
  },
  exact: (n) => n,
  formula: () => 'n',
  plug: (n) => String(n),
  why: () => 'One pass, one body for each i from 1 to n: T(n) = n.',
  expand: () => null,
  drop: () => 'T(n) = n has nothing to drop.',
  dropShort: () => 'nothing to drop',
  order: () => 'n',
};

const nested: Pattern = {
  id: 'nested',
  label: 'Nested: for i = 1 to n, for j = 1 to n',
  name: 'the nested loops',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('outer', 0, 'for i = 1 to n', 'For each i from 1 to n,'),
    L('inner', 1, 'for j = 1 to n', 'and for each j from 1 to n,'),
    L('body', 2, 'count = count + 1', 'do the work once and count it.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['outer', 'inner', 'body'],
  counted: ['body'],
  frame: (n) => square(n, `The grid has a cell for every pair (i, j), each from 1 to ${n}.`),
  *walk(n): Walk {
    let count = 0;
    for (let i = 1; i <= n; i++) {
      let ran = 0;
      for (let j = 1; j <= n; j++) {
        count++;
        ran++;
        const c = count;
        yield {
          body: [0, i - 1, j - 1],
          say: () => `i = ${i}, j = ${j}: count = ${c}.`,
          lines: ['body'],
          level: 3,
          v: { i, j, count: c },
        };
      }
      const c = count;
      yield {
        row: { s: 0, r: i - 1 },
        say: () =>
          `i = ${i}: the inner loop ran ${times(ran)}, j = 1 to ${n}, whatever i is. count = ${c}.`,
        lines: ['inner', 'body'],
        level: 2,
        v: { i, count: c },
      };
    }
  },
  exact: (n) => n * n,
  formula: () => 'n²',
  plug: (n) => `${n} · ${n}`,
  why: () => 'The inner loop runs n times for each of the n values of i: T(n) = n · n = n².',
  expand: () => null,
  drop: () => 'T(n) = n² has nothing to drop.',
  dropShort: () => 'nothing to drop',
  order: () => 'n²',
};

const triangle: Pattern = {
  id: 'triangle',
  label: 'Triangle: for i = 1 to n, for j = i to n',
  name: 'the triangle',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('outer', 0, 'for i = 1 to n', 'For each i from 1 to n,'),
    L('inner', 1, 'for j = i to n', 'and for each j from i up to n,'),
    L('body', 2, 'count = count + 1', 'do the work once and count it.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['outer', 'inner', 'body'],
  counted: ['body'],
  frame: (n) => square(n, pairsText(n)),
  *walk(n): Walk {
    let count = 0;
    for (let i = 1; i <= n; i++) {
      let ran = 0;
      for (let j = i; j <= n; j++) {
        count++;
        ran++;
        const c = count;
        yield {
          body: [0, i - 1, j - 1],
          say: () => `i = ${i}, j = ${j}: count = ${c}.`,
          lines: ['body'],
          level: 3,
          v: { i, j, count: c },
        };
      }
      const c = count;
      yield {
        row: { s: 0, r: i - 1 },
        say: () => `i = ${i}: j ran from ${i} to ${n}, ${times(ran)}. count = ${c}.`,
        lines: ['inner', 'body'],
        level: 2,
        v: { i, count: c },
      };
    }
  },
  exact: (n) => (n * (n + 1)) / 2,
  formula: () => 'n(n+1)/2',
  plug: (n) => `${n}·${n + 1}/2`,
  why: () =>
    'Row i runs n − i + 1 times, so T(n) = n + (n − 1) + … + 2 + 1, which adds up to n(n+1)/2.',
  expand: () => 'n²/2 + n/2',
  drop: () =>
    'n/2 grows more slowly than n²/2, so drop it; then drop the constant factor ½. Half a square is still a square.',
  dropShort: () => 'drop n/2, then the ½',
  order: () => 'n²',
};

const pairs: Pattern = {
  id: 'pairs',
  label: 'Pairs: for i = 1 to n, for j = 1 to i − 1',
  name: 'the pairs loop',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('outer', 0, 'for i = 1 to n', 'For each i from 1 to n,'),
    L('inner', 1, 'for j = 1 to i − 1', 'and for each j below i,'),
    L('body', 2, 'count = count + 1', 'do the work once and count it.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['outer', 'inner', 'body'],
  counted: ['body'],
  frame: (n) => square(n, pairsText(n)),
  *walk(n): Walk {
    let count = 0;
    for (let i = 1; i <= n; i++) {
      let ran = 0;
      for (let j = 1; j <= i - 1; j++) {
        count++;
        ran++;
        const c = count;
        yield {
          body: [0, i - 1, j - 1],
          say: () => `i = ${i}, j = ${j}: count = ${c}.`,
          lines: ['body'],
          level: 3,
          v: { i, j, count: c },
        };
      }
      const c = count;
      yield {
        row: { s: 0, r: i - 1 },
        say: () =>
          i === 1
            ? `i = 1: j would run from 1 to 0, so the inner loop does not run at all. count = ${c}.`
            : `i = ${i}: j ran from 1 to ${i - 1}, ${times(ran)}. count = ${c}.`,
        lines: ['inner', 'body'],
        level: 2,
        v: { i, count: c },
      };
    }
  },
  exact: (n) => (n * (n - 1)) / 2,
  formula: () => 'n(n−1)/2',
  plug: (n) => `${n}·${n - 1}/2`,
  why: () =>
    'Row i runs i − 1 times, so T(n) = 0 + 1 + … + (n − 1), which adds up to n(n−1)/2: one for each pair of different items.',
  expand: () => 'n²/2 − n/2',
  drop: () =>
    'n/2 grows more slowly than n²/2, so drop it; then drop the constant factor ½. Leaving out the diagonal does not change the order.',
  dropShort: () => 'drop n/2, then the ½',
  order: () => 'n²',
};

const sequence: Pattern = {
  id: 'sequence',
  label: 'Two loops, one after the other',
  name: 'the two loops',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('loop1', 0, 'for i = 1 to n', 'For each i from 1 to n,'),
    L('body1', 1, 'count = count + 1', 'do the work once and count it.'),
    L('loop2', 0, 'for j = 1 to n', 'Then, for each j from 1 to n,'),
    L('body2', 1, 'count = count + 1', 'do the work once more and count it.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['loop1', 'body1', 'loop2', 'body2'],
  counted: ['body1', 'body2'],
  frame: (n) => ({
    slices: 1,
    rows: 2,
    cols: n,
    rowNames: ['i', 'j'],
    colNames: range(n),
    corner: '',
    describe: `One row for each loop, with a cell for each value 1 to ${n}.`,
  }),
  *walk(n): Walk {
    let count = 0;
    for (let i = 1; i <= n; i++) {
      count++;
      const c = count;
      yield {
        body: [0, 0, i - 1],
        say: () => `First loop, i = ${i}: count = ${c}.`,
        lines: ['body1'],
        level: 3,
        v: { i, count: c },
      };
    }
    const first = count;
    yield {
      row: { s: 0, r: 0 },
      say: () => `The first loop ran ${times(n)}. count = ${first}.`,
      lines: ['loop1', 'body1'],
      level: 2,
      v: { count: first },
    };
    for (let j = 1; j <= n; j++) {
      count++;
      const c = count;
      yield {
        body: [0, 1, j - 1],
        say: () => `Second loop, j = ${j}: count = ${c}.`,
        lines: ['body2'],
        level: 3,
        v: { j, count: c },
      };
    }
    const c = count;
    yield {
      row: { s: 0, r: 1 },
      say: () =>
        `The second loop ran ${times(n)} more, after the first was done: ${n} + ${n} = ${c}. One loop after another adds.`,
      lines: ['loop2', 'body2'],
      level: 2,
      v: { count: c },
    };
  },
  exact: (n) => 2 * n,
  formula: () => '2n',
  plug: (n) => `${n} + ${n}`,
  why: () => 'The loops run one after the other, so their counts add: T(n) = n + n = 2n.',
  expand: () => null,
  drop: () => 'Drop the constant factor 2. Two loops in a row are still linear, not n².',
  dropShort: () => 'drop the factor 2',
  order: () => 'n',
};

const halving: Pattern = {
  id: 'halving',
  label: 'Halving: i = n, while i > 1, i = i / 2',
  name: 'the halving loop',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('start', 0, 'i = n', 'Start i at n.'),
    L('outer', 0, 'while i > 1', 'While i is more than 1,'),
    L('body', 1, 'count = count + 1', 'do the work once and count it,'),
    L('step', 1, 'i = ⌊i / 2⌋', 'then halve i, rounding down.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['start', 'outer', 'body', 'step'],
  counted: ['body'],
  frame: (n) =>
    row1(
      n,
      'i',
      '',
      `The row has a cell for each value i could take, 1 to ${n}; i starts at ${n}.`,
    ),
  *walk(n): Walk {
    let count = 0;
    let i = n;
    while (i > 1) {
      count++;
      const c = count;
      const now = i;
      const next = Math.floor(i / 2);
      yield {
        body: [0, 0, now - 1],
        say: () => `i = ${now} > 1: the body runs, count = ${c}. Then i = ⌊${now}/2⌋ = ${next}.`,
        lines: ['body', 'step'],
        level: 2,
        v: { i: now, count: c },
      };
      i = next;
    }
    yield {
      probe: [0, 0, i - 1],
      say: () =>
        n === 1
          ? 'i = 1, and 1 > 1 is false: the body never runs. count = 0.'
          : `i = 1, and 1 > 1 is false, so the loop stops after ${plural(count, 'pass', 'passes')}. Most cells were never visited.`,
      lines: ['outer'],
      level: 2,
      v: { i, count },
    };
  },
  exact: (n) => lg(n),
  formula: () => '⌊log₂ n⌋',
  plug: (n) => `⌊log₂ ${n}⌋`,
  why: () =>
    'Each pass halves i, and it takes ⌊log₂ n⌋ halvings to get from n down to 1: T(n) = ⌊log₂ n⌋.',
  expand: () => null,
  drop: () =>
    'The floor changes T(n) by less than 1, and the base of the log is only a constant factor, so neither matters.',
  dropShort: () => 'drop the floor and base',
  order: () => 'log n',
};

const sqrt: Pattern = {
  id: 'sqrt',
  label: 'Square root: i = 1, while i · i ≤ n, i = i + 1',
  name: 'the square-root loop',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('start', 0, 'i = 1', 'Start i at 1.'),
    L('outer', 0, 'while i · i ≤ n', 'While i squared is at most n,'),
    L('body', 1, 'count = count + 1', 'do the work once and count it,'),
    L('step', 1, 'i = i + 1', 'then move i up by one.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['start', 'outer', 'body', 'step'],
  counted: ['body'],
  frame: (n) => row1(n, 'i', '', `The row has a cell for each value i could take, 1 to ${n}.`),
  *walk(n): Walk {
    let count = 0;
    let i = 1;
    while (i * i <= n) {
      count++;
      const c = count;
      const now = i;
      yield {
        body: [0, 0, now - 1],
        say: () =>
          `i = ${now}: ${now}·${now} = ${now * now} ≤ ${n}, so the body runs. count = ${c}.`,
        lines: ['outer', 'body'],
        level: 2,
        v: { i: now, count: c },
      };
      i++;
    }
    const last = i;
    yield {
      probe: last <= n ? [0, 0, last - 1] : undefined,
      say: () =>
        `i = ${last}: ${last}·${last} = ${last * last} > ${n}, so the loop stops. i never gets past √${n} ≈ ${Math.sqrt(n).toFixed(2)}.`,
      lines: ['outer'],
      level: 2,
      v: { i: last, count },
    };
  },
  exact: (n) => isqrt(n),
  formula: () => '⌊√n⌋',
  plug: (n) => `⌊√${n}⌋`,
  why: () => 'The loop stops once i · i passes n, so i only gets to ⌊√n⌋: T(n) = ⌊√n⌋.',
  expand: () => null,
  drop: () => 'The floor changes T(n) by less than 1, so drop it.',
  dropShort: () => 'drop the floor',
  order: () => '√n',
};

const doubling: Pattern = {
  id: 'doubling',
  label: 'Inner loop doubles: for i = 1 to n, j = 1, 2, 4, …',
  name: 'the doubling inner loop',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('outer', 0, 'for i = 1 to n', 'For each i from 1 to n,'),
    L('start', 1, 'j = 1', 'start j at 1,'),
    L('inner', 1, 'while j ≤ n', 'and while j is at most n,'),
    L('body', 2, 'count = count + 1', 'do the work once and count it,'),
    L('step', 2, 'j = 2 · j', 'then double j.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['outer', 'start', 'inner', 'body', 'step'],
  counted: ['body'],
  frame: (n) => square(n, pairsText(n)),
  *walk(n): Walk {
    let count = 0;
    for (let i = 1; i <= n; i++) {
      const seen: number[] = [];
      let j = 1;
      while (j <= n) {
        count++;
        seen.push(j);
        const c = count;
        const now = j;
        yield {
          body: [0, i - 1, now - 1],
          say: () => `i = ${i}, j = ${now}: count = ${c}. Then j doubles to ${2 * now}.`,
          lines: ['body', 'step'],
          level: 3,
          v: { i, j: now, count: c },
        };
        j *= 2;
      }
      const c = count;
      const end = j;
      yield {
        row: { s: 0, r: i - 1 },
        say: () =>
          `i = ${i}: j took the values ${seen.join(', ')}, so the body ran ${times(seen.length)}; j = ${end} > ${n} ended the row. count = ${c}.`,
        lines: ['inner', 'body'],
        level: 2,
        v: { i, count: c },
      };
    }
  },
  exact: (n) => n * (lg(n) + 1),
  formula: () => 'n(⌊log₂ n⌋ + 1)',
  plug: (n) => `${n}·(${lg(n)} + 1)`,
  why: () =>
    'For every i, j takes the values 1, 2, 4, … up to n: ⌊log₂ n⌋ + 1 of them. There are n values of i, so T(n) = n(⌊log₂ n⌋ + 1).',
  expand: () => 'n⌊log₂ n⌋ + n',
  drop: () =>
    'n grows more slowly than n log n, so drop it; the floor and the base of the log do not matter either. Two loops, but not n²: the inner one only takes log n steps.',
  dropShort: () => 'drop n, the floor, the base',
  order: () => 'n log n',
};

const geometric: Pattern = {
  id: 'geometric',
  label: 'Outer loop doubles: i = 1, 2, 4, …, for j = 1 to i',
  name: 'the doubling outer loop',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('start', 0, 'i = 1', 'Start i at 1.'),
    L('outer', 0, 'while i ≤ n', 'While i is at most n,'),
    L('inner', 1, 'for j = 1 to i', 'for each j from 1 to i,'),
    L('body', 2, 'count = count + 1', 'do the work once and count it;'),
    L('step', 1, 'i = 2 · i', 'then double i.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['start', 'outer', 'inner', 'body', 'step'],
  counted: ['body'],
  frame: (n) => {
    const rows = lg(n) + 1;
    return {
      slices: 1,
      rows,
      cols: n,
      rowNames: Array.from({ length: rows }, (_, r) => String(2 ** r)),
      colNames: range(n),
      corner: 'i\\j',
      describe: `One row for each value of i (1, 2, 4, …), with a cell for each j from 1 to ${n}.`,
    };
  },
  *walk(n): Walk {
    let count = 0;
    let i = 1;
    let r = 0;
    while (i <= n) {
      let ran = 0;
      for (let j = 1; j <= i; j++) {
        count++;
        ran++;
        const c = count;
        const now = i;
        yield {
          body: [0, r, j - 1],
          say: () => `i = ${now}, j = ${j}: count = ${c}.`,
          lines: ['body'],
          level: 3,
          v: { i: now, j, count: c },
        };
      }
      const c = count;
      const now = i;
      const next = 2 * i;
      yield {
        row: { s: 0, r },
        say: () =>
          `i = ${now}: j ran from 1 to ${now}, ${times(ran)}. count = ${c}. Then i doubles to ${next}${next > n ? `, which is past ${n}, so the loop stops` : ''}.`,
        lines: ['inner', 'body', 'step'],
        level: 2,
        v: { i: now, count: c },
      };
      i = next;
      r++;
    }
  },
  exact: (n) => 2 ** (lg(n) + 1) - 1,
  formula: () => '2ᵏ⁺¹ − 1',
  where: 'k = ⌊log₂ n⌋',
  plug: (n) => `2${sup(lg(n) + 1)} − 1`,
  why: () =>
    'The rows hold 1, 2, 4, … , 2ᵏ cells, where 2ᵏ is the largest power of 2 up to n. Each row is one more than all the rows before it, so T(n) = 2ᵏ⁺¹ − 1.',
  expand: () => '< 2n',
  drop: () =>
    'Since 2ᵏ ≤ n, T(n) is less than 2n: drop the factor 2. Two nested loops, and still only linear, because the last row does half the work.',
  dropShort: () => 'below 2n: drop the 2',
  order: () => 'n',
};

const search: Pattern = {
  id: 'search',
  label: 'Early exit: look for x in A',
  name: 'the search with an early exit',
  maxN: 16,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('outer', 0, 'for i = 1 to n', 'For each position i from 1 to n,'),
    L('body', 1, 'count = count + 1', 'count one comparison,'),
    L('test', 1, 'if A[i] == x', 'and if the item there is x,'),
    L('found', 2, 'return count', 'stop at once.'),
    L('ret', 0, 'return count', 'x is not there: report the comparisons.'),
  ],
  card: ['outer', 'body', 'test', 'found'],
  counted: ['body'],
  frame: (n) => ({
    ...row1(n, 'i', 'A', ''),
    values: VALUES.slice(0, n).map(String),
    describe: `The row is the array A, ${n} items long; the loop looks for x.`,
  }),
  *walk(n, found): Walk {
    const x = targetValue(n, found);
    let count = 0;
    for (let i = 1; i <= n; i++) {
      count++;
      const c = count;
      const a = VALUES[i - 1]!;
      if (a === x) {
        yield {
          body: [0, 0, i - 1],
          found: [0, 0, i - 1],
          say: () =>
            `i = ${i}: count = ${c}. A[${i}] = ${a} is x, so return at once.${i < n ? ` The loop never looks at the ${plural(n - i, 'item')} after it.` : ''}`,
          lines: ['body', 'test', 'found'],
          level: 2,
          v: { x, i, count: c },
        };
        return;
      }
      yield {
        body: [0, 0, i - 1],
        say: () => `i = ${i}: count = ${c}. A[${i}] = ${a} is not x = ${x}.`,
        lines: ['body', 'test'],
        level: 2,
        v: { x, i, count: c },
      };
    }
    yield {
      say: () =>
        `i = ${n + 1} is past n: x = ${x} is not in A. Every item was compared, so count = ${count}.`,
      lines: ['outer'],
      level: 2,
      v: { x, i: n + 1, count },
    };
  },
  exact: (n, found) => (found === 'first' ? 1 : found === 'middle' ? Math.ceil(n / 2) : n),
  formula: (found) => (found === 'first' ? '1' : found === 'middle' ? '⌈n/2⌉' : 'n'),
  plug: (n, found) => (found === 'first' ? '1' : found === 'middle' ? `⌈${n}/2⌉` : String(n)),
  why: (found) =>
    found === 'first'
      ? 'x is the first item, so the loop stops after one comparison, however long A is: T(n) = 1. That is the best case.'
      : found === 'middle'
        ? 'x is in the middle, so the loop stops halfway: T(n) = ⌈n/2⌉. On average, over every place x could be, it is about n/2 too.'
        : 'x is not in A, so the loop compares every item before it gives up: T(n) = n. That is the worst case.',
  expand: () => null,
  drop: (found) =>
    found === 'first'
      ? 'T(n) = 1 does not grow with n: O(1). But that is only the best case: when x is missing, the same loop takes n comparisons, O(n).'
      : found === 'middle'
        ? 'Drop the factor ½ (the ceiling only adds less than 1). Stopping halfway is still linear.'
        : 'T(n) = n has nothing to drop. An early exit does not help the worst case.',
  dropShort: (found) =>
    found === 'first' ? 'best case only' : found === 'middle' ? 'drop the ½' : 'nothing to drop',
  order: (found) => (found === 'first' ? '1' : 'n'),
};

const triple: Pattern = {
  id: 'triple',
  label: 'Three nested loops: i ≤ j ≤ k',
  name: 'the triple loop',
  maxN: 6,
  lines: [
    L('init', 0, 'count = 0', 'Start the count at 0.'),
    L('outer', 0, 'for i = 1 to n', 'For each i from 1 to n,'),
    L('mid', 1, 'for j = i to n', 'each j from i up to n,'),
    L('inner', 2, 'for k = j to n', 'and each k from j up to n,'),
    L('body', 3, 'count = count + 1', 'do the work once and count it.'),
    L('ret', 0, 'return count', 'Report how many times the work ran.'),
  ],
  card: ['outer', 'mid', 'inner', 'body'],
  counted: ['body'],
  frame: (n) => ({
    slices: n,
    rows: n,
    cols: n,
    rowNames: range(n),
    colNames: range(n),
    corner: 'j\\k',
    sliceNames: Array.from({ length: n }, (_, s) => `i = ${s + 1}`),
    describe: `One small grid for each i, with a cell for every pair (j, k) from 1 to ${n}.`,
  }),
  *walk(n): Walk {
    let count = 0;
    for (let i = 1; i <= n; i++) {
      let ran = 0;
      for (let j = i; j <= n; j++) {
        for (let k = j; k <= n; k++) {
          count++;
          ran++;
          const c = count;
          yield {
            body: [i - 1, j - 1, k - 1],
            say: () => `i = ${i}, j = ${j}, k = ${k}: count = ${c}.`,
            lines: ['body'],
            level: 3,
            v: { i, j, k, count: c },
          };
        }
      }
      const c = count;
      yield {
        row: { s: i - 1, r: null },
        say: () =>
          `i = ${i}: j ran from ${i} to ${n} and k from j to ${n}, ${times(ran)} in all: a triangle that shrinks as i grows. count = ${c}.`,
        lines: ['mid', 'inner', 'body'],
        level: 2,
        v: { i, count: c },
      };
    }
  },
  exact: (n) => (n * (n + 1) * (n + 2)) / 6,
  formula: () => 'n(n+1)(n+2)/6',
  plug: (n) => `${n}·${n + 1}·${n + 2}/6`,
  why: () =>
    'Each lit cell is a choice of i ≤ j ≤ k from 1 to n, and there are n(n+1)(n+2)/6 of those: the slices are triangles, each smaller than the one before.',
  expand: () => 'n³/6 + n²/2 + n/3',
  drop: () =>
    'n³/6 grows fastest, so keep it, drop n²/2 and n/3, and then drop the constant factor 1/6.',
  dropShort: () => 'keep n³/6, drop the 1/6',
  order: () => 'n³',
};

export const PATTERN: Record<PatternId, Pattern> = {
  single,
  nested,
  triangle,
  pairs,
  sequence,
  halving,
  sqrt,
  doubling,
  geometric,
  search,
  triple,
};

/** T(n) as a formula, with its definition when it has one: "2ᵏ⁺¹ − 1, k = ⌊log₂ n⌋". */
export const formulaText = (p: Pattern, found: Found) =>
  p.where ? `${p.formula(found)}, ${p.where}` : p.formula(found);

/** Run the loops without drawing and count the counted line. */
export function countRun(p: Pattern, n: number, found: Found): number {
  let count = 0;
  for (const ev of p.walk(n, found)) if (ev.body) count++;
  return count;
}
