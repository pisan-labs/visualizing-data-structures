import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step } from '../../engine/types';
import { cellId, mark, plural, wholeFromArg } from '../_dp/kit';

export const MAX_N = 15;

export interface FibState {
  /** The table is F[0..n]. */
  n: number;
  /** Filled values; null where a cell is still empty. */
  F: (number | null)[];
}

export interface FibSettings {
  [key: string]: Scalar;
  /** bottomup: fill F[0..n] left to right (CLRS). memo: recurse, and remember every answer. */
  style: 'bottomup' | 'memo';
}

/** View-only data for one step. */
export interface FibExtra {
  /** The cell being filled, and the cells it reads. */
  at?: number;
  reads?: number[];
  /** Top-down: the arguments of the calls on the stack, outermost first. */
  stack?: number[];
  /** Top-down: a call that found its answer in the memo. */
  hit?: number;
  /** A value handed back by call k, on its way into the memo. */
  returned?: number;
}

type S = FibState;
type X = FibExtra;
type Op = OpSpec<S, FibSettings, X>;
type FibStep = Step<S, X>;

export const defaults: FibSettings = { style: 'bottomup' };

export const START_N = 7;

export function init(): S {
  return { n: START_N, F: Array(START_N + 1).fill(null) };
}

/** Shape id of the call frame for memoFib(k). */
export const frameId = (k: number) => `frame-${k}`;

const cell = (i: number) => cellId(0, i);

function* bottomUp(n: number): Generator<FibStep, S, void> {
  const F: (number | null)[] = Array(n + 1).fill(null);
  const state = (): S => ({ n, F: [...F] });
  let additions = 0;
  yield {
    state: state(),
    marks: [],
    say: `fib(${n}): make a table F[0..${n}], one cell for each Fibonacci number up to F(${n}). Fill it from the left, so every value it needs is already there.`,
    lines: ['b.new'],
    vars: { n },
    level: 2,
  };
  F[0] = 0;
  yield {
    state: state(),
    marks: [mark(cell(0), 'new')],
    say:
      n === 0
        ? 'F[0] = 0, the first base case. That is already the answer.'
        : 'F[0] = 0, the first base case.',
    lines: ['b.base0'],
    vars: { n, i: 0, 'F[i]': 0, additions },
    level: 1,
    extra: { at: 0 },
  };
  if (n >= 1) {
    F[1] = 1;
    yield {
      state: state(),
      marks: [mark(cell(1), 'new')],
      say: 'F[1] = 1, the second base case. Every other cell is the sum of the two before it.',
      lines: ['b.base1'],
      vars: { n, i: 1, 'F[i]': 1, additions },
      level: 1,
      extra: { at: 1 },
    };
  }
  for (let i = 2; i <= n; i++) {
    const a = F[i - 1]!;
    const b = F[i - 2]!;
    F[i] = a + b;
    additions++;
    yield {
      state: state(),
      marks: [mark(cell(i), 'active'), mark(cell(i - 1), 'compare'), mark(cell(i - 2), 'compare')],
      say: `F[${i}] = F[${i - 1}] + F[${i - 2}] = ${a} + ${b} = ${a + b}.`,
      lines: ['b.loop', 'b.add'],
      vars: { n, i, 'F[i]': a + b, additions },
      level: 1,
      extra: { at: i, reads: [i - 1, i - 2] },
    };
  }
  const end = state();
  yield {
    state: end,
    marks: [mark(cell(n), 'found')],
    say:
      n < 2
        ? `Return F[${n}] = ${F[n]}. A base case needs no additions.`
        : `Return F[${n}] = ${F[n]}. Each cell after the base cases took one addition: ${plural(additions, 'addition')} for n = ${n}.`,
    lines: ['b.ret'],
    vars: { n, result: F[n]!, additions },
    level: 1,
  };
  return end;
}

function* topDown(n: number): Generator<FibStep, S, void> {
  const F: (number | null)[] = Array(n + 1).fill(null);
  const state = (): S => ({ n, F: [...F] });
  const stack: number[] = [];
  let calls = 0;
  let hits = 0;
  const vars = (k: number) => ({ n, k, calls, hits, depth: stack.length });
  yield {
    state: state(),
    marks: [],
    say: `fib(${n}): make an empty memo F[0..${n}] and call memoFib(${n}). Each call looks in the memo first, and stores its answer there before it returns.`,
    lines: ['m.new', 'm.call'],
    vars: { n, calls, hits },
    level: 2,
  };

  function* call(k: number, caller: number | null): Generator<FibStep, number, void> {
    calls++;
    stack.push(k);
    const who = caller === null ? `memoFib(${k})` : `memoFib(${caller}) calls memoFib(${k})`;
    if (F[k] !== null) {
      hits++;
      const v = F[k]!;
      yield {
        state: state(),
        marks: [mark(cell(k), 'found'), mark(frameId(k), 'found')],
        say: `${who}: F[${k}] = ${v} is already in the memo, so it returns ${v} at once. A memo hit: no work.`,
        lines: ['l.check', 'l.hit'],
        vars: vars(k),
        level: 2,
        extra: { stack: [...stack], hit: k },
      };
      stack.pop();
      return v;
    }
    yield {
      state: state(),
      marks: [mark(frameId(k), 'active'), mark(cell(k), 'active')],
      say:
        k <= 1
          ? `${who}: F[${k}] is empty, so it has to work it out.`
          : `${who}: F[${k}] is empty, so it has to work it out. First it asks for F(${k - 1}).`,
      lines: ['l.check'],
      vars: vars(k),
      level: 2,
      extra: { stack: [...stack] },
    };
    if (k <= 1) {
      F[k] = k;
      yield {
        state: state(),
        marks: [mark(cell(k), 'new'), mark(frameId(k), 'active')],
        say: `${k} ≤ 1 is a base case: store F[${k}] = ${k} in the memo and return ${k}.`,
        lines: ['l.base', 'l.ret'],
        vars: vars(k),
        level: 1,
        extra: { stack: [...stack], at: k, returned: k },
      };
      stack.pop();
      return k;
    }
    const a = yield* call(k - 1, k);
    const b = yield* call(k - 2, k);
    F[k] = a + b;
    yield {
      state: state(),
      marks: [
        mark(cell(k), 'new'),
        mark(frameId(k), 'active'),
        mark(cell(k - 1), 'compare'),
        mark(cell(k - 2), 'compare'),
      ],
      say: `Back in memoFib(${k}): F[${k}] = F(${k - 1}) + F(${k - 2}) = ${a} + ${b} = ${a + b}. Store it in the memo and return it.`,
      lines: ['l.rec', 'l.ret'],
      vars: vars(k),
      level: 1,
      extra: { stack: [...stack], at: k, reads: [k - 1, k - 2], returned: k },
    };
    stack.pop();
    return a + b;
  }

  const result = yield* call(n, null);
  const end = state();
  const empty = F.filter((v) => v === null).length;
  yield {
    state: end,
    marks: [mark(cell(n), 'found')],
    say:
      `fib(${n}) returns F(${n}) = ${result}. memoFib ran ${plural(calls, 'time')}: ${plural(calls - hits, 'call')} filled a cell and ${plural(hits, 'call')} found ${hits === 1 ? 'its answer' : 'their answers'} in the memo.` +
      (empty ? ' F[0] was never needed.' : ''),
    lines: ['m.call'],
    vars: { n, result, calls, hits },
    level: 1,
  };
  return end;
}

const fib: Op = {
  label: 'Compute F(n)',
  arity: 1,
  *run(s, [arg], { settings }) {
    const n = wholeFromArg(arg, 0, MAX_N, 'n');
    if (typeof n === 'string') {
      yield {
        state: s,
        marks: [],
        say: `Nothing computed. ${n} The table stays as it was.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    return settings.style === 'memo' ? yield* topDown(n) : yield* bottomUp(n);
  },
};

export const ops = { fib };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FibSettings): PseudoBlock[] {
  if (settings.style === 'memo') {
    return [
      {
        op: 'fib',
        lines: [
          L('m.sig', 0, 'fib(n)', 'To find F(n) from the top down:'),
          L(
            'm.new',
            1,
            'memo = new array [0..n] of NIL',
            'Make an empty memo, one cell per value.',
          ),
          L('m.call', 1, 'return memoFib(n)', 'Ask for F(n).'),
          L('l.sig', 0, 'memoFib(k)', 'To answer a request for F(k):'),
          L('l.check', 1, 'if memo[k] != NIL', 'If F(k) is already in the memo,'),
          L('l.hit', 2, 'return memo[k]', 'hand it back with no work.'),
          L('l.base', 1, 'if k <= 1: memo[k] = k', 'F(0) is 0 and F(1) is 1.'),
          L(
            'l.rec',
            1,
            'else memo[k] = memoFib(k - 1) + memoFib(k - 2)',
            'Otherwise ask for the two before it and add them.',
          ),
          L('l.ret', 1, 'return memo[k]', 'Hand back the answer, now remembered.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'fib',
      lines: [
        L('b.sig', 0, 'fib(n)', 'To find F(n) from the bottom up:'),
        L('b.new', 1, 'F = new array [0..n]', 'Make a table, one cell per value.'),
        L('b.base0', 1, 'F[0] = 0', 'The first base case: F(0) is 0.'),
        L('b.base1', 1, 'if n > 0: F[1] = 1', 'The second: F(1) is 1.'),
        L('b.loop', 1, 'for i = 2 to n', 'For each i from 2 up to n,'),
        L('b.add', 2, 'F[i] = F[i - 1] + F[i - 2]', 'add the two values to its left.'),
        L('b.ret', 1, 'return F[n]', 'The answer is in the last cell.'),
      ],
    },
  ];
}

export function initialSay(_state: S, settings: FibSettings): string {
  return settings.style === 'memo'
    ? `F(0) = 0, F(1) = 1, and every later Fibonacci number is the sum of the two before it. Type n (0 to ${MAX_N}) and press Compute F(n) to watch the recursion fill a memo.`
    : `F(0) = 0, F(1) = 1, and every later Fibonacci number is the sum of the two before it. Type n (0 to ${MAX_N}) and press Compute F(n) to fill the table from the left.`;
}

export function initialVars(state: S) {
  return { n: state.n };
}

export function describe(state: S): string {
  const cells = state.F.map((v) => (v === null ? 'empty' : String(v)));
  return `Table F[0..${state.n}]: ${cells.join(', ')}.`;
}
