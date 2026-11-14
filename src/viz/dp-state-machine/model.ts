/**
 * States over time: one item, one price per day. Each day you may buy it (if you hold nothing),
 * sell it (if you hold it) or rest, and you hold at most one at a time. Two rules, as settings:
 * a cooldown (after a sale you must rest the next day) and a fee paid on every sale. What is the
 * most money you can end with, starting from 0?
 *
 * A small state machine: free (holding nothing, free to buy), hold (holding the item), and,
 * with the cooldown, cool (sold today, so tomorrow is a rest). T[s][t] is the most money you can
 * have at the end of day t in state s; column 0 is before day 1, where you are free with 0 and
 * the other states cannot be (−∞). With p the price on day t and f the fee:
 *
 *   free[t] = max(free[t − 1], cool[t − 1])          rest, or the cooldown ends
 *   hold[t] = max(hold[t − 1], free[t − 1] − p)      keep it, or buy today
 *   cool[t] = hold[t − 1] + p − f                    sell today
 *
 * and without the cooldown, free[t] = max(free[t − 1], hold[t − 1] + p − f), with no cool row.
 * The answer is the best state you may end in: max(free[n], cool[n]), or free[n].
 *
 * The naive approach is plain recursion on the same rules from the last day: nothing is stored,
 * so a state on an early day is worked out once for every chain of transitions from it to the
 * end. The pattern is the table, filled day by day. The best plan is traced back from the
 * answer: each cell came from one transition. Work units (../_dp2/kit.ts): `calls` and `cells`.
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
import { approachOf, workVars, type Approach, type Totals } from '../_patterns/kit';
import { plural } from '../_dp/kit';
import { copy2, dpWork, fmt, nthTime, scalar, zeros } from '../_dp2/kit';

export const MAX_DAYS = 8;
export const MAX_PRICE = 20;
export const MAX_FEE = 5;

export type StateName = 'free' | 'hold' | 'cool';

export interface SMSettings {
  [key: string]: Scalar;
  approach: Approach;
  cooldown: boolean;
  fee: number;
}

export const defaults: SMSettings = { approach: 'pattern', cooldown: true, fee: 0 };

export interface SMState {
  prices: number[];
  /** T[row][t]: rows in the order of statesFor(settings), columns t = 0..n. null where empty. */
  T: (number | null)[][];
}

/** A cell: [row, day]. */
export type Cell = readonly [row: number, t: number];

/** A transition of the machine, for the diagram: from a state to a state. */
export interface Move {
  from: StateName;
  to: StateName;
}

export interface SMExtra {
  /** Recursion: how many calls each cell has had. */
  calls?: number[][];
  /** Plain recursion: what each cell's last call returned (nothing is stored). */
  seen?: (number | null)[][];
  /** Recursion: the cells of the calls on the stack, outermost first. */
  stack?: Cell[];
  /** The cells a value was made from, and whether each one won. */
  reads?: { from: Cell; to: Cell; win: boolean; move: Move }[];
  /** The state whose value is being worked out. */
  at?: StateName;
  /** The trace: cells walked back so far, from the answer. */
  path?: Cell[];
  /** The trace: the buys and sells found so far. */
  plan?: Action[];
}

export interface Action {
  kind: 'buy' | 'sell';
  day: number;
}

type S = SMState;
type X = SMExtra;
export type SMStep = Step<S, X>;
type Op = OpSpec<S, SMSettings, X>;
type Gen = Generator<SMStep, S, void>;

export const START_PRICES = [6, 1, 4, 9, 1, 7];

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const cellId = (row: number, t: number) => `cell-${row}-${t}`;
export const stateId = (q: StateName) => `st-${q}`;
export const moveId = (m: Move) => `mv-${m.from}-${m.to}`;

export const statesFor = (s: { cooldown?: Scalar }): StateName[] =>
  s.cooldown === false ? ['free', 'hold'] : ['free', 'hold', 'cool'];
export const feeOf = (s: { fee?: Scalar }): number =>
  Math.max(0, Math.min(MAX_FEE, Math.round(Number(s.fee) || 0)));

export const emptyTable = (rows: number, n: number): (number | null)[][] =>
  Array.from({ length: rows }, () => Array<number | null>(n + 1).fill(null));

export const LONG: Record<StateName, string> = {
  free: 'free (holding nothing)',
  hold: 'holding the item',
  cool: 'cooling down (sold today)',
};

// ----- Input -----

/** Read prices "3 1 4 8", or say what is wrong. */
export function readPrices(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const how = `Type one price per day, such as 3 1 4 8 2 6: 1 to ${MAX_DAYS} whole numbers from 1 to ${MAX_PRICE}.`;
  if (tokens.length === 0) return how;
  if (tokens.length > MAX_DAYS) return `That is ${tokens.length} days. Use at most ${MAX_DAYS}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `"${t}" is not a whole number. ${how}`;
    const v = Number(t);
    if (v < 1 || v > MAX_PRICE) return `${v} is out of range. ${how}`;
    out.push(v);
  }
  return out;
}

// ----- The rules -----

/** One way into a state on day t: the state it comes from, what it adds, and its name. */
interface Way {
  from: StateName;
  /** Money added on day t: −p for a buy, p − f for a sale, 0 otherwise. */
  add: number;
  what: 'rest' | 'buy' | 'sell' | 'keep' | 'end of the cooldown';
}

/** The ways into state q on a day with price p; the first is preferred on a tie. */
export function waysInto(q: StateName, p: number, cooldown: boolean, fee: number): Way[] {
  if (q === 'hold')
    return [
      { from: 'hold', add: 0, what: 'keep' },
      { from: 'free', add: -p, what: 'buy' },
    ];
  if (q === 'cool') return [{ from: 'hold', add: p - fee, what: 'sell' }];
  return cooldown
    ? [
        { from: 'free', add: 0, what: 'rest' },
        { from: 'cool', add: 0, what: 'end of the cooldown' },
      ]
    : [
        { from: 'free', add: 0, what: 'rest' },
        { from: 'hold', add: p - fee, what: 'sell' },
      ];
}

/** The value of state q before day 1. */
export const startValue = (q: StateName) => (q === 'free' ? 0 : -Infinity);

/** The states the answer may end in, the first preferred on a tie. */
export const endStates = (cooldown: boolean): StateName[] =>
  cooldown ? ['free', 'cool'] : ['free'];

/** The whole table, bottom-up, without steps: T[row][t]. */
export function solveTable(prices: number[], cooldown: boolean, fee: number): number[][] {
  const states = cooldown
    ? (['free', 'hold', 'cool'] as StateName[])
    : (['free', 'hold'] as StateName[]);
  const row = (q: StateName) => states.indexOf(q);
  const T = states.map(() => Array<number>(prices.length + 1).fill(0));
  states.forEach((q, i) => (T[i]![0] = startValue(q)));
  for (let t = 1; t <= prices.length; t++)
    for (const q of states)
      T[row(q)]![t] = Math.max(
        ...waysInto(q, prices[t - 1]!, cooldown, fee).map((w) => T[row(w.from)]![t - 1]! + w.add),
      );
  return T;
}

/** The best final money: the best state you may end in. */
export function bestProfit(prices: number[], cooldown: boolean, fee: number): number {
  const T = solveTable(prices, cooldown, fee);
  const states = cooldown ? ['free', 'hold', 'cool'] : ['free', 'hold'];
  return Math.max(...endStates(cooldown).map((q) => T[states.indexOf(q)]![prices.length]!));
}

/** Calls plain recursion makes: the top-level calls, then each call's sub-calls. */
export function naiveCalls(n: number, cooldown: boolean): number {
  // c[q] = calls made by one call on state q at day t (itself included).
  let c: Record<StateName, number> = { free: 1, hold: 1, cool: 1 };
  for (let t = 1; t <= n; t++) {
    const next = { ...c };
    for (const q of ['free', 'hold', 'cool'] as StateName[])
      next[q] = 1 + waysInto(q, 0, cooldown, 0).reduce((a, w) => a + c[w.from], 0);
    c = next;
  }
  return endStates(cooldown).reduce((a, q) => a + c[q], 0);
}

export function totals(n: number, cooldown: boolean): Totals {
  return { naive: naiveCalls(n, cooldown), pattern: statesFor({ cooldown }).length * (n + 1) };
}

// ----- Text -----

const ref = (q: StateName, t: number) => `${q}[${t}]`;
const callOf = (q: StateName, t: number) => `${q}(${t})`;
const sign = (add: number) => (add === 0 ? '' : add < 0 ? ` − ${-add}` : ` + ${add}`);

function wayText(w: Way, p: number, fee: number): string {
  if (w.what === 'buy') return `buy at ${p}`;
  if (w.what === 'sell') return fee ? `sell at ${p}, pay the fee ${fee}` : `sell at ${p}`;
  if (w.what === 'keep') return 'keep holding';
  if (w.what === 'end of the cooldown') return 'rest after the cooldown';
  return 'rest';
}

/** How state q's value on day t is made from day t − 1, in words and numbers. */
function rule(
  q: StateName,
  t: number,
  p: number,
  settings: SMSettings,
  get: (q: StateName) => number,
  form: (q: StateName) => string,
): { value: number; text: string; win: number } {
  const ways = waysInto(q, p, settings.cooldown !== false, feeOf(settings));
  const vals = ways.map((w) => get(w.from) + w.add);
  const value = Math.max(...vals);
  const win = vals.indexOf(value);
  const terms = ways.map((w) => `${form(w.from)}${sign(w.add)}`);
  const nums = ways.map((w) => `${fmt(get(w.from))}${sign(w.add)}`);
  const fee = feeOf(settings);
  if (ways.length === 1) {
    const w = ways[0]!;
    return {
      value,
      win,
      text: `${terms[0]} = ${nums[0]} = ${fmt(value)}: ${value === -Infinity ? 'you held nothing yesterday, so there is nothing to sell' : wayText(w, p, fee)}`,
    };
  }
  const why =
    value === -Infinity
      ? 'neither is possible yet'
      : vals[0] === vals[1]
        ? `a tie, so ${wayText(ways[0]!, p, fee)}`
        : `better to ${wayText(ways[win]!, p, fee)}`;
  return {
    value,
    win,
    text: `max(${terms.join(', ')}) = max(${nums.join(', ')}) = ${fmt(value)}: ${why}`,
  };
}

// ----- Steps -----

function refuse(s: S, why: string): SMStep {
  return { state: s, marks: [], say: why, lines: [], level: 1, vars: { days: s.prices.length } };
}

const load: Op = {
  label: 'Load prices',
  arity: 1,
  *run(s, [arg], { settings }) {
    const prices = readPrices(arg);
    if (typeof prices === 'string') {
      yield refuse(s, `The prices stay as they were. ${prices}`);
      return s;
    }
    const next: S = { prices, T: emptyTable(statesFor(settings).length, prices.length) };
    yield {
      state: next,
      marks: [],
      say: `${prices.length === 1 ? 'One day' : `${prices.length} days`}, priced ${prices.join(', ')}. Press Solve.`,
      lines: [],
      level: 1,
      vars: { days: prices.length },
    };
    return next;
  },
};

const answerOf = (T: readonly (readonly (number | null)[])[], n: number, settings: SMSettings) => {
  const states = statesFor(settings);
  const ends = endStates(settings.cooldown !== false);
  const vals = ends.map((q) => T[states.indexOf(q)]![n] ?? -Infinity);
  const best = Math.max(...vals);
  return { best, from: ends[vals.indexOf(best)]! };
};

function endText(settings: SMSettings): string {
  return settings.cooldown !== false ? 'max(free[n], cool[n])' : 'free[n]';
}

/** The pattern: the table, day by day. */
function* bottomUp(s: S, settings: SMSettings): Gen {
  const states = statesFor(settings);
  const cooldown = settings.cooldown !== false;
  const n = s.prices.length;
  const T = emptyTable(states.length, n);
  const tot = totals(n, cooldown);
  const work = dpWork();
  const row = (q: StateName) => states.indexOf(q);
  const state = (): S => ({ prices: s.prices, T: copy2(T) });
  const vars = (t: number, more: Record<string, Scalar> = {}) => ({
    day: t,
    ...more,
    ...workVars(work, tot),
  });
  states.forEach((q, i) => {
    T[i]![0] = startValue(q);
    work.add('cells');
  });
  yield {
    state: state(),
    marks: states.map((_, i) => mark(cellId(i, 0), 'new')),
    say: `Column 0 is before day 1: you are free with 0, and you cannot be holding${cooldown ? ' or cooling down' : ''} yet, so those are −∞. Then fill one column per day: each state on day t comes from the states on day t − 1.`,
    lines: ['b.start'],
    level: 2,
    vars: vars(0),
  };
  for (let t = 1; t <= n; t++) {
    const p = s.prices[t - 1]!;
    for (const q of states) {
      const ways = waysInto(q, p, cooldown, feeOf(settings));
      const res = rule(
        q,
        t,
        p,
        settings,
        (x) => T[row(x)]![t - 1]!,
        (x) => ref(x, t - 1),
      );
      T[row(q)]![t] = res.value;
      work.add('cells');
      const reads = ways.map((w, k) => ({
        from: [row(w.from), t - 1] as Cell,
        to: [row(q), t] as Cell,
        win: k === res.win && res.value !== -Infinity,
        move: { from: w.from, to: q },
      }));
      const dayDone = q === states.at(-1);
      yield {
        state: state(),
        marks: [
          mark(cellId(row(q), t), 'active'),
          mark(stateId(q), 'active'),
          ...reads.map((r) => mark(cellId(r.from[0], r.from[1]), 'compare')),
        ],
        say: `Day ${t}, price ${p}. ${ref(q, t)} = ${res.text}.${dayDone && t < n ? ` Day ${t} is done.` : ''}`,
        lines: ['b.loop', `b.${q}`],
        level: dayDone && t < n ? 1 : 2,
        vars: vars(t, { price: p, [q]: scalar(res.value) }),
        extra: { reads, at: q },
      };
    }
  }
  const end = state();
  const { best, from } = answerOf(end.T, n, settings);
  yield {
    state: end,
    marks: [mark(cellId(row(from), n), 'found')],
    say: `The answer is ${endText(settings)} = ${best}: ${best === 0 ? 'no trade makes money, so the best is never to trade' : `the most you can end with, from ${from === 'cool' ? 'a sale on the last day' : 'holding nothing at the end'}`}. The table filled ${work.get('cells')} cells, once each; plain recursion would make ${plural(tot.naive, 'call')}.${best > 0 ? ' Press Trace the plan to see the trades.' : ''}`,
    lines: ['b.ret'],
    level: 1,
    vars: { days: n, profit: best, ...workVars(work, tot) },
  };
  return end;
}

/** Plain recursion on the same rules, from the states you may end in. */
function* naive(s: S, settings: SMSettings): Gen {
  const states = statesFor(settings);
  const cooldown = settings.cooldown !== false;
  const fee = feeOf(settings);
  const n = s.prices.length;
  const tot = totals(n, cooldown);
  const work = dpWork();
  const row = (q: StateName) => states.indexOf(q);
  const calls = zeros(states.length, n + 1);
  const seen: (number | null)[][] = emptyTable(states.length, n);
  const stack: Cell[] = [];
  const extra = (more: X = {}): X => ({
    calls: copy2(calls),
    seen: copy2(seen),
    stack: [...stack],
    ...more,
  });
  const vars = (t: number, more: Record<string, Scalar> = {}) => ({
    day: t,
    depth: stack.length,
    ...more,
    ...workVars(work, tot),
  });
  const ends = endStates(cooldown);
  yield {
    state: s,
    marks: [],
    say: `Plain recursion: the answer is ${cooldown ? `max(free(${n}), cool(${n}))` : `free(${n})`}, and each call asks for the states it can come from on the day before. Nothing is stored, so a state on an early day is worked out again every time it is asked for. The corner of each cell counts its calls.`,
    lines: ['n.top'],
    level: 2,
    vars: vars(n),
    extra: extra(),
  };

  function* visit(q: StateName, t: number, caller: string | null): Generator<SMStep, number, void> {
    const r = row(q);
    work.add('calls');
    calls[r]![t]!++;
    stack.push([r, t]);
    const k = calls[r]![t]!;
    const who = `${caller ? `${caller} calls ` : ''}${callOf(q, t)}${k > 1 ? `, ${nthTime(k)} for this cell` : ''}`;
    if (t === 0) {
      const v = startValue(q);
      seen[r]![0] = v;
      yield {
        state: s,
        marks: [mark(cellId(r, 0), 'new')],
        say: `${who}. Day 0 is before day 1: ${q === 'free' ? 'free with 0' : `you cannot be ${q === 'hold' ? 'holding the item' : 'cooling down'} yet, so −∞`}. Return ${fmt(v)}.`,
        lines: ['n.sig', 'n.start'],
        level: 2,
        vars: vars(t),
        extra: extra({ at: q }),
      };
      stack.pop();
      return v;
    }
    const p = s.prices[t - 1]!;
    const ways = waysInto(q, p, cooldown, fee);
    seen[r]![t] = null;
    yield {
      state: s,
      marks: [mark(cellId(r, t), 'active'), mark(stateId(q), 'active')],
      say: `${who}.${k > 1 ? ' Nothing was kept, so it starts over.' : ''} It asks for ${ways.map((w) => callOf(w.from, t - 1)).join(' and ')}.`,
      lines: ['n.sig'],
      level: 2,
      vars: vars(t, { price: p }),
      extra: extra({ at: q }),
    };
    const got = new Map<StateName, number>();
    for (const w of ways)
      if (!got.has(w.from)) got.set(w.from, yield* visit(w.from, t - 1, callOf(q, t)));
    const res = rule(
      q,
      t,
      p,
      settings,
      (x) => got.get(x)!,
      (x) => callOf(x, t - 1),
    );
    seen[r]![t] = res.value;
    const reads = ways.map((w, i) => ({
      from: [row(w.from), t - 1] as Cell,
      to: [r, t] as Cell,
      win: i === res.win && res.value !== -Infinity,
      move: { from: w.from, to: q },
    }));
    yield {
      state: s,
      marks: [
        mark(cellId(r, t), 'new'),
        ...reads.map((x) => mark(cellId(x.from[0], x.from[1]), 'compare')),
      ],
      say: `Back in ${callOf(q, t)}: ${res.text}. Return ${fmt(res.value)}.`,
      lines: [`n.${q}`],
      level: 3,
      vars: vars(t, { price: p, [q]: scalar(res.value) }),
      extra: extra({ reads, at: q }),
    };
    stack.pop();
    return res.value;
  }

  const vals: number[] = [];
  for (const q of ends) vals.push(yield* visit(q, n, null));
  const best = Math.max(...vals);
  const most = Math.max(...calls.flat());
  const [mr, mt] = (() => {
    for (let t = 0; t <= n; t++)
      for (let r = 0; r < states.length; r++) if (calls[r]![t] === most) return [r, t];
    return [0, 0];
  })();
  yield {
    state: s,
    marks: [mark(cellId(row(ends[vals.indexOf(best)]!), n), 'found')],
    say: `The answer is ${cooldown ? `max(${vals.map(fmt).join(', ')})` : fmt(vals[0]!)} = ${best}. Plain recursion made ${plural(work.get('calls'), 'call')} for ${states.length * (n + 1)} cells: ${callOf(states[mr]!, mt)} alone was called ${most === 1 ? 'once' : `${most} times`}. The table fills each cell once.`,
    lines: ['n.top'],
    level: 1,
    vars: { days: n, profit: best, ...workVars(work, tot) },
    extra: extra({ stack: [] }),
  };
  return s;
}

const solve: Op = {
  label: 'Solve',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.T.length !== statesFor(settings).length)
      s = { ...s, T: emptyTable(statesFor(settings).length, s.prices.length) };
    return approachOf(settings) === 'naive'
      ? yield* naive(s, settings)
      : yield* bottomUp(s, settings);
  },
};

const trace: Op = {
  label: 'Trace the plan',
  arity: 0,
  *run(s, _args, { settings }) {
    const states = statesFor(settings);
    const cooldown = settings.cooldown !== false;
    const fee = feeOf(settings);
    const n = s.prices.length;
    const row = (q: StateName) => states.indexOf(q);
    if (s.T.length !== states.length || s.T[0]![n] === null || s.T[0]![n] === undefined) {
      yield refuse(
        s,
        approachOf(settings) === 'naive'
          ? 'Plain recursion keeps no table, so there is nothing to read the plan from. Set Approach to the table, then Solve and trace.'
          : 'Solve first: the trace reads the filled table back from the last day.',
      );
      return s;
    }
    const v = (q: StateName, t: number) => s.T[row(q)]![t]!;
    const { best, from } = answerOf(s.T, n, settings);
    let q = from;
    const path: Cell[] = [[row(q), n]];
    const plan: Action[] = [];
    yield {
      state: s,
      marks: [mark(cellId(row(q), n), 'active'), mark(stateId(q), 'active')],
      say: `Start at the answer, ${ref(q, n)} = ${best}. Each cell came from one way in on the day before; walk back along it, noting every buy and sell.`,
      lines: ['t.sig'],
      level: 2,
      vars: { day: n, profit: best },
      extra: { path: [...path], plan: [] },
    };
    for (let t = n; t >= 1; t--) {
      const p = s.prices[t - 1]!;
      const ways = waysInto(q, p, cooldown, fee);
      const here = v(q, t);
      const w = ways.find((x) => v(x.from, t - 1) + x.add === here)!;
      if (w.what === 'buy' || w.what === 'sell') plan.unshift({ kind: w.what, day: t });
      const was = q;
      q = w.from;
      path.push([row(q), t - 1]);
      const did =
        w.what === 'buy'
          ? `you bought on day ${t} at ${p}`
          : w.what === 'sell'
            ? `you sold on day ${t} at ${p}${fee ? ` and paid ${fee}` : ''}`
            : w.what === 'keep'
              ? `you held the item through day ${t}`
              : w.what === 'end of the cooldown'
                ? `day ${t} was the rest after a sale`
                : `you rested on day ${t}`;
      yield {
        state: s,
        marks: [
          mark(cellId(row(q), t - 1), 'active'),
          mark(cellId(row(was), t), 'found'),
          mark(moveId({ from: q, to: was }), 'active'),
        ],
        say: `${ref(was, t)} = ${fmt(here)} came from ${ref(q, t - 1)} = ${fmt(v(q, t - 1))}${sign(w.add)}: ${did}.`,
        lines: ['t.loop', w.what === 'buy' || w.what === 'sell' ? 't.trade' : 't.rest'],
        level: 2,
        vars: { day: t - 1, profit: best },
        extra: { path: [...path], plan: [...plan] },
      };
    }
    const words = plan.map((a) => `${a.kind} on day ${a.day}`);
    const planText = plan.map((a) => `${a.kind} ${a.day}`).join(' ');
    yield {
      state: s,
      marks: [mark(cellId(row(from), n), 'found')],
      say: plan.length
        ? `The best plan: ${words.join(', ')}. ${plan
            .filter((a) => a.kind === 'sell')
            .map((a) => {
              const b = [...plan].reverse().find((x) => x.kind === 'buy' && x.day < a.day)!;
              return `${s.prices[a.day - 1]} − ${s.prices[b.day - 1]}${fee ? ` − ${fee}` : ''}`;
            })
            .join(', plus ')} makes ${best}.`
        : 'The best plan is never to trade: every trade loses money, so you end with 0.',
      lines: ['t.ret'],
      level: 1,
      vars: { profit: best, plan: planText || 'none' },
      extra: { path: [...path], plan: [...plan] },
    };
    return s;
  },
};

export const ops: Record<string, Op> = { load, solve, trace };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SMSettings): PseudoBlock[] {
  const cooldown = settings.cooldown !== false;
  const fee = feeOf(settings);
  const f = fee ? ` − ${fee}` : '';
  const sellPlain = fee ? `sell today at p and pay the fee of ${fee}` : 'sell today at p';
  const naiveMode = approachOf(settings) === 'naive';
  const X = (q: StateName, t: string) => (naiveMode ? `${q}(${t})` : `${q}[${t}]`);
  const freeLine = cooldown
    ? {
        text: `free = max(${X('free', 't − 1')}, ${X('cool', 't − 1')})`,
        plain: 'free: rest, or rest the day after a sale;',
      }
    : {
        text: `free = max(${X('free', 't − 1')}, ${X('hold', 't − 1')} + p${f})`,
        plain: `free: rest, or ${sellPlain};`,
      };
  const holdLine = {
    text: `hold = max(${X('hold', 't − 1')}, ${X('free', 't − 1')} − p)`,
    plain: 'holding: keep it, or buy today at p;',
  };
  const coolLine = {
    text: `cool = ${X('hold', 't − 1')} + p${f}`,
    plain: `cooling down: ${sellPlain}.`,
  };
  const traceBlock: PseudoBlock = {
    op: 'trace',
    lines: [
      L('t.sig', 0, 'tracePlan(T)', 'To find the trades, start at the answer’s cell:'),
      L('t.loop', 1, 'for t = n down to 1', 'go back one day at a time,'),
      L(
        't.trade',
        2,
        'if the way in was a buy or a sell: note it',
        'noting a buy or a sell when the way in was one;',
      ),
      L(
        't.rest',
        2,
        'move to the state it came from on day t − 1',
        'and move to the state it came from.',
      ),
      L('t.ret', 1, 'return the trades, first day first', 'The notes, in order, are the plan.'),
    ],
  };
  const lines = (P: string): PseudoLine[] => [
    L(
      `${P}.free`,
      P === 'b' ? 2 : 1,
      naiveMode
        ? `${freeLine.text.replace('free = ', 'free(t) = ')}`
        : `${freeLine.text.replace('free = ', 'free[t] = ')}`,
      freeLine.plain,
    ),
    L(
      `${P}.hold`,
      P === 'b' ? 2 : 1,
      naiveMode
        ? holdLine.text.replace('hold = ', 'hold(t) = ')
        : holdLine.text.replace('hold = ', 'hold[t] = '),
      holdLine.plain,
    ),
    ...(cooldown
      ? [
          L(
            `${P}.cool`,
            P === 'b' ? 2 : 1,
            naiveMode
              ? coolLine.text.replace('cool = ', 'cool(t) = ')
              : coolLine.text.replace('cool = ', 'cool[t] = '),
            coolLine.plain,
          ),
        ]
      : []),
  ];
  if (naiveMode)
    return [
      {
        op: 'solve',
        lines: [
          L(
            'n.top',
            0,
            `answer = ${cooldown ? 'max(free(n), cool(n))' : 'free(n)'}`,
            cooldown
              ? 'The answer is the better of ending free and ending on a sale.'
              : 'The answer is ending with nothing held.',
          ),
          L(
            'n.sig',
            0,
            'state(t), for each state',
            'Each state on day t, with p the price that day:',
          ),
          L(
            'n.start',
            1,
            'if t = 0: return 0 for free, −∞ otherwise',
            'before day 1 you are free with 0, and nothing else is possible;',
          ),
          ...lines('n'),
        ],
      },
      traceBlock,
    ];
  return [
    {
      op: 'solve',
      lines: [
        L('b.sig', 0, 'solve(p[1..n])', 'To fill the table, one column per day:'),
        L(
          'b.start',
          1,
          `free[0] = 0; hold[0] = −∞${cooldown ? '; cool[0] = −∞' : ''}`,
          'before day 1 you are free with 0, and nothing else is possible;',
        ),
        L(
          'b.loop',
          1,
          'for t = 1 to n, with p = p[t]',
          'then day by day, with p that day’s price:',
        ),
        ...lines('b'),
        L(
          'b.ret',
          1,
          `return ${endText(settings)}`,
          cooldown
            ? 'The answer is the better of ending free and ending on a sale.'
            : 'The answer is ending with nothing held.',
        ),
      ],
    },
    traceBlock,
  ];
}

// ----- Start -----

export function init(settings: SMSettings): S {
  return {
    prices: [...START_PRICES],
    T: emptyTable(statesFor(settings).length, START_PRICES.length),
  };
}

export function describe(s: S, settings?: SMSettings): string {
  const states = statesFor(settings ?? defaults);
  const rows = states.map(
    (q, i) => `${q}: ${(s.T[i] ?? []).map((v) => (v === null ? 'empty' : fmt(v))).join(', ')}`,
  );
  return `${s.prices.length} days, priced ${s.prices.join(', ')}. Table by state, from day 0: ${rows.join('; ')}.`;
}

export function initialSay(s: S, settings: SMSettings): string {
  const rules = [
    settings.cooldown !== false ? 'after a sale you rest a day' : '',
    feeOf(settings) ? `each sale costs ${feeOf(settings)}` : '',
  ].filter(Boolean);
  return `One item, one price per day. Each day buy it, sell it or rest; hold at most one${rules.length ? `, and ${rules.join(' and ')}` : ''}. Press Solve for the most you can end with, or type prices and press Load prices.`;
}

export const initialVars = (s: S) => ({ days: s.prices.length });
