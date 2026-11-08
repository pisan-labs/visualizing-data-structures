import type { Rng } from '../../engine/rng';
import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, mark, wholeArg } from '../_recursion/kit';

/** correct: swap A[i] with a random A[j] still unshuffled. naive: with any A[j] at all (biased). */
export type Method = 'correct' | 'naive';
/** forward: i = 0 up, j from i..n−1, as CLRS's RANDOMIZE-IN-PLACE. backward: i = n−1 down, j from 0..i (Durstenfeld). */
export type Direction = 'forward' | 'backward';

export interface FySettings {
  [key: string]: Scalar;
  method: Method;
  direction: Direction;
}

export const defaults: FySettings = { method: 'correct', direction: 'forward' };

export const MAX_ITEMS = 8;
export const MAX_TRIALS = 6000;
/** Trials shuffle these three, so all 6 orders fit in one chart. */
export const TRIAL_ITEMS = ['1', '2', '3'];

export interface Item {
  v: string;
  uid: number;
}

export interface FyState {
  items: Item[];
  nextUid: number;
  /** The position being filled, and the one picked to swap with it. */
  i: number | null;
  j: number | null;
  /** Positions already final: [0, done) going forward, [done, n) going backward. null when not shuffling. */
  done: number | null;
  direction: Direction;
  /** The j picked at each step of the last shuffle. */
  picks: number[];
  /** Counts of each order of 1 2 3 over the trials, in PERMS order, and how many trials. */
  counts: number[] | null;
  trials: number;
  method: Method;
}

type S = FyState;
type FStep = Step<S, undefined>;
type Op = OpSpec<S, FySettings, undefined>;

/** The six orders of 1 2 3, in the chart's order. */
export const PERMS = ['123', '132', '213', '231', '312', '321'];

export function init(st: FySettings): S {
  return {
    items: ['1', '2', '3', '4', '5', '6'].map((v, k) => ({ v, uid: k + 1 })),
    nextUid: 7,
    i: null,
    j: null,
    done: null,
    direction: st.direction,
    picks: [],
    counts: null,
    trials: 0,
    method: st.method,
  };
}

/** The (i, range of j) steps a shuffle of n items makes. */
export function plan(n: number, st: FySettings): { i: number; lo: number; hi: number }[] {
  if (st.method === 'naive') return Array.from({ length: n }, (_, i) => ({ i, lo: 0, hi: n - 1 }));
  if (st.direction === 'forward')
    return Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({ i, lo: i, hi: n - 1 }));
  return Array.from({ length: Math.max(0, n - 1) }, (_, k) => ({
    i: n - 1 - k,
    lo: 0,
    hi: n - 1 - k,
  }));
}

/** Shuffle a copy of xs the way the settings say, with picks from rng. */
export function shuffleWith<T>(xs: readonly T[], st: FySettings, rng: Rng): T[] {
  const a = [...xs];
  for (const { i, lo, hi } of plan(a.length, st)) {
    const j = rng.int(lo, hi);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * How many of the equally likely runs give each order of 1 2 3: every sequence of picks is
 * equally likely, so count them. The correct shuffle has 3! = 6 runs, one per order; the naive
 * one has 3³ = 27, and 27 does not divide evenly by 6.
 */
export function exactCounts(st: FySettings): number[] {
  const steps = plan(3, st);
  const out = PERMS.map(() => 0);
  const go = (k: number, a: string[]) => {
    if (k === steps.length) {
      out[PERMS.indexOf(a.join(''))]!++;
      return;
    }
    const { i, lo, hi } = steps[k]!;
    for (let j = lo; j <= hi; j++) {
      const b = [...a];
      [b[i], b[j]] = [b[j]!, b[i]!];
      go(k + 1, b);
    }
  };
  go(0, [...TRIAL_ITEMS]);
  return out;
}

const snapOf = (s: S): S => ({
  ...s,
  items: s.items.map((x) => ({ ...x })),
  picks: [...s.picks],
  counts: s.counts && [...s.counts],
});

function makeStep(
  s: S,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  ms: [string, MarkRole][] = [],
): FStep {
  return {
    state: snapOf(s),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: { i: s.i, j: s.j, swaps: s.picks.length, trials: s.trials },
    level,
  };
}

export const cellId = (pos: number) => `cell-${pos}`;

const items = (s: S) => s.items.map((x) => x.v).join(' ');

const loadOp: Op = {
  label: 'Load values',
  arity: 1,
  *run(s, [raw]) {
    const tokens = String(raw ?? '')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!tokens.length || tokens.length > MAX_ITEMS || tokens.some((t) => t.length > 3)) {
      yield makeStep(
        s,
        `Type 1 to ${MAX_ITEMS} values of up to 3 characters, separated by spaces, such as A B C D. Nothing was loaded.`,
        [],
        1,
      );
      return s;
    }
    const st = snapOf(s);
    st.items = tokens.map((v, k) => ({ v, uid: s.nextUid + k }));
    st.nextUid = s.nextUid + tokens.length;
    st.i = st.j = st.done = null;
    st.picks = [];
    yield makeStep(st, `The array is now ${items(st)}.`, [], 1);
    return snapOf(st);
  },
};

const shuffleOp: Op = {
  label: 'Shuffle',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const st = snapOf(s);
    st.method = settings.method;
    st.direction = settings.direction;
    st.picks = [];
    st.counts = s.counts;
    const n = st.items.length;
    const steps = plan(n, settings);
    const naive = settings.method === 'naive';
    const forward = settings.direction === 'forward';
    st.done = naive ? null : forward ? 0 : n;
    yield makeStep(
      st,
      naive
        ? `Shuffle ${items(st)} the naive way: for every position, swap with any position at all. ${n}^${n} = ${n ** n} equally likely runs for ${factorial(n)} ${n === 1 ? 'order' : 'orders'}${n <= 2 ? ', which happens to come out even for so few; from 3 items up it cannot' : ', which cannot come out even'}.`
        : `Shuffle ${items(st)}. ${forward ? 'Going left to right' : 'Going right to left'}, each step picks a random item from the unshuffled part and moves it into place.`,
      ['loop'],
      2,
    );
    for (const { i, lo, hi } of steps) {
      st.i = i;
      const j = rng.int(lo, hi);
      st.j = j;
      st.picks.push(j);
      yield makeStep(
        st,
        `i = ${i}: pick j at random from ${lo} to ${hi}${naive ? ' (the whole array)' : ''}, each with probability 1/${hi - lo + 1}. j = ${j}.`,
        ['pick'],
        3,
        [
          [cellId(i), 'active'],
          [cellId(j), 'compare'],
        ],
      );
      [st.items[i], st.items[j]] = [st.items[j]!, st.items[i]!];
      if (!naive) st.done = forward ? i + 1 : i;
      yield makeStep(
        st,
        i === j
          ? `j = i, so ${st.items[i]!.v} stays where it is. That has to be allowed, or ${st.items[i]!.v} could never stay put.`
          : `Swap A[${i}] and A[${j}]: ${st.items[i]!.v} moves to position ${i}${naive ? '' : ' for good'}.`,
        ['swap'],
        2,
        [
          [cellId(i), naive ? 'active' : 'done'],
          [cellId(j), 'compare'],
        ],
      );
    }
    st.i = st.j = null;
    st.done = naive ? null : forward ? n : 0;
    yield makeStep(
      st,
      naive
        ? `Shuffled: ${items(st)}. It looks random, but some orders come up more often than others: run Trials to see.`
        : `Shuffled: ${items(st)}, after ${steps.length} swaps. Each of the ${factorial(n)} orders was equally likely.`,
      [],
      1,
    );
    return snapOf(st);
  },
};

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

const trialsOp: Op = {
  label: 'Run trials',
  arity: 1,
  *run(s, [raw], { settings, rng }) {
    const t = wholeArg(raw, 1, MAX_TRIALS);
    if (t === null) {
      yield makeStep(
        s,
        `Type how many trials to run, from 1 to ${MAX_TRIALS}. Nothing was run.`,
        [],
        1,
      );
      return s;
    }
    const st = snapOf(s);
    st.method = settings.method;
    st.direction = settings.direction;
    st.counts = PERMS.map(() => 0);
    st.trials = 0;
    st.i = st.j = st.done = null;
    const naive = settings.method === 'naive';
    yield makeStep(
      st,
      `Shuffle 1 2 3 ${t} times ${naive ? 'the naive way' : 'with Fisher-Yates'} and count each order. If every order is equally likely, each bar ends near ${Math.round((t / 6) * 10) / 10}.`,
      ['loop'],
      2,
    );
    const checkpoints = [1, 10, 100, 1000].filter((c) => c < t);
    for (let k = 1; k <= t; k++) {
      const order = shuffleWith(TRIAL_ITEMS, settings, rng).join('');
      st.counts[PERMS.indexOf(order)]!++;
      st.trials = k;
      if (checkpoints.includes(k))
        yield makeStep(
          st,
          k === 1
            ? `The first shuffle gave ${order.split('').join(' ')}.`
            : `After ${k} shuffles: ${st.counts.join(', ')}. ${k < 100 ? 'Too few to tell anything yet.' : ''}`.trim(),
          ['loop'],
          2,
          [[`counts-bar-${PERMS.indexOf(order)}`, 'active']],
        );
    }
    const exact = exactCounts(settings);
    const runs = exact.reduce((a, b) => a + b, 0);
    yield makeStep(
      st,
      naive
        ? `${t} shuffles: ${st.counts.join(', ')}. The naive shuffle has ${runs} equally likely runs, and the orders get ${exact.join(', ')} of them: 1 3 2, 2 1 3 and 2 3 1 come up 5/27 ≈ 18.5% of the time, the others 4/27 ≈ 14.8%.`
        : `${t} shuffles: ${st.counts.join(', ')}. Each order has exactly one of the ${runs} equally likely runs, so each gets 1/6 ≈ 16.7%; the bars differ only by chance.`,
      [],
      1,
    );
    return snapOf(st);
  },
};

export const ops = { load: loadOp, shuffle: shuffleOp, trials: trialsOp };

export function pseudocode(st: FySettings): PseudoBlock[] {
  let lines;
  if (st.method === 'naive')
    lines = [
      L('loop', 0, 'for i = 0 to n − 1', 'For every position i,'),
      L('pick', 1, 'j = RANDOM(0, n − 1)', 'pick any position j at all (the bug),'),
      L('swap', 1, 'swap A[i] with A[j]', 'and swap the two.'),
    ];
  else if (st.direction === 'forward')
    lines = [
      L('loop', 0, 'for i = 0 to n − 2', 'For each position i from the left,'),
      L(
        'pick',
        1,
        'j = RANDOM(i, n − 1)',
        'pick a random position j in the unshuffled part, i included,',
      ),
      L('swap', 1, 'swap A[i] with A[j]', 'and swap: A[i] is now final.'),
    ];
  else
    lines = [
      L('loop', 0, 'for i = n − 1 downto 1', 'For each position i from the right,'),
      L(
        'pick',
        1,
        'j = RANDOM(0, i)',
        'pick a random position j in the unshuffled part, i included,',
      ),
      L('swap', 1, 'swap A[i] with A[j]', 'and swap: A[i] is now final.'),
    ];
  return [
    { op: 'shuffle', lines },
    {
      op: 'trials',
      lines: [
        L(
          'loop',
          0,
          'repeat t times: shuffle 1 2 3, count the order',
          'Shuffle 1 2 3 many times and count each order.',
        ),
      ],
    },
  ];
}

export function initialSay(_s: S, st: FySettings): string {
  return st.method === 'naive'
    ? 'Press Shuffle to shuffle the naive way (swap with any position), or type a number and press Run trials to see its bias.'
    : 'Press Shuffle to shuffle the array, or type a number and press Run trials to count orders over many shuffles.';
}

export function initialVars(): Record<string, Scalar> {
  return { swaps: 0, trials: 0 };
}

export function describe(s: S): string {
  const parts = [`Array: ${items(s)}.`];
  if (s.i !== null) parts.push(`Filling position ${s.i}.`);
  if (s.counts)
    parts.push(
      `Counts over ${s.trials} shuffles of 1 2 3: ${PERMS.map((p, k) => `${p} ${s.counts![k]}`).join(', ')}.`,
    );
  return parts.join(' ');
}
