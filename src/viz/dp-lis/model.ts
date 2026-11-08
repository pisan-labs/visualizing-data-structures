import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { andList, cellId, mark, plural } from '../_dp/kit';

export const MAX_N = 12;
export const MAX_VALUE = 99;

export interface LisState {
  a: number[];
  /** L[i]: the length of the longest increasing subsequence that ends at a[i]. */
  L: (number | null)[];
  /** P[i]: the index before i in that subsequence, or -1 when a[i] starts it. */
  P: (number | null)[];
  /** The tails method: tails[k] is the index of the smallest value ending an increasing run of length k + 1. */
  tails: number[];
}

export interface LisSettings {
  [key: string]: Scalar;
  method: 'quadratic' | 'tails';
}

export interface LisExtra {
  /** The cell being filled and the earlier cell compared with it (O(n²)). */
  at?: number;
  from?: number;
  /** The best predecessor so far for `at`. */
  best?: number;
  /** Binary search over tails: the range [lo, hi) and the probe. */
  lo?: number;
  hi?: number;
  mid?: number;
  /** Where a[at] lands in tails, and whether it replaced a value. */
  place?: number;
  /** The walk back: indices found so far, last first. */
  found?: number[];
}

type S = LisState;
type X = LisExtra;
type Op = OpSpec<S, LisSettings, X>;
type LisStep = Step<S, X>;
type Gen = Generator<LisStep, S, void>;

export const defaults: LisSettings = { method: 'quadratic' };

export const START_A = [5, 2, 8, 6, 3, 6, 9, 7];

export function stateFor(a: number[]): S {
  return { a, L: a.map(() => null), P: a.map(() => null), tails: [] };
}

export const init = (): S => stateFor(START_A);

/** Rows: 0 is a, 1 is L, 2 is P. Columns are 0-based indices; headers show them from 1. */
export const aId = (i: number) => cellId(0, i);
export const lenId = (i: number) => cellId(1, i);
export const prevId = (i: number) => cellId(2, i);
export const tailId = (k: number) => `tails-${k}`;
export const lisId = (k: number) => `lis-${k}`;

export function valuesFromArg(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const how = `Type the sequence, such as 5 2 8 6 3 6 9 7: whole numbers from 0 to ${MAX_VALUE}.`;
  if (tokens.length === 0) return how;
  if (tokens.length > MAX_N) return `That is ${tokens.length} numbers. Use at most ${MAX_N}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `"${t}" is not a whole number. ${how}`;
    const v = Number(t);
    if (v > MAX_VALUE) return `${v} is too large. ${how}`;
    out.push(v);
  }
  return out;
}

export const isFull = (s: S) => s.L.every((v) => v !== null);

/** Where the walk back starts: the first index with the largest L (O(n²)), or the last tail. */
export function endOf(s: S, method: LisSettings['method']): number {
  if (method === 'tails' && s.tails.length) return s.tails[s.tails.length - 1]!;
  let best = 0;
  s.L.forEach((v, i) => {
    if (v! > s.L[best]!) best = i;
  });
  return best;
}

function* quadratic(start: S): Gen {
  const { a } = start;
  const n = a.length;
  const L: (number | null)[] = a.map(() => null);
  const P: (number | null)[] = a.map(() => null);
  const state = (): S => ({ a, L: [...L], P: [...P], tails: [] });
  let comparisons = 0;
  for (let i = 0; i < n; i++) {
    L[i] = 1;
    P[i] = -1;
    yield {
      state: state(),
      marks: [mark(lenId(i), 'active'), mark(aId(i), 'active')],
      say:
        i === 0
          ? `L[1] = 1: a[1] = ${a[0]} on its own is an increasing subsequence of length 1.`
          : `L[${i + 1}] starts at 1: a[${i + 1}] = ${a[i]} on its own. Now look at every earlier value.`,
      lines: ['q.outer', 'q.init'],
      vars: { n, i: i + 1, comparisons },
      level: i === 0 ? 2 : 3,
      extra: { at: i },
    };
    let best = -1;
    for (let j = 0; j < i; j++) {
      comparisons++;
      const smaller = a[j]! < a[i]!;
      const longer = smaller && L[j]! + 1 > L[i]!;
      if (longer) {
        L[i] = L[j]! + 1;
        P[i] = j;
        best = j;
      }
      yield {
        state: state(),
        marks: [
          mark(lenId(i), 'active'),
          mark(aId(i), 'active'),
          mark(aId(j), 'compare'),
          mark(lenId(j), 'compare'),
        ],
        say: !smaller
          ? `a[${j + 1}] = ${a[j]} is not less than ${a[i]}, so a[${i + 1}] cannot follow it.`
          : longer
            ? `a[${j + 1}] = ${a[j]} < ${a[i]}, and L[${j + 1}] + 1 = ${L[j]! + 1} is longer: L[${i + 1}] = ${L[i]}, P[${i + 1}] = ${j + 1}.`
            : `a[${j + 1}] = ${a[j]} < ${a[i]}, but L[${j + 1}] + 1 = ${L[j]! + 1} is no longer than ${L[i]}.`,
        lines: longer ? ['q.inner', 'q.if', 'q.set'] : ['q.inner', 'q.if'],
        vars: { n, i: i + 1, j: j + 1, comparisons },
        level: 3,
        extra: { at: i, from: j, best: best >= 0 ? best : undefined },
      };
    }
    if (i > 0)
      yield {
        state: state(),
        marks: [mark(lenId(i), 'new'), mark(prevId(i), 'new')],
        say:
          best < 0
            ? `L[${i + 1}] = 1: no earlier value is smaller than ${a[i]}, so a run through it starts there.`
            : `L[${i + 1}] = ${L[i]}: the longest increasing run ending at ${a[i]} comes through a[${best + 1}] = ${a[best]}.`,
        lines: ['q.outer'],
        vars: { n, i: i + 1, comparisons },
        level: i === n - 1 ? 1 : 2,
        extra: { at: i, best: best >= 0 ? best : undefined },
      };
  }
  const end = state();
  const longest = Math.max(...(L as number[]));
  yield {
    state: end,
    marks: L.flatMap((v, i) => (v === longest ? [mark(lenId(i), 'found')] : [])),
    say: `The longest increasing subsequence has length ${longest}, the largest L. That took ${plural(comparisons, 'comparison')}, n(n − 1)/2. Press Trace back to read one off.`,
    lines: ['q.ret'],
    vars: { n, length: longest, comparisons },
    level: 1,
  };
  return end;
}

function* patience(start: S): Gen {
  const { a } = start;
  const n = a.length;
  const L: (number | null)[] = a.map(() => null);
  const P: (number | null)[] = a.map(() => null);
  const tails: number[] = [];
  const state = (): S => ({ a, L: [...L], P: [...P], tails: [...tails] });
  let comparisons = 0;
  yield {
    state: state(),
    marks: [],
    say: 'tails starts empty. tails[k] will hold the smallest value that ends an increasing run of length k, so tails stays sorted and binary search can find where each value goes.',
    lines: ['p.init'],
    vars: { n, comparisons },
    level: 2,
  };
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      comparisons++;
      const less = a[tails[mid]!]! < x;
      yield {
        state: state(),
        marks: [mark(aId(i), 'active'), mark(tailId(mid), 'compare')],
        say: less
          ? `tails[${mid + 1}] = ${a[tails[mid]!]} < ${x}, so ${x} goes to the right of it.`
          : `tails[${mid + 1}] = ${a[tails[mid]!]} ≥ ${x}, so ${x} goes here or to the left.`,
        lines: ['p.loop', 'p.search'],
        vars: { n, i: i + 1, lo: lo + 1, hi, comparisons },
        level: 3,
        extra: { at: i, lo, hi, mid },
      };
      if (less) lo = mid + 1;
      else hi = mid;
    }
    const replaced = lo < tails.length ? tails[lo]! : -1;
    tails[lo] = i;
    L[i] = lo + 1;
    P[i] = lo > 0 ? tails[lo - 1]! : -1;
    yield {
      state: state(),
      marks: [mark(tailId(lo), 'new'), mark(lenId(i), 'new'), mark(prevId(i), 'new')],
      say:
        (replaced < 0
          ? `${x} is larger than every tail: append it. Now there is a run of length ${lo + 1}.`
          : `${x} replaces ${a[replaced]} as tails[${lo + 1}]: a run of length ${lo + 1} can now end lower.`) +
        ` L[${i + 1}] = ${lo + 1}${lo > 0 ? `, and its predecessor is tails[${lo}], a[${P[i]! + 1}] = ${a[P[i]!]}` : ''}.`,
      lines: ['p.loop', 'p.place'],
      vars: { n, i: i + 1, 'tails length': tails.length, comparisons },
      level: i === n - 1 ? 1 : 2,
      extra: { at: i, place: lo },
    };
  }
  const end = state();
  yield {
    state: end,
    marks: [mark(tailId(tails.length - 1), 'found')],
    say: `tails has ${plural(tails.length, 'entry', 'entries')}, so the longest increasing subsequence has length ${tails.length}. That took ${plural(comparisons, 'comparison')}, at most about n log₂ n. tails itself need not be a subsequence. Press Trace back.`,
    lines: ['p.ret'],
    vars: { n, length: tails.length, comparisons },
    level: 1,
  };
  return end;
}

const fill: Op = {
  label: 'Fill the table',
  arity: 0,
  *run(s, _args, { settings }): Gen {
    if (isFull(s) && (settings.method !== 'tails' || s.tails.length > 0)) {
      yield {
        state: s,
        marks: [],
        say: 'The table is already full. Press Trace back, or type a new sequence.',
        lines: [],
        level: 1,
      };
      return s;
    }
    return yield* settings.method === 'tails' ? patience(s) : quadratic(s);
  },
};

const trace: Op = {
  label: 'Trace back',
  arity: 0,
  *run(s, _args, { settings }): Gen {
    const { a } = s;
    if (!isFull(s) || (settings.method === 'tails' && s.tails.length === 0)) {
      yield {
        state: s,
        marks: [],
        say: 'Fill the table first. The walk back follows P from the end of a longest run.',
        lines: [],
        level: 1,
      };
      return s;
    }
    const tails = settings.method === 'tails';
    let i = endOf(s, settings.method);
    const length = s.L[i]!;
    const found: number[] = [];
    yield {
      state: s,
      marks: [mark(lenId(i), 'active')],
      say: tails
        ? `Start at the last tail, a[${i + 1}] = ${a[i]}: it ends a run of length ${length}.`
        : `Start at the first largest L: L[${i + 1}] = ${length}, ending at a[${i + 1}] = ${a[i]}.`,
      lines: ['t.sig'],
      vars: { i: i + 1, length },
      level: 2,
      extra: { found: [] },
    };
    while (i >= 0) {
      found.push(i);
      const prev = s.P[i]!;
      yield {
        state: s,
        marks: [
          mark(aId(i), 'found'),
          mark(prevId(i), 'active'),
          mark(lisId(length - found.length), 'found'),
        ],
        say:
          prev >= 0
            ? `Take a[${i + 1}] = ${a[i]}. P[${i + 1}] = ${prev + 1}: the value before it is a[${prev + 1}] = ${a[prev]}.`
            : `Take a[${i + 1}] = ${a[i]}. P[${i + 1}] is empty: the run starts here.`,
        lines: ['t.loop', 't.take'],
        vars: { i: i + 1, length, found: found.length },
        level: 2,
        extra: { found: [...found] },
      };
      i = prev;
    }
    const seq = [...found].reverse().map((k) => a[k]!);
    yield {
      state: s,
      marks: found.map((k) => mark(aId(k), 'found')),
      say: `A longest increasing subsequence: ${seq.join(', ')}, length ${length}.`,
      lines: ['t.ret'],
      vars: { length, lis: seq.join(' ') },
      level: 1,
      extra: { found: [...found] },
    };
    return s;
  },
};

const valuesOp: Op = {
  label: 'Set sequence',
  arity: 1,
  *run(s, [arg]): Gen {
    const a = valuesFromArg(arg);
    if (typeof a === 'string') {
      yield { state: s, marks: [], say: `The sequence stays as it was. ${a}`, lines: [], level: 1 };
      return s;
    }
    const next = stateFor(a);
    yield {
      state: next,
      marks: [],
      say: `The sequence ${a.join(', ')}. Press Fill the table.`,
      lines: [],
      vars: { n: a.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { values: valuesOp, fill, trace };

const Ln = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: LisSettings): PseudoBlock[] {
  const fillBlock: PseudoBlock =
    settings.method === 'tails'
      ? {
          op: 'fill',
          lines: [
            Ln('p.sig', 0, 'lisTails(a[1..n])', 'To find the length with binary search:'),
            Ln('p.init', 1, 'tails = empty', 'start with no runs.'),
            Ln('p.loop', 1, 'for i = 1 to n', 'For each value, left to right,'),
            Ln(
              'p.search',
              2,
              'k = first index with a[tails[k]] >= a[i]   // binary search',
              'find the first tail that is not smaller than it;',
            ),
            Ln(
              'p.place',
              2,
              'tails[k] = i; L[i] = k; P[i] = tails[k - 1]',
              'put it there (replacing that tail, or at the end), and link it to the tail before.',
            ),
            Ln(
              'p.ret',
              1,
              'return length of tails',
              'The number of tails is the length of the LIS.',
            ),
          ],
        }
      : {
          op: 'fill',
          lines: [
            Ln('q.sig', 0, 'lis(a[1..n])', 'To fill the table:'),
            Ln('q.outer', 1, 'for i = 1 to n', 'for each position i,'),
            Ln('q.init', 2, 'L[i] = 1; P[i] = NIL', 'a[i] alone is a run of length 1;'),
            Ln('q.inner', 2, 'for j = 1 to i - 1', 'look at every earlier position j:'),
            Ln(
              'q.if',
              3,
              'if a[j] < a[i] and L[j] + 1 > L[i]',
              'if a[i] can follow a[j] and that makes a longer run,',
            ),
            Ln('q.set', 4, 'L[i] = L[j] + 1; P[i] = j', 'extend the run through j.'),
            Ln('q.ret', 1, 'return max L[i]', 'The largest L is the length of the LIS.'),
          ],
        };
  return [
    fillBlock,
    {
      op: 'trace',
      lines: [
        Ln(
          't.sig',
          0,
          settings.method === 'tails' ? 'i = tails[last]' : 'i = first index with the largest L',
          settings.method === 'tails'
            ? 'Start at the last tail:'
            : 'Start where the longest run ends:',
        ),
        Ln('t.loop', 1, 'while i != NIL', 'until the run starts,'),
        Ln('t.take', 2, 'take a[i]; i = P[i]', 'take the value and step back to its predecessor.'),
        Ln('t.ret', 1, 'return the values taken, reversed', 'Read them left to right.'),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  return `The sequence ${state.a.join(', ')}. What is the longest subsequence whose values strictly increase? Press Fill the table, or type a new sequence.`;
}

export const initialVars = (state: S) => ({ n: state.a.length });

const show = (v: number | null) => (v === null ? 'empty' : String(v));

export function describe(state: S): string {
  const parts = [
    `Sequence ${state.a.join(', ')}.`,
    `L: ${state.L.map(show).join(', ')}.`,
    `P: ${state.P.map((v) => (v === null ? 'empty' : v < 0 ? 'none' : String(v + 1))).join(', ')}.`,
  ];
  if (state.tails.length) parts.push(`tails: ${andList(state.tails.map((k) => state.a[k]!))}.`);
  return parts.join(' ');
}
