import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { callShapeId } from '../../layouts/calls';
import { L, mark, ordinal, plural, wholeArg } from '../_recursion/kit';

export type Memo = 'none' | 'memo';

export interface FibSettings {
  [key: string]: Scalar;
  /** none: every call computes. memo: a call looks n up in the memo before computing. */
  memo: Memo;
}

export const MAX_N = 10;

export const defaults: FibSettings = { memo: 'none' };

/**
 * One call in the plain recursion's tree, in the order the calls happen (preorder). With the
 * memo on, a call is made as usual ('call'), answered by the memo at once ('hit'), or never
 * made because a memo hit above it cut it off ('cut').
 */
export interface FibCall {
  id: number;
  parent: number | null;
  n: number;
  kind: 'call' | 'hit' | 'cut';
  /** Which time fib(n) is called in the plain recursion: 1 for the first. */
  occurrence: number;
  /** fib(n). */
  returns: number;
}

export type Status = 'open' | 'done' | 'cut';

export interface FibRun {
  n: number;
  memo: Memo;
  outcome: 'running' | 'done';
  value: number | null;
}

export interface FibState {
  /** The plain recursion's tree for the current or last run, in call order. */
  calls: FibCall[];
  /** Calls drawn so far: open (on the stack), done, or cut (cut off by the memo). */
  status: Record<number, Status>;
  /** Calls on the stack, oldest first. */
  stack: number[];
  /** Values returned so far, by call. */
  result: Record<number, number>;
  /** memo[k], once stored. */
  memo: Record<number, number>;
  /** How many times fib(k) has been called so far, by k. */
  counts: Record<number, number>;
  run: FibRun | null;
}

type S = FibState;
type Op = OpSpec<S, FibSettings, undefined>;
type FibStep = Step<S, undefined>;

export function init(): S {
  return { calls: [], status: {}, stack: [], result: {}, memo: {}, counts: {}, run: null };
}

export function fibValue(n: number): number {
  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}

/** Calls the plain recursion makes for fib(n): 2 fib(n + 1) - 1. */
export const naiveCalls = (n: number) => 2 * fibValue(n + 1) - 1;

/** The plain recursion's tree, marked with what the memo does to each call. */
export function planCalls(n: number, memo: Memo): FibCall[] {
  const calls: FibCall[] = [];
  const count = new Map<number, number>();
  const known = new Set<number>();
  const build = (k: number, parent: number | null, cut: boolean) => {
    const id = calls.length + 1;
    const occurrence = (count.get(k) ?? 0) + 1;
    count.set(k, occurrence);
    const kind = cut ? 'cut' : memo === 'memo' && k >= 2 && known.has(k) ? 'hit' : 'call';
    calls.push({ id, parent, n: k, kind, occurrence, returns: fibValue(k) });
    if (k <= 1) return;
    const below = kind !== 'call';
    build(k - 1, id, below);
    build(k - 2, id, below);
    if (!below) known.add(k);
  };
  build(n, null, false);
  return calls;
}

/** A repeat worth marking: fib(k) for k >= 2 computed again (base cases cost one call). */
export const isRepeat = (c: FibCall) => c.kind === 'call' && c.n >= 2 && c.occurrence > 1;

const fibOp: Op = {
  label: 'Call fib',
  arity: 1,
  *run(s, [raw], { settings }) {
    const n = wholeArg(raw, 0, MAX_N);
    if (n === null) {
      yield {
        state: s,
        marks: [],
        say: `fib needs a whole number n from 0 to ${MAX_N}. Nothing was called.`,
        lines: [],
        vars: { calls: 0, depth: 0 },
        level: 1,
      } satisfies FibStep;
      return s;
    }
    return yield* runFib(n, settings.memo);
  },
};

function* runFib(n0: number, memoOn: Memo): Generator<FibStep, S, void> {
  const calls = planCalls(n0, memoOn);
  const kids = new Map<number, FibCall[]>();
  for (const c of calls)
    if (c.parent !== null) kids.set(c.parent, [...(kids.get(c.parent) ?? []), c]);
  const status: Record<number, Status> = {};
  const stack: number[] = [];
  const result: Record<number, number> = {};
  const memo: Record<number, number> = {};
  const counts: Record<number, number> = {};
  const run: FibRun = { n: n0, memo: memoOn, outcome: 'running', value: null };
  let made = 0;
  let repeats = 0;
  let hits = 0;
  let saved = 0;
  const useMemo = memoOn === 'memo';
  const snap = (): S => ({
    calls,
    status: { ...status },
    stack: [...stack],
    result: { ...result },
    memo: { ...memo },
    counts: { ...counts },
    run: { ...run },
  });
  const vars = (c: FibCall | undefined, more: Record<string, Scalar> = {}) => ({
    ...(c ? { n: c.n } : {}),
    calls: made,
    depth: stack.length,
    ...(useMemo ? { hits, saved } : { repeats }),
    ...more,
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    c: FibCall | undefined,
    ms: [string, MarkRole][] = [],
    more: Record<string, Scalar> = {},
  ): FibStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: vars(c, more),
    level,
  });
  const node = (c: FibCall) => callShapeId(String(c.id));
  const name = (c: FibCall) => `fib(${c.n})`;
  const descendants = (c: FibCall): FibCall[] =>
    (kids.get(c.id) ?? []).flatMap((k) => [k, ...descendants(k)]);

  function* visit(c: FibCall, lead: string, line: string): Generator<FibStep, number, void> {
    made++;
    counts[c.n] = (counts[c.n] ?? 0) + 1;
    status[c.id] = 'open';
    stack.push(c.id);
    const repeat = !useMemo && isRepeat(c);
    if (repeat) repeats++;
    const again = repeat
      ? ` This is the ${ordinal(c.occurrence)} time fib(${c.n}) is computed: all of its calls happen again.`
      : '';
    yield step(`${lead}${again}`, [line], repeat ? 1 : 2, c, [
      [node(c), 'active'],
      [`cnt-${c.n}-box`, 'active'],
    ]);

    if (c.n <= 1) {
      result[c.id] = c.n;
      yield step(
        `Is n <= 1? Yes: fib(${c.n}) is a base case and returns ${c.n} without calling anything.`,
        ['base', 'ret'],
        2,
        c,
        [[node(c), 'found']],
        { returned: c.n },
      );
      stack.pop();
      status[c.id] = 'done';
      return c.n;
    }
    if (useMemo) {
      if (c.kind === 'hit') {
        const below = descendants(c);
        for (const d of below) status[d.id] = 'cut';
        hits++;
        saved += below.length;
        result[c.id] = memo[c.n]!;
        yield step(
          `memo[${c.n}] is known: ${memo[c.n]}. fib(${c.n}) returns it at once, which cuts off the ${plural(below.length, 'call')} it would have made, shown dashed.`,
          ['memo', 'hit'],
          2,
          c,
          [
            [node(c), 'found'],
            [`memo-${c.n}`, 'found'],
          ],
          { returned: memo[c.n]! },
        );
        stack.pop();
        status[c.id] = 'done';
        return memo[c.n]!;
      }
      yield step(
        `Is n <= 1? No. Is memo[${c.n}] known? Not yet, so fib(${c.n}) has to compute it.`,
        ['base', 'memo'],
        3,
        c,
      );
    } else {
      yield step(`Is n <= 1? No: n is ${c.n}, so fib(${c.n}) needs two calls.`, ['base'], 3, c);
    }
    const [left, right] = kids.get(c.id)!;
    const x = yield* visit(
      left!,
      `${name(c)} first needs fib(${c.n - 1}) for x. It waits, and fib(${c.n - 1}) starts.`,
      'x',
    );
    const y = yield* visit(
      right!,
      `fib(${c.n - 1}) returned ${x}, so in ${name(c)} x = ${x}. Next it needs fib(${c.n - 2}) for y.`,
      'y',
    );
    const value = x + y;
    result[c.id] = value;
    if (useMemo) memo[c.n] = value;
    yield step(
      useMemo
        ? `fib(${c.n - 2}) returned ${y}, so y = ${y}. ${name(c)} stores memo[${c.n}] = ${x} + ${y} = ${value} and returns it.`
        : `fib(${c.n - 2}) returned ${y}, so y = ${y}. ${name(c)} returns x + y = ${x} + ${y} = ${value}.`,
      useMemo ? ['store', 'ret2'] : ['ret2'],
      2,
      c,
      useMemo
        ? [
            [node(c), 'found'],
            [`memo-${c.n}`, 'new'],
          ]
        : [[node(c), 'found']],
      { x, y, returned: value },
    );
    stack.pop();
    status[c.id] = 'done';
    return value;
  }

  const value = yield* visit(calls[0]!, `main calls fib(${n0}).`, 'sig');
  run.outcome = 'done';
  run.value = value;
  const all = naiveCalls(n0);
  const twice = Object.entries(counts)
    .map(([k, times]) => [Number(k), times] as const)
    .filter(([k, times]) => k >= 2 && times > 1)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([k, times]) => `fib(${k}) ${times} times`);
  const summary = useMemo
    ? `${plural(made, 'call')} instead of ${all}: the memo cut off ${saved}.`
    : twice.length
      ? `${plural(made, 'call')}, with repeats such as ${twice.join(' and ')}.`
      : `${plural(made, 'call')}, and nothing was computed twice.`;
  yield step(`fib(${n0}) returns ${value} to main. ${summary}`, [], 1, undefined, [], {
    result: value,
  });
  return snap();
}

export const ops = { fib: fibOp };

export function pseudocode(s: FibSettings): PseudoBlock[] {
  if (s.memo === 'memo') {
    return [
      {
        op: 'fib',
        lines: [
          L('sig', 0, 'fib(n)', 'To find the nth Fibonacci number:'),
          L('base', 1, 'if n <= 1', 'If n is 0 or 1,'),
          L('ret', 2, 'return n', 'the answer is n.'),
          L('memo', 1, 'if memo[n] is known', 'If it was worked out before,'),
          L('hit', 2, 'return memo[n]', 'hand back the remembered answer.'),
          L('x', 1, 'x = fib(n - 1)', 'Find the one before it,'),
          L('y', 1, 'y = fib(n - 2)', 'and the one before that.'),
          L('store', 1, 'memo[n] = x + y', 'Remember their sum,'),
          L('ret2', 1, 'return memo[n]', 'and hand it back.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'fib',
      lines: [
        L('sig', 0, 'fib(n)', 'To find the nth Fibonacci number:'),
        L('base', 1, 'if n <= 1', 'If n is 0 or 1,'),
        L('ret', 2, 'return n', 'the answer is n.'),
        L('x', 1, 'x = fib(n - 1)', 'Find the one before it,'),
        L('y', 1, 'y = fib(n - 2)', 'and the one before that.'),
        L('ret2', 1, 'return x + y', 'The answer is their sum.'),
      ],
    },
  ];
}

export function initialSay(_state: S, s: FibSettings): string {
  return s.memo === 'memo'
    ? 'Type n and press Call fib. Each call looks n up in the memo before it computes anything.'
    : 'Type n and press Call fib. Every call makes two more, until n is 0 or 1.';
}

export function initialVars(): Record<string, Scalar> {
  return { calls: 0, depth: 0 };
}

export function describe(state: S): string {
  const run = state.run;
  if (!run) return 'No calls yet.';
  const made = state.calls.filter((c) => state.status[c.id] && state.status[c.id] !== 'cut');
  if (run.outcome === 'running') {
    const path = state.stack.map((id) => `fib(${state.calls[id - 1]!.n})`);
    return `${plural(made.length, 'call')} so far. On the stack: ${path.join(', ')}.`;
  }
  return `fib(${run.n}) returned ${run.value} after ${plural(made.length, 'call')}.`;
}
