/**
 * Cyclic sort: A holds n numbers from 1 to n, maybe with repeats. Each value v has a home, the
 * index v − 1, so put every value home by swaps; then one scan finds what is missing and what is
 * repeated: a slot i that does not hold i + 1 means i + 1 is missing and its value is a repeat.
 *
 * - The pattern: i walks from 0. If A[i] is not home and its home holds something else, swap
 *   A[i] home. That value never moves again, so there are at most n − 1 swaps. If A[i] is home,
 *   or its home already holds the same value (a repeat), move i on. n + swaps comparisons, then a
 *   scan of n more. O(n) time, O(1) extra space.
 * - The naive approach sorts first: selection sort (/selection-sort/), which also puts one value
 *   in its final place per swap but has to search for it, n(n − 1)/2 comparisons. Then a scan
 *   with the next value expected: a value below it is a repeat, a value above it skips the
 *   numbers in between, which are missing. (A sorted array cannot be scanned by index: with a
 *   repeat, everything after it is one slot off.)
 *
 * Both report the same missing numbers and the same repeats (sorted, in vars). Work, in the units
 * of src/viz/_patterns/kit.ts: a comparison compares two values, or a value with the number a
 * slot should hold; a swap exchanges two different slots (selection sort's swap of a slot with
 * itself moves nothing and is not counted).
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
import type { BarsPointer } from '../../layouts/bars';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import {
  listFromArg,
  makeState,
  mark,
  plural,
  vid,
  type ArrayState,
  type Draw,
} from '../_sorting/kit';

/** The array the page starts with: 1 to 8, with 4 twice and 5 missing. */
export const START = [6, 4, 1, 8, 4, 2, 7, 3];
export const MAX_N = 12;

export interface CyclicSettings {
  [key: string]: Scalar;
  approach: Approach;
  draw: Draw;
}

export const defaults: CyclicSettings = { approach: 'pattern', draw: 'bars' };

export interface CyclicExtra {
  /** What the drawing says above the array: the phase. */
  heading: string;
  pointers: BarsPointer[];
  /** What the scan has found so far, drawn under the array; null before the scan starts. */
  found: { missing: number[]; repeated: number[] } | null;
}

export type CyclicStep = Step<ArrayState, CyclicExtra>;
type Op = OpSpec<ArrayState, CyclicSettings, CyclicExtra>;
type Gen = Generator<CyclicStep, ArrayState, void>;

export const UNITS = ['comparisons', 'swaps'] as const;

export const init = (): ArrayState => makeState(START);

const at = (i: number, v: number) => `A[${i}] = ${v}`;

/** "a", "a and b", "a, b and c". */
export const and = (xs: (string | number)[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** A list for vars and headings: "5", "2 6", or "none". */
export const listText = (xs: number[]) => (xs.length ? xs.join(' ') : 'none');

// ----- Input -----

/** An operation's list of values, each from 1 to n, or why it cannot be read. */
export function readValues(arg: Value | undefined): number[] | string {
  const vs = listFromArg(arg);
  if (typeof vs === 'string') return vs;
  if (vs.length < 2) return 'Type at least two values, such as 2 1.';
  if (vs.length > MAX_N)
    return `That is ${vs.length} values. Use at most ${MAX_N}, so every value stays readable.`;
  const n = vs.length;
  const bad = vs.find((v) => v < 1 || v > n);
  if (bad !== undefined)
    return `${bad} is out of range: with ${plural(n, 'value')}, use whole numbers from 1 to ${n}.`;
  return vs;
}

// ----- The answer and the cost, computed first -----

/** Cyclic sort on plain numbers: the sorted values and the work. */
export function cyclicValues(vs: readonly number[]): {
  a: number[];
  swaps: number;
  comparisons: number;
} {
  const a = [...vs];
  let swaps = 0;
  let comparisons = 0;
  let i = 0;
  while (i < a.length) {
    const j = a[i]! - 1;
    comparisons++;
    if (a[i] !== a[j]) {
      [a[i], a[j]] = [a[j]!, a[i]!];
      swaps++;
    } else i++;
  }
  return { a, swaps, comparisons };
}

/** Selection sort's swaps of two different slots on these values. */
export function selectionSwaps(vs: readonly number[]): number {
  const a = [...vs];
  let swaps = 0;
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < a.length; j++) if (a[j]! < a[min]!) min = j;
    if (min !== i) {
      [a[i], a[min]] = [a[min]!, a[i]!];
      swaps++;
    }
  }
  return swaps;
}

/** The missing numbers and the repeats (one entry per extra copy), both ascending. */
export function findings(vs: readonly number[]): { missing: number[]; repeated: number[] } {
  const n = vs.length;
  const seen = Array(n + 1).fill(0);
  for (const v of vs) seen[v]++;
  const missing: number[] = [];
  const repeated: number[] = [];
  for (let v = 1; v <= n; v++) {
    if (seen[v] === 0) missing.push(v);
    for (let k = 1; k < seen[v]; k++) repeated.push(v);
  }
  return { missing, repeated };
}

export function totals(vs: readonly number[]): Totals {
  const n = vs.length;
  const c = cyclicValues(vs);
  return {
    naive: (n * (n - 1)) / 2 + n + selectionSwaps(vs),
    pattern: c.comparisons + n + c.swaps,
  };
}

// ----- Steps -----

function refuse(s: ArrayState, why: string): CyclicStep {
  return {
    state: s,
    marks: [mark('row-a', 'error')],
    say: why,
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
      yield refuse(s, `Nothing loaded. ${vs} The array stays as it was.`);
      return s;
    }
    const next = makeState(vs, s.nextUid);
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(vs.length, 'value')} into A: ${vs.join(', ')}. Press Sort, then scan.`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
    };
    return next;
  },
};

/** Marks for the values already home (A[k] = k + 1), except those in `skip`. */
function homes(a: ArrayState['a'], skip: Set<number> = new Set()): Mark[] {
  return a.flatMap((x, k) => (x.value === k + 1 && !skip.has(k) ? [mark(vid(x), 'done')] : []));
}

/** The pattern: swap each value home, then scan by index. */
function* cyclic(s: ArrayState): Gen {
  const a = [...s.a];
  const n = a.length;
  const vs = a.map((x) => x.value);
  const tot = totals(vs);
  const work = new Work(UNITS);
  const state = (): ArrayState => ({ a: [...a], nextUid: s.nextUid });
  let i = 0;
  let j = a[0]!.value - 1;
  const heading = 'cyclic sort: v goes to A[v − 1]';
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    n,
    i,
    ...more,
    ...workVars(work, tot),
  });
  const ptrs = (withJ = true): BarsPointer[] => [
    { name: 'i', at: i, role: 'active' },
    ...(withJ && j !== i ? [{ name: 'home', at: j }] : []),
  ];

  yield {
    state: state(),
    marks: homes(a),
    say: `Every value v from 1 to ${n} has a home, the slot A[v − 1]. Walk i from 0: while A[i] is not home, swap it there.`,
    lines: ['init'],
    level: 2,
    vars: vars({ j }),
    extra: { heading, pointers: ptrs(), found: null },
  };

  while (i < n) {
    const v = a[i]!.value;
    j = v - 1;
    work.add('comparisons');
    if (a[i]!.value !== a[j]!.value) {
      const w = a[j]!.value;
      [a[i], a[j]] = [a[j]!, a[i]!];
      work.add('swaps');
      yield {
        state: state(),
        marks: [
          mark(vid(a[j]!), 'found'),
          mark(vid(a[i]!), 'active'),
          ...homes(a, new Set([i, j])),
        ],
        say: `${at(i, v)} belongs at A[${j}], which holds ${w}: swap them. ${v} is home for good. Now ${at(i, w)}, so look at it next.`,
        lines: ['loop', 'home', 'check', 'swap'],
        level: 2,
        vars: vars({ j }),
        extra: { heading, pointers: ptrs(), found: null },
      };
    } else {
      const same = i === j;
      i++;
      yield {
        state: state(),
        marks: [
          mark(vid(a[i - 1]!), same ? 'done' : 'compare'),
          ...(same ? [] : [mark(vid(a[j]!), 'done')]),
          ...homes(a, new Set([i - 1, j])),
        ],
        say: same
          ? `${at(i - 1, v)} is home. i = ${i}.`
          : `${at(i - 1, v)} belongs at A[${j}], which already holds a ${v}: this one is a repeat, and has no home of its own. Leave it. i = ${i}.`,
        lines: ['loop', 'home', 'check', 'next'],
        level: 2,
        vars: vars({ j }),
        extra: { heading, pointers: i < n ? ptrs(false) : [], found: null },
      };
    }
  }

  return yield* scanByIndex(a, state, work, tot, work.tally());
}

/** After cyclic sort: every slot that does not hold i + 1 means i + 1 is missing. */
function* scanByIndex(
  a: ArrayState['a'],
  state: () => ArrayState,
  work: Work,
  tot: Totals,
  sortWork: string,
): Gen {
  const n = a.length;
  const missing: number[] = [];
  const repeated: number[] = [];
  const heading = 'scan: is A[i] = i + 1?';
  const found = () => ({ missing: [...missing], repeated: [...repeated].sort((x, y) => x - y) });
  const vars = (i: number): Record<string, Scalar> => ({
    n,
    i,
    missing: listText(missing),
    repeated: listText([...repeated].sort((x, y) => x - y)),
    ...workVars(work, tot),
  });
  const out = new Set<number>();
  yield {
    state: state(),
    marks: homes(a),
    say: `Every value is placed: A = ${a.map((x) => x.value).join(', ')}, after ${sortWork}. Each value that is present sits at home, and the repeats fill the slots that are left. Now scan: a slot A[i] that does not hold i + 1 means i + 1 is missing, and what it holds is a repeat.`,
    lines: ['scan'],
    level: 2,
    vars: vars(0),
    extra: { heading, pointers: [], found: found() },
  };
  for (let i = 0; i < n; i++) {
    const v = a[i]!.value;
    work.add('comparisons');
    const home = v === i + 1;
    if (!home) {
      missing.push(i + 1);
      repeated.push(v);
      out.add(i);
    }
    yield {
      state: state(),
      marks: [
        mark(vid(a[i]!), home ? 'done' : 'found'),
        ...homes(a, new Set([i])),
        ...[...out].filter((k) => k !== i).map((k) => mark(vid(a[k]!), 'compare')),
      ],
      say: home
        ? `${at(i, v)}: home.`
        : `${at(i, v)}, not ${i + 1}: ${i + 1} is missing, and this ${v} is a repeat.`,
      lines: ['scanLoop', 'scanCheck', ...(home ? [] : ['report'])],
      level: 2,
      vars: vars(i),
      extra: { heading, pointers: [{ name: 'i', at: i, role: 'active' }], found: found() },
    };
  }
  const end = state();
  yield final(
    end,
    work,
    tot,
    'cyclic',
    heading,
    vars(n - 1),
    end.a.map((x, k) => mark(vid(x), x.value === k + 1 ? 'done' : 'compare')),
  );
  return end;
}

function final(
  s: ArrayState,
  work: Work,
  tot: Totals,
  how: 'cyclic' | 'selection',
  heading: string,
  vars: Record<string, Scalar>,
  marks: Mark[],
): CyclicStep {
  const { missing, repeated } = findings(s.a.map((x) => x.value));
  const found = missing.length
    ? `Missing: ${and(missing)}. Repeated: ${and(repeated)}.`
    : `Nothing is missing: A holds 1 to ${s.a.length} once each.`;
  const other =
    how === 'cyclic'
      ? `selection sort and a scan would take ${tot.naive}`
      : `cyclic sort and a scan take ${tot.pattern}`;
  return {
    state: s,
    marks,
    say: `${found} That took ${work.tally()}, ${work.total} in all; ${other}.`,
    lines: ['ret'],
    level: 1,
    vars: { ...vars, missing: listText(missing), repeated: listText(repeated) },
    extra: { heading, pointers: [], found: { missing, repeated } },
  };
}

/** The naive approach: selection sort, then a scan for the next value expected. */
function* selection(s: ArrayState): Gen {
  const a = [...s.a];
  const n = a.length;
  const tot = totals(a.map((x) => x.value));
  const work = new Work(UNITS);
  const state = (): ArrayState => ({ a: [...a], nextUid: s.nextUid });
  const heading = 'selection sort first';
  const placed = new Set<number>();
  const doneMarks = (skip: Set<number> = new Set()) =>
    [...placed].filter((k) => !skip.has(k)).map((k) => mark(vid(a[k]!), 'done'));
  const vars = (more: Record<string, Scalar>): Record<string, Scalar> => ({
    n,
    ...more,
    ...workVars(work, tot),
  });

  yield {
    state: state(),
    marks: [],
    say: `Sort A first, with selection sort: for each slot i, find the smallest value from A[i] on and swap it into A[i]. Then scan the sorted values.`,
    lines: ['init'],
    level: 2,
    vars: vars({ i: 0 }),
    extra: { heading, pointers: [], found: null },
  };

  for (let i = 0; i < n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < n; j++) {
      work.add('comparisons');
      const smaller = a[j]!.value < a[min]!.value;
      const was = min;
      if (smaller) min = j;
      const roles: Mark[] = [
        mark(vid(a[j]!), smaller ? 'found' : 'compare'),
        ...(smaller ? [] : [mark(vid(a[min]!), 'found')]),
      ];
      yield {
        state: state(),
        marks: [...roles, ...doneMarks()],
        say: smaller
          ? `${at(j, a[j]!.value)} < A[min] = ${a[was]!.value}: min = ${j}.`
          : `${at(j, a[j]!.value)} is not smaller than A[min] = ${a[min]!.value}.`,
        lines: smaller ? ['outer', 'inner', 'cmp', 'update'] : ['outer', 'inner', 'cmp'],
        level: 2,
        vars: vars({ i, j, min }),
        extra: {
          heading,
          pointers: [
            { name: 'i', at: i },
            { name: 'j', at: j, role: 'compare' },
            { name: 'min', at: min, role: 'found' },
          ],
          found: null,
        },
      };
    }
    const self = min === i;
    if (!self) {
      [a[i], a[min]] = [a[min]!, a[i]!];
      work.add('swaps');
    }
    placed.add(i);
    if (i === n - 2) placed.add(n - 1);
    yield {
      state: state(),
      marks: [
        ...(self ? [] : [mark(vid(a[i]!), 'active'), mark(vid(a[min]!), 'active')]),
        ...doneMarks(self ? new Set() : new Set([i, min])),
      ],
      say: self
        ? `A[${i}] = ${a[i]!.value} is already the smallest from A[${i}] on: no swap. It is in its final place.`
        : `Swap A[${i}] and A[${min}]: ${a[i]!.value} is in its final place, after ${plural(n - 1 - i, 'comparison')} to find it.`,
      lines: ['swap'],
      level: 2,
      vars: vars({ i, min }),
      extra: { heading, pointers: [{ name: 'i', at: i, role: 'active' }], found: null },
    };
  }

  // The scan: the next value expected.
  const sortWork = work.tally();
  const missing: number[] = [];
  const repeated: number[] = [];
  let next = 1;
  const scanHeading = 'scan: what comes next?';
  const found = () => ({ missing: [...missing], repeated: [...repeated] });
  const scanVars = (i: number) =>
    vars({ i, next, missing: listText(missing), repeated: listText(repeated) });
  yield {
    state: state(),
    marks: [],
    say: `Sorted: ${a.map((x) => x.value).join(', ')}, after ${sortWork}. Now scan with next, the value expected next, starting at 1. In a sorted array a repeat can push the values after it off their slots, so scan by value, not by index.`,
    lines: ['scan'],
    level: 2,
    vars: scanVars(0),
    extra: { heading: scanHeading, pointers: [], found: found() },
  };
  for (let i = 0; i < n; i++) {
    const v = a[i]!.value;
    work.add('comparisons');
    let say: string;
    let role: MarkRole;
    let lines: string[];
    if (v < next) {
      repeated.push(v);
      say = `${at(i, v)}, but next is ${next}: ${v} was seen already, so it is a repeat.`;
      role = 'compare';
      lines = ['scanLoop', 'scanCheck', 'repeat'];
    } else {
      const gap = Array.from({ length: v - next }, (_, k) => next + k);
      missing.push(...gap);
      say = gap.length
        ? `${at(i, v)}, but next is ${next}: ${and(gap)} ${gap.length === 1 ? 'is' : 'are'} missing. next = ${v + 1}.`
        : `${at(i, v)}, as expected. next = ${v + 1}.`;
      role = gap.length ? 'found' : 'done';
      lines = gap.length
        ? ['scanLoop', 'scanCheck', 'gap', 'advance']
        : ['scanLoop', 'scanCheck', 'advance'];
      next = v + 1;
    }
    yield {
      state: state(),
      marks: [mark(vid(a[i]!), role)],
      say,
      lines,
      level: 2,
      vars: scanVars(i),
      extra: {
        heading: scanHeading,
        pointers: [{ name: 'i', at: i, role: 'active' }],
        found: found(),
      },
    };
  }
  if (next <= n) {
    const gap = Array.from({ length: n + 1 - next }, (_, k) => next + k);
    missing.push(...gap);
    yield {
      state: state(),
      marks: [],
      say: `The values ran out at next = ${next}: ${and(gap)} ${gap.length === 1 ? 'is' : 'are'} missing.`,
      lines: ['tail'],
      level: 2,
      vars: scanVars(n - 1),
      extra: { heading: scanHeading, pointers: [], found: found() },
    };
  }
  const end = state();
  yield final(
    end,
    work,
    tot,
    'selection',
    scanHeading,
    scanVars(n - 1),
    end.a.map((x) => mark(vid(x), 'done')),
  );
  return state();
}

const sort: Op = {
  label: 'Sort, then scan',
  arity: 0,
  *run(s, _args, { settings }) {
    return approachOf(settings) === 'naive' ? yield* selection(s) : yield* cyclic(s);
  },
};

export const ops: Record<string, Op> = { sort, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CyclicSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'sort',
        lines: [
          L(
            'sig',
            0,
            'sortThenScan(A)',
            'To find what is missing from 1..n and what is repeated, sort first:',
          ),
          L('init', 1, 'missing = []; repeated = []', 'Nothing found yet.'),
          L('outer', 1, 'for i = 0 to n − 2', 'For each slot i (selection sort),'),
          L('inner', 2, 'min = i; for j = i + 1 to n − 1', 'look at every value after it:'),
          L('cmp', 3, 'if A[j] < A[min]', 'if it is smaller than the smallest so far,'),
          L('update', 4, 'min = j', 'remember where it is.'),
          L('swap', 2, 'swap A[i] and A[min]', 'Put the smallest in its final place.'),
          L('scan', 1, 'next = 1', 'Then scan, expecting 1 first:'),
          L('scanLoop', 1, 'for i = 0 to n − 1', 'for each value in order,'),
          L('scanCheck', 2, 'if A[i] < next', 'if it is below the value expected,'),
          L('repeat', 3, 'repeated.add(A[i])', 'it was seen already: a repeat;'),
          L(
            'gap',
            2,
            'else missing.add(next .. A[i] − 1)',
            'otherwise every number it skipped is missing,',
          ),
          L('advance', 3, 'next = A[i] + 1', 'and the value after it is expected next.'),
          L(
            'tail',
            1,
            'missing.add(next .. n)',
            'Whatever is still expected at the end is missing too.',
          ),
          L('ret', 1, 'return (missing, repeated)', 'Hand back both lists.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'sort',
      lines: [
        L(
          'sig',
          0,
          'cyclicSort(A)',
          'To find what is missing from 1..n and what is repeated, put each value home first:',
        ),
        L('init', 1, 'i = 0', 'Start at the first slot.'),
        L('loop', 1, 'while i < n', 'While there are slots left,'),
        L('home', 2, 'j = A[i] − 1', 'find the home of the value in A[i]:'),
        L('check', 2, 'if A[i] ≠ A[j]', 'if its home holds something else,'),
        L(
          'swap',
          3,
          'swap A[i] and A[j]',
          'swap it home; it stays there for good, and A[i] has a new value to place;',
        ),
        L(
          'next',
          2,
          'else i = i + 1',
          'otherwise it is home, or a repeat whose home is taken: move on.',
        ),
        L('scan', 1, 'missing = []; repeated = []', 'Then scan:'),
        L('scanLoop', 1, 'for i = 0 to n − 1', 'for each slot,'),
        L('scanCheck', 2, 'if A[i] ≠ i + 1', 'if it does not hold its own number,'),
        L(
          'report',
          3,
          'missing.add(i + 1); repeated.add(A[i])',
          'that number is missing, and the value there is a repeat.',
        ),
        L('ret', 1, 'return (missing, repeated)', 'Hand back both lists.'),
      ],
    },
  ];
}

// ----- Start -----

export function initialSay(s: ArrayState): string {
  return `A holds ${plural(s.a.length, 'value')}, each from 1 to ${s.a.length}: ${s.a.map((x) => x.value).join(', ')}. One is repeated, so one is missing. Press Sort, then scan to find both. Load your own: n values, each from 1 to n.`;
}

export const initialVars = (s: ArrayState) => ({ n: s.a.length });
