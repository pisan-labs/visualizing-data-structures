import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step } from '../../engine/types';
import type { Cell } from '../../layouts/table';
import { andList, cellId, mark, plural, wholeFromArg, wholesFromArg } from '../_dp/kit';

export const MAX_AMOUNT = 12;
export const MAX_COIN = 12;
export const MAX_COINS = 5;

export interface ChangeState {
  /** Coin values, smallest first, each once. */
  coins: number[];
  /** The table covers the amounts 0..amount. */
  amount: number;
  /**
   * Fewest coins: two rows, F (the fewest coins for each amount; Infinity when it cannot be
   * made) and the coin each amount used last (0 for none). Number of ways: one row per prefix
   * of the coins, W[i][a]. null marks a cell not filled yet.
   */
  table: (number | null)[][];
}

export interface ChangeSettings {
  [key: string]: Scalar;
  goal: 'fewest' | 'ways';
}

/** View-only data for one step. */
export interface ChangeExtra {
  /** The cells read for the cell being filled; `win` marks the one that gave its value. */
  reads?: { from: Cell; to: Cell; coin?: number; win?: boolean }[];
  /** Fewest coins: the amounts the traceback has visited, from the target down. */
  back?: number[];
  /** The coins the traceback has taken, with the amount each was taken at. */
  taken?: { coin: number; at: number }[];
  /** What greedy would pay, and whether it got stuck. */
  greedy?: { picks: number[]; stuck: boolean };
}

type S = ChangeState;
type X = ChangeExtra;
type Op = OpSpec<S, ChangeSettings, X>;
type ChangeStep = Step<S, X>;
type Gen = Generator<ChangeStep, S, void>;

export const defaults: ChangeSettings = { goal: 'fewest' };

export const START_COINS = [1, 3, 4];
export const START_AMOUNT = 6;

export function emptyTable(goal: ChangeSettings['goal'], coins: number[], amount: number) {
  const rows = goal === 'fewest' ? 2 : coins.length + 1;
  return Array.from({ length: rows }, () => Array<number | null>(amount + 1).fill(null));
}

export function init(settings: ChangeSettings): S {
  return {
    coins: START_COINS,
    amount: START_AMOUNT,
    table: emptyTable(settings.goal, START_COINS, START_AMOUNT),
  };
}

/** Greedy: keep taking the largest coin that fits. */
export function greedy(coins: number[], amount: number): { picks: number[]; stuck: boolean } {
  const picks: number[] = [];
  let left = amount;
  while (left > 0) {
    const c = [...coins].reverse().find((x) => x <= left);
    if (c === undefined) return { picks, stuck: true };
    picks.push(c);
    left -= c;
  }
  return { picks, stuck: false };
}

/** Every way to make `amount`, each as a list of coins from largest to smallest. */
export function allWays(coins: number[], amount: number, limit = 50): number[][] {
  const out: number[][] = [];
  const go = (left: number, maxIndex: number, picked: number[]) => {
    if (out.length >= limit) return;
    if (left === 0) {
      out.push([...picked]);
      return;
    }
    for (let i = maxIndex; i >= 0; i--) {
      const c = coins[i]!;
      if (c <= left) go(left - c, i, [...picked, c]);
    }
  };
  go(amount, coins.length - 1, []);
  return out;
}

const fmt = (v: number | null) => (v === null ? '?' : v === Infinity ? '∞' : String(v));
/** A readout: the number, or "∞" when the amount cannot be made. */
const num = (v: number) => (v === Infinity ? '∞' : v);
const sum = (xs: number[]) => xs.join(' + ');

function* fewest(s: S, amount: number): Gen {
  const { coins } = s;
  const F: (number | null)[] = Array(amount + 1).fill(null);
  const C: (number | null)[] = Array(amount + 1).fill(null);
  const state = (): S => ({ coins, amount, table: [[...F], [...C]] });
  const f = (a: number): Cell => [0, a];

  yield {
    state: state(),
    marks: [],
    say: `change(${amount}): fill F[0..${amount}] with the fewest coins for each amount up to ${amount}, using coins ${andList(coins)}. The row under F keeps the coin each amount used last.`,
    lines: ['f.sig'],
    vars: { amount },
    level: 2,
  };
  F[0] = 0;
  C[0] = 0;
  yield {
    state: state(),
    marks: [mark(cellId(0, 0), 'new')],
    say:
      amount === 0
        ? 'F[0] = 0: no coins make 0. That is already the answer.'
        : 'F[0] = 0: no coins make 0. Every other amount builds on a smaller one.',
    lines: ['f.base'],
    vars: { amount, a: 0, 'F[a]': 0 },
    level: 2,
  };

  for (let a = 1; a <= amount; a++) {
    let best = Infinity;
    let pick = 0;
    let tie = false;
    const tried: { c: number; v: number }[] = [];
    const reads = (): X['reads'] =>
      tried.map((t) => ({ from: f(a - t.c), to: f(a), coin: t.c, win: t.c === pick }));
    for (const c of coins) {
      if (c > a) break;
      const v = F[a - c]! + 1;
      tried.push({ c, v });
      const better = v < best;
      if (v === best && v !== Infinity) tie = true;
      yield {
        state: state(),
        marks: [mark(cellId(0, a), 'active'), mark(cellId(0, a - c), 'compare')],
        say:
          `Try a ${c} for F[${a}]: F[${a - c}] + 1 = ${fmt(F[a - c]!)} + 1 = ${fmt(v)}.` +
          (v === Infinity
            ? ` ${a - c} cannot be made, so this coin does not help.`
            : better
              ? best === Infinity
                ? ' The best so far.'
                : ` Better than ${best}.`
              : ` Not better than ${best}, so keep the ${pick}.`),
        lines: better && v !== Infinity ? ['f.try', 'f.cmp', 'f.keep'] : ['f.try', 'f.cmp'],
        vars: { amount, a, c, 'F[a]': num(better ? v : best) },
        level: 3,
        extra: {
          reads: tried.map((t) => ({
            from: f(a - t.c),
            to: f(a),
            coin: t.c,
            win: better ? t.c === c : t.c === pick,
          })),
        },
      };
      if (better) {
        best = v;
        pick = c;
      }
    }
    F[a] = best;
    C[a] = best === Infinity ? 0 : pick;
    let say: string;
    if (tried.length === 0) {
      say = `F[${a}] = ∞: every coin is bigger than ${a}, so ${a} cannot be made.`;
    } else if (best === Infinity) {
      say = `F[${a}] = ∞: none of ${andList(tried.map((t) => `F[${a - t.c}]`))} can be made, so ${a} cannot be made either.`;
    } else if (tried.length === 1) {
      say = `F[${a}] = F[${a - pick}] + 1 = ${best}, using a ${pick}, the only coin that fits.`;
    } else {
      say =
        `F[${a}] = min(${tried.map((t) => `F[${a - t.c}] + 1`).join(', ')}) = min(${tried.map((t) => fmt(t.v)).join(', ')}) = ${best}, using a ${pick}.` +
        (tie ? ` On a tie the first coin tried stays.` : '');
    }
    yield {
      state: state(),
      marks: [
        mark(cellId(0, a), 'active'),
        mark(cellId(1, a), 'new'),
        ...tried.map((t) => mark(cellId(0, a - t.c), 'compare')),
      ],
      say,
      lines: best === Infinity ? ['f.loop', 'f.inf'] : ['f.loop', 'f.keep'],
      vars: { amount, a, 'F[a]': num(best), 'coin[a]': best === Infinity ? '–' : pick },
      level: 1,
      extra: { reads: reads() },
    };
  }

  const g = greedy(coins, amount);
  const end = state();
  const target = F[amount]!;
  if (amount === 0) {
    yield {
      state: end,
      marks: [mark(cellId(0, 0), 'found')],
      say: 'change(0) needs no coins at all.',
      lines: ['f.ret'],
      vars: { amount, fewest: 0 },
      level: 1,
    };
    return end;
  }
  if (target === Infinity) {
    yield {
      state: end,
      marks: [mark(cellId(0, amount), 'error')],
      say: `F[${amount}] = ∞: ${amount} cannot be made from coins ${andList(coins)}. ${g.stuck ? 'Greedy gets stuck too.' : ''}`.trim(),
      lines: ['f.ret'],
      vars: { amount, fewest: '∞' },
      level: 1,
      extra: { greedy: g },
    };
    return end;
  }

  // Trace back: follow the coin row from the amount down to 0.
  const back = [amount];
  const taken: { coin: number; at: number }[] = [];
  let a = amount;
  while (a > 0) {
    const c = C[a]!;
    taken.push({ coin: c, at: a });
    const from = a;
    a -= c;
    back.push(a);
    yield {
      state: end,
      marks: [
        mark(cellId(1, from), 'found'),
        mark(cellId(0, a), a === 0 ? 'visit' : 'active'),
        ...back.slice(0, -1).map((x) => mark(cellId(0, x), 'visit')),
      ],
      say:
        `${from === amount ? `Trace back from F[${amount}] = ${target}. ` : ''}coin[${from}] = ${c}: take a ${c} and move to F[${a}].` +
        (a === 0 ? ' F[0] needs nothing more.' : ''),
      lines: ['f.trace', 'f.take'],
      vars: { amount, a, coin: c, taken: taken.length },
      level: 2,
      extra: { back: [...back], taken: [...taken] },
    };
  }
  const paid = taken.map((t) => t.coin);
  const worse = g.stuck || g.picks.length > target;
  const greedySay = g.stuck
    ? `Greedy, which always takes the largest coin that fits, takes ${sum(g.picks)}, leaves ${amount - g.picks.reduce((x, y) => x + y, 0)}, and then no coin fits: it gets stuck. The table found a way with ${plural(target, 'coin')}.`
    : worse
      ? `Greedy, which always takes the largest coin that fits, pays ${sum(g.picks)}: ${plural(g.picks.length, 'coin')}, ${g.picks.length - target} more than the table. The largest coin first is not always best.`
      : `Greedy, which always takes the largest coin that fits, pays ${sum(g.picks)}: ${plural(g.picks.length, 'coin')}, as few as the table. With these coins it happens to work.`;
  yield {
    state: end,
    marks: [mark(cellId(0, amount), 'found')],
    say: greedySay,
    lines: ['g.sig', 'g.loop'],
    vars: { amount, fewest: target, greedy: g.stuck ? 'stuck' : g.picks.length },
    level: 2,
    extra: { back, taken, greedy: g },
  };
  yield {
    state: end,
    marks: [mark(cellId(0, amount), 'found')],
    say:
      `change(${amount}) needs ${plural(target, 'coin')}: ${sum(paid)}.` +
      (g.stuck ? ' Greedy gets stuck.' : worse ? ` Greedy needs ${g.picks.length}.` : ''),
    lines: ['f.ret'],
    vars: { amount, fewest: target, greedy: g.stuck ? 'stuck' : g.picks.length },
    level: 1,
    extra: { back, taken, greedy: g },
  };
  return end;
}

function* ways(s: S, amount: number): Gen {
  const { coins } = s;
  const k = coins.length;
  const W = emptyTable('ways', coins, amount);
  const state = (): S => ({ coins, amount, table: W.map((r) => [...r]) });
  yield {
    state: state(),
    marks: [],
    say: `change(${amount}): count the ways to make each amount up to ${amount}. Row i may use only the first i coins (smallest first), so the last row may use them all. Order does not matter: 1 + 3 and 3 + 1 are one way.`,
    lines: ['w.sig'],
    vars: { amount },
    level: 2,
  };
  W[0] = W[0]!.map((_, a) => (a === 0 ? 1 : 0));
  yield {
    state: state(),
    marks: W[0]!.map((_, a) => mark(cellId(0, a), 'new')),
    say:
      amount === 0
        ? 'Row 0 uses no coins: there is one way to make 0, take nothing.'
        : 'Row 0 uses no coins: there is one way to make 0, take nothing, and no way to make anything else.',
    lines: ['w.base'],
    vars: { amount, i: 0 },
    level: 2,
  };
  for (let i = 1; i <= k; i++) {
    const c = coins[i - 1]!;
    let explained = false;
    for (let a = 0; a <= amount; a++) {
      const skip = W[i - 1]![a]!;
      const fits = a >= c;
      const use = fits ? W[i]![a - c]! : 0;
      W[i]![a] = skip + use;
      const reads: X['reads'] = [{ from: [i - 1, a], to: [i, a], win: true }];
      if (fits) reads.push({ from: [i, a - c], to: [i, a], coin: c, win: true });
      let say = fits
        ? `W[${i}][${a}] = W[${i - 1}][${a}] + W[${i}][${a - c}] = ${skip} + ${use} = ${skip + use}.`
        : `W[${i}][${a}] = W[${i - 1}][${a}] = ${skip}: a ${c} is bigger than ${a}.`;
      if (fits && !explained) {
        say += ` The ways with no ${c}, plus the ways that use at least one ${c}: take one ${c} and make the other ${a - c}.`;
        explained = true;
      }
      const last = a === amount;
      if (last)
        say += ` Row ${i} is done: with ${i === 1 ? `only ${c}s` : `coins ${andList(coins.slice(0, i))}`}, ${amount} can be made in ${plural(skip + use, 'way')}.`;
      yield {
        state: state(),
        marks: [
          mark(cellId(i, a), 'active'),
          ...reads.map((r) => mark(cellId(r.from[0], r.from[1]), 'compare')),
        ],
        say,
        lines: fits ? ['w.loop', 'w.skip', 'w.fits', 'w.use'] : ['w.loop', 'w.skip', 'w.fits'],
        vars: { amount, i, coin: c, a, 'W[i][a]': skip + use },
        level: last ? 1 : 2,
        extra: { reads },
      };
    }
  }
  const end = state();
  const n = W[k]![amount]!;
  const list = allWays(coins, amount, 7);
  const listing =
    n <= 6 && n > 0
      ? ` They are ${andList(list.map((w) => (w.length ? w.join(' + ') : 'no coins')))}.`
      : '';
  yield {
    state: end,
    marks: [mark(cellId(k, amount), 'found')],
    say: `There ${n === 1 ? 'is' : 'are'} ${plural(n, 'way')} to make ${amount} with coins ${andList(coins)}.${listing}`,
    lines: ['w.ret'],
    vars: { amount, ways: n },
    level: 1,
  };
  return end;
}

const change: Op = {
  label: 'Make change',
  arity: 1,
  *run(s, [arg], { settings }) {
    const amount = wholeFromArg(arg, 0, MAX_AMOUNT, 'the amount');
    if (typeof amount === 'string') {
      yield {
        state: s,
        marks: [],
        say: `Nothing to do. ${amount} To change the coins, use Set coins.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    return settings.goal === 'ways' ? yield* ways(s, amount) : yield* fewest(s, amount);
  },
};

const coinsOp: Op = {
  label: 'Set coins',
  arity: 1,
  *run(s, [arg], { settings }) {
    const vs = wholesFromArg(arg, 1, MAX_COIN, MAX_COINS, 'coins');
    const dup = typeof vs === 'string' ? undefined : vs.find((v, i) => vs.indexOf(v) !== i);
    if (typeof vs === 'string' || dup !== undefined) {
      yield {
        state: s,
        marks: [],
        say: `The coins stay ${andList(s.coins)}. ${typeof vs === 'string' ? vs : `${dup} appears twice; list each coin once.`}`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const coins = [...vs].sort((x, y) => x - y);
    const next: S = { coins, amount: s.amount, table: emptyTable(settings.goal, coins, s.amount) };
    yield {
      state: next,
      marks: [],
      say:
        `Coins, smallest first: ${andList(coins)}. Type an amount and press Make change.` +
        (coins[0] !== 1 ? ' With no coin worth 1, some amounts cannot be made at all.' : ''),
      lines: [],
      vars: { coins: coins.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { change, coins: coinsOp };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: ChangeSettings): PseudoBlock[] {
  if (settings.goal === 'ways') {
    return [
      {
        op: 'change',
        lines: [
          L('w.sig', 0, 'ways(A)', 'To count the ways to make A with coins c[1..k]:'),
          L(
            'w.base',
            1,
            'W[0][0] = 1; W[0][a] = 0 for a > 0',
            'With no coins, only 0 can be made.',
          ),
          L('w.coin', 1, 'for i = 1 to k', 'Add the coins one at a time.'),
          L('w.loop', 2, 'for a = 0 to A', 'For each amount,'),
          L('w.skip', 3, 'W[i][a] = W[i - 1][a]', 'count the ways that skip coin i,'),
          L('w.fits', 3, 'if a >= c[i]', 'and if coin i fits,'),
          L(
            'w.use',
            4,
            'W[i][a] = W[i][a] + W[i][a - c[i]]',
            'add the ways that use it at least once.',
          ),
          L('w.ret', 1, 'return W[k][A]', 'The last row may use every coin.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'change',
      lines: [
        L('f.sig', 0, 'change(A)', 'To pay A with the fewest coins:'),
        L('f.base', 1, 'F[0] = 0', 'No coins make 0.'),
        L('f.loop', 1, 'for a = 1 to A', 'For each amount from 1 up to A,'),
        L('f.inf', 2, 'F[a] = ∞', 'start from "cannot be made",'),
        L('f.try', 2, 'for each coin c <= a', 'then try every coin that fits:'),
        L('f.cmp', 3, 'if F[a - c] + 1 < F[a]', 'if c plus the best way to make a - c is better,'),
        L('f.keep', 4, 'F[a] = F[a - c] + 1; coin[a] = c', 'keep it, and remember the coin.'),
        L('f.trace', 1, 'while A > 0', 'To list the coins, start at A:'),
        L('f.take', 2, 'pay coin[A]; A = A - coin[A]', 'take the coin it used, then move left.'),
        L('f.ret', 1, 'return F[A]', 'F[A] is the fewest coins.'),
        L('g.sig', 0, 'greedy(A)', 'For comparison, greedy:'),
        L(
          'g.loop',
          1,
          'while A > 0: pay the largest c <= A',
          'keeps taking the largest coin that fits.',
        ),
      ],
    },
  ];
}

export function initialSay(state: S, settings: ChangeSettings): string {
  return settings.goal === 'ways'
    ? `Coins ${andList(state.coins)}. Type an amount (0 to ${MAX_AMOUNT}) and press Make change to count the ways to make it.`
    : `Coins ${andList(state.coins)}. Type an amount (0 to ${MAX_AMOUNT}) and press Make change to find the fewest coins. Try 6: greedy gets it wrong.`;
}

export function initialVars(state: S) {
  return { amount: state.amount, coins: state.coins.length };
}

export function describe(state: S, settings: ChangeSettings): string {
  const cell = (v: number | null) =>
    v === null ? 'empty' : v === Infinity ? 'infinity' : String(v);
  const head = `Coins ${state.coins.join(', ')}.`;
  if (settings.goal === 'ways') {
    const rows = state.table.map(
      (r, i) =>
        `${i === 0 ? 'no coins' : `coins up to ${state.coins[i - 1]}`}: ${r.map(cell).join(', ')}`,
    );
    return `${head} Ways for amounts 0 to ${state.amount}, row by row. ${rows.join('; ')}.`;
  }
  const [F = [], C = []] = state.table;
  return `${head} Fewest coins F[0..${state.amount}]: ${F.map(cell).join(', ')}. Coin used: ${C.map((v) => (v === null ? 'empty' : v === 0 ? 'none' : String(v))).join(', ')}.`;
}
