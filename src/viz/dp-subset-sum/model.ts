import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import type { Cell } from '../../layouts/table';
import { andList, cellId, mark, plural, wholeFromArg } from '../_dp/kit';

export const MAX_ITEMS = 6;
export const MAX_X = 15;
export const MAX_TARGET = 14;

export interface SubsetState {
  xs: number[];
  /** The target sum; the table has columns 0..T. */
  T: number;
  /** S[i][t]: can some of the first i numbers add up to exactly t? null where not filled yet. */
  S: (boolean | null)[][];
}

export type SubsetSettings = { [key: string]: Scalar };

export interface SubsetExtra {
  /** The cells read for the cell being filled: skip (the cell above) and take. */
  reads?: { from: Cell; to: Cell; take: boolean; win: boolean; label?: string }[];
  path?: Cell[];
  /** Item numbers the walk back has taken so far, last item first. */
  taken?: number[];
}

type S = SubsetState;
type X = SubsetExtra;
type Op = OpSpec<S, SubsetSettings, X>;
type SubStep = Step<S, X>;
type Gen = Generator<SubStep, S, void>;

export const defaults: SubsetSettings = {};

export const START_XS = [3, 4, 5, 2];
export const START_T = 9;

export const emptyTable = (n: number, T: number): (boolean | null)[][] =>
  Array.from({ length: n + 1 }, () => Array<boolean | null>(T + 1).fill(null));

export function init(): S {
  return { xs: START_XS, T: START_T, S: emptyTable(START_XS.length, START_T) };
}

/** Shape id of a number in the row headers. */
export const xId = (i: number) => `rh-1-${i}`;

export const tf = (b: boolean) => (b ? 'T' : 'F');

/** Read "3 4 5 2" into numbers, or say what is wrong. */
export function numbersFromArg(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const how = `Type the numbers, such as 3 4 5 2: whole numbers from 1 to ${MAX_X}.`;
  if (tokens.length === 0) return how;
  if (tokens.length > MAX_ITEMS)
    return `That is ${tokens.length} numbers. Use at most ${MAX_ITEMS}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `"${t}" is not a whole number. ${how}`;
    const v = Number(t);
    if (v < 1 || v > MAX_X) return `${v} is out of range. ${how}`;
    out.push(v);
  }
  return out;
}

export function filledRows(s: S): number {
  let r = -1;
  for (let i = 0; i < s.S.length; i++) {
    if (s.S[i]!.every((v) => v !== null)) r = i;
    else break;
  }
  return r;
}

export const isFull = (s: S) => filledRows(s) === s.xs.length;

/** How many bits it takes to write T: the size of the input, as opposed to its value. */
export const bitsOf = (T: number) => Math.max(1, Math.ceil(Math.log2(T + 1)));

function* fillRows(s: S, last: number): Gen {
  const { xs, T } = s;
  const n = xs.length;
  const tab = s.S.map((r) => [...r]);
  const state = (): S => ({ xs, T, S: tab.map((r) => [...r]) });
  let from = filledRows(s) + 1;
  if (from === 0) {
    for (let t = 0; t <= T; t++) tab[0]![t] = t === 0;
    yield {
      state: state(),
      marks: Array.from({ length: T + 1 }, (_, t) => mark(cellId(0, t), 'new')),
      say: 'Row 0 uses no numbers. The empty set adds up to 0, so S[0][0] = T, and every other sum is F.',
      lines: ['s.base'],
      vars: { n, T, i: 0 },
      level: last === 0 ? 1 : 2,
    };
    from = 1;
  }
  for (let i = from; i <= last; i++) {
    const x = xs[i - 1]!;
    for (let t = 0; t <= T; t++) {
      const skip = tab[i - 1]![t]!;
      let value: boolean;
      let say: string;
      let reads: X['reads'];
      let lines: string[];
      if (x > t) {
        value = skip;
        say = `${x} > ${t}, so x${i} cannot be in a subset that adds up to ${t}: S[${i}][${t}] = S[${i - 1}][${t}] = ${tf(skip)}.`;
        reads = [{ from: [i - 1, t], to: [i, t], take: false, win: true }];
        lines = ['s.loop', 's.skip'];
      } else {
        const take = tab[i - 1]![t - x]!;
        value = skip || take;
        say = `S[${i}][${t}] = S[${i - 1}][${t}] or S[${i - 1}][${t - x}] = ${tf(skip)} or ${tf(take)} = ${tf(value)}${
          skip
            ? `: ${t} is reachable without x${i}.`
            : take
              ? `: add x${i} = ${x} to a subset that makes ${t - x}.`
              : '.'
        }`;
        reads = [
          { from: [i - 1, t], to: [i, t], take: false, win: skip },
          { from: [i - 1, t - x], to: [i, t], take: true, win: !skip && take, label: `+${x}` },
        ];
        lines = ['s.loop', 's.skip', 's.take'];
      }
      tab[i]![t] = value;
      const rowDone = t === T;
      if (rowDone) {
        const sums = tab[i]!.flatMap((v, k) => (v ? [k] : []));
        say += ` Row ${i} is done: the first ${plural(i, 'number')} can make ${andList(sums)}.`;
      }
      yield {
        state: state(),
        marks: [
          mark(cellId(i, t), 'active'),
          mark(xId(i), 'compare'),
          ...reads.map((r) => mark(cellId(r.from[0], r.from[1]), 'compare')),
        ],
        say,
        lines,
        vars: { i, t, x, 'S[i][t]': tf(value) },
        level: rowDone ? 1 : 2,
        extra: { reads },
      };
    }
  }
  return state();
}

const fill: Op = {
  label: 'Fill the table',
  arity: 0,
  *run(s): Gen {
    const n = s.xs.length;
    if (isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(n, s.T), 'found')],
        say: `The table is already full: S[${n}][${s.T}] = ${tf(s.S[n]![s.T]!)}. Press Trace back, or change the numbers or the target.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const end = yield* fillRows(s, n);
    const yes = end.S[n]![s.T]!;
    const cells = (n + 1) * (s.T + 1);
    yield {
      state: end,
      marks: [mark(cellId(n, s.T), yes ? 'found' : 'error')],
      say: `S[${n}][${s.T}] = ${tf(yes)}: ${yes ? `some of the numbers add up to ${s.T}. Press Trace back to see which.` : `no subset adds up to ${s.T}.`} The table has ${cells} cells: it grows with the value of T, not with the ${bitsOf(s.T)} bits it takes to write T.`,
      lines: ['s.ret'],
      vars: { n, T: s.T, found: yes, cells, 'bits of T': bitsOf(s.T) },
      level: 1,
    };
    return end;
  },
};

const row: Op = {
  label: 'Fill one row',
  arity: 0,
  *run(s): Gen {
    const done = filledRows(s);
    if (done === s.xs.length) {
      yield {
        state: s,
        marks: [],
        say: 'Every row is filled already. Press Trace back, or change the numbers or the target.',
        lines: [],
        level: 1,
      };
      return s;
    }
    return yield* fillRows(s, done + 1);
  },
};

const trace: Op = {
  label: 'Trace back',
  arity: 0,
  *run(s): Gen {
    const { xs, T } = s;
    const n = xs.length;
    if (!isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(n, T), 'error')],
        say: `Fill the table first. The walk back starts at S[${n}][${T}].`,
        lines: [],
        level: 1,
      };
      return s;
    }
    if (!s.S[n]![T]) {
      yield {
        state: s,
        marks: [mark(cellId(n, T), 'error')],
        say: `S[${n}][${T}] = F: no subset of ${andList(xs)} adds up to ${T}, so there is nothing to trace back.`,
        lines: ['t.sig', 't.none'],
        vars: { found: false, subset: '' },
        level: 1,
      };
      return s;
    }
    let t = T;
    const path: Cell[] = [[n, t]];
    const taken: number[] = [];
    const extra = (): X => ({ path: [...path], taken: [...taken] });
    yield {
      state: s,
      marks: [mark(cellId(n, t), 'active')],
      say: `S[${n}][${T}] = T. Walk up from it, one row per number, keeping the sum reachable.`,
      lines: ['t.sig'],
      vars: { i: n, t },
      level: 2,
      extra: extra(),
    };
    for (let i = n; i >= 1; i--) {
      const x = xs[i - 1]!;
      const above = s.S[i - 1]![t]!;
      let say: string;
      const marks = [];
      if (above) {
        say = `S[${i - 1}][${t}] = T: the first ${plural(i - 1, 'number')} already make ${t}, so leave x${i} = ${x} out. Move up.`;
        marks.push(mark(cellId(i, t), 'visit'));
      } else {
        taken.push(i);
        say = `S[${i - 1}][${t}] = F, so x${i} = ${x} must be in. Take it; ${t} − ${x} = ${t - x} is left.`;
        marks.push(mark(xId(i), 'found'), mark(cellId(i, t), 'found'));
        t -= x;
      }
      path.push([i - 1, t]);
      marks.push(mark(cellId(i - 1, t), 'active'));
      yield {
        state: s,
        marks,
        say,
        lines: above ? ['t.loop', 't.skip'] : ['t.loop', 't.take'],
        vars: { i: i - 1, t },
        level: 2,
        extra: extra(),
      };
    }
    const chosen = [...taken].reverse().map((k) => xs[k - 1]!);
    yield {
      state: s,
      marks: [mark(cellId(n, T), 'found')],
      say: T === 0 ? 'The empty subset adds up to 0.' : `${chosen.join(' + ')} = ${T}.`,
      lines: ['t.ret'],
      vars: { found: true, subset: chosen.join(' ') },
      level: 1,
      extra: extra(),
    };
    return s;
  },
};

const numbersOp: Op = {
  label: 'Set numbers',
  arity: 1,
  *run(s, [arg]): Gen {
    const xs = numbersFromArg(arg);
    if (typeof xs === 'string') {
      yield {
        state: s,
        marks: [],
        say: `The numbers stay as they were. ${xs}`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const next: S = { xs, T: s.T, S: emptyTable(xs.length, s.T) };
    yield {
      state: next,
      marks: [],
      say: `Numbers ${andList(xs)}, target ${s.T}. Press Fill the table.`,
      lines: [],
      vars: { n: xs.length, T: s.T },
      level: 1,
    };
    return next;
  },
};

const targetOp: Op = {
  label: 'Target',
  arity: 1,
  *run(s, [arg]): Gen {
    const T = wholeFromArg(arg, 0, MAX_TARGET, 'the target');
    if (typeof T === 'string') {
      yield {
        state: s,
        marks: [],
        say: `The target stays ${s.T}. ${T} To change the numbers, use Set numbers.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const next: S = { xs: s.xs, T, S: emptyTable(s.xs.length, T) };
    yield {
      state: next,
      marks: [],
      say: `Target ${T}: the table gets a column for every sum from 0 to ${T}. Press Fill the table.`,
      lines: [],
      vars: { n: s.xs.length, T },
      level: 1,
    };
    return next;
  },
};

export const ops = { numbers: numbersOp, target: targetOp, fill, row, trace };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'fill',
      lines: [
        L('s.sig', 0, 'subsetSum(x[1..n], T)', 'To fill the table for n numbers and target T:'),
        L(
          's.base',
          1,
          'S[0][0] = true; S[0][t] = false for t = 1 to T',
          'With no numbers, only the sum 0 is reachable.',
        ),
        L('s.loop', 1, 'for i = 1 to n, for t = 0 to T', 'Number by number, sum by sum:'),
        L('s.skip', 2, 'S[i][t] = S[i - 1][t]', 'a sum reachable without x[i] stays reachable;'),
        L(
          's.take',
          2,
          'if x[i] <= t: S[i][t] = S[i][t] or S[i - 1][t - x[i]]',
          'and if x[i] fits, adding it to a subset that makes t − x[i] reaches t too.',
        ),
        L('s.ret', 1, 'return S[n][T]', 'The bottom-right cell says whether T is reachable.'),
      ],
    },
    {
      op: 'trace',
      lines: [
        L('t.sig', 0, 'traceBack(t = T)', 'To find a subset, start at the bottom-right:'),
        L('t.none', 1, 'if not S[n][T]: return none', 'if it is false, there is no subset.'),
        L('t.loop', 1, 'for i = n down to 1', 'For each number, from the last row up,'),
        L(
          't.skip',
          2,
          'if S[i - 1][t]: leave x[i] out',
          'if the row above already reaches t, leave the number out;',
        ),
        L('t.take', 2, 'else: take x[i]; t = t - x[i]', 'otherwise it must be in: take it.'),
        L('t.ret', 1, 'return the numbers taken', 'They add up to T.'),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  return `Numbers ${andList(state.xs)}. Do some of them add up to exactly ${state.T}? Press Fill the table, or type new numbers or a new target.`;
}

export function initialVars(state: S) {
  return { n: state.xs.length, T: state.T };
}

export function describe(state: S): string {
  const rows = state.S.map(
    (r, i) =>
      `row ${i}${i ? ` (x${i} = ${state.xs[i - 1]})` : ''}: ${r.map((v) => (v === null ? 'empty' : tf(v))).join(' ')}`,
  );
  return `Subset sum table, target ${state.T}. ${rows.join('; ')}.`;
}
