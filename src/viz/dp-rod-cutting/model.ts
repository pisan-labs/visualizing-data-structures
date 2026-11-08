import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { andList, cellId, mark, plural } from '../_dp/kit';

export const MAX_N = 10;
export const MAX_PRICE = 60;

export interface RodState {
  /** p[i] is the price of a piece of length i, for i = 1..n (p[0] is unused, 0). */
  p: number[];
  /** r[j], the best revenue for a rod of length j; null where not filled yet. */
  r: (number | null)[];
  /** s[j], the length of the first piece in a best cut of length j (0 for j = 0). */
  s: (number | null)[];
}

export interface RodSettings {
  [key: string]: Scalar;
  style: 'bottomup' | 'memo';
}

/** View-only data for one step. */
export interface RodExtra {
  /** The length being filled, the candidate being tried (first piece i), and the best so far. */
  at?: number;
  tryCut?: number;
  bestCut?: number;
  /** Top-down: the arguments of the calls on the stack, outermost first. */
  stack?: number[];
  hit?: number;
  /** Cutting: the pieces cut off so far, in order, and the length still to cut. */
  pieces?: number[];
  rest?: number;
}

type S = RodState;
type X = RodExtra;
type Op = OpSpec<S, RodSettings, X>;
type RodStep = Step<S, X>;
type Gen = Generator<RodStep, S, void>;

export const defaults: RodSettings = { style: 'bottomup' };

/** The prices of the textbook rod, lengths 1 to 8. */
export const START_PRICES = [1, 5, 8, 9, 10, 17, 17, 20];

export const nOf = (s: S) => s.p.length - 1;

export const emptyRow = (n: number): (number | null)[] => Array<number | null>(n + 1).fill(null);

export function stateFor(prices: number[]): S {
  return { p: [0, ...prices], r: emptyRow(prices.length), s: emptyRow(prices.length) };
}

export function init(): S {
  return stateFor(START_PRICES);
}

/** Shape ids: row 0 holds the prices, row 1 the revenues r, row 2 the first cuts s. */
export const priceId = (i: number) => cellId(0, i);
export const revId = (j: number) => cellId(1, j);
export const cutId = (j: number) => cellId(2, j);
export const frameId = (j: number) => `frame-${j}`;
export const pieceId = (k: number) => `piece-${k}`;

export const pricesText = (s: S) => s.p.slice(1).join(' ');

/** Read "1 5 8 9" into prices, or say what is wrong. */
export function pricesFromArg(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const how = `Type the price of each length, 1 first, such as 1 5 8 9: whole numbers from 0 to ${MAX_PRICE}.`;
  if (tokens.length === 0) return how;
  if (tokens.length > MAX_N) return `That is ${tokens.length} prices. Use at most ${MAX_N}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `"${t}" is not a price. ${how}`;
    const v = Number(t);
    if (v > MAX_PRICE) return `${v} is too large. ${how}`;
    out.push(v);
  }
  return out;
}

export const isFull = (s: S) => s.r.every((v) => v !== null);

/** The pieces a full table says to cut, first piece first. */
export function piecesOf(s: S): number[] {
  const out: number[] = [];
  let j = nOf(s);
  while (j > 0) {
    out.push(s.s[j]!);
    j -= s.s[j]!;
  }
  return out;
}

/** Greedy by price per unit: keep cutting off the length with the best p[i] / i that fits. */
export function greedyCut(p: number[], n: number): { pieces: number[]; value: number } {
  const pieces: number[] = [];
  let left = n;
  let value = 0;
  while (left > 0) {
    let best = 1;
    for (let i = 2; i <= left; i++) if (p[i]! * best >= p[best]! * i) best = i;
    pieces.push(best);
    value += p[best]!;
    left -= best;
  }
  return { pieces, value };
}

interface Count {
  sums: number;
}

/**
 * Fill r[j] (and s[j]) from the shorter lengths, one step per first piece tried and one to
 * store the best. `memo` names the top-down pseudocode lines, for the "next length" button.
 */
function* fillLength(
  p: number[],
  r: (number | null)[],
  s: (number | null)[],
  j: number,
  count: Count,
  memo: boolean,
  last: boolean,
): Generator<RodStep, void, void> {
  const n = p.length - 1;
  const state = (): S => ({ p, r: [...r], s: [...s] });
  let q = -Infinity;
  let best = 0;
  for (let i = 1; i <= j; i++) {
    const cand = p[i]! + r[j - i]!;
    count.sums++;
    const better = cand > q;
    const was = q;
    const wasBest = best;
    if (better) {
      q = cand;
      best = i;
    }
    yield {
      state: state(),
      marks: [mark(revId(j), 'active'), mark(priceId(i), 'compare'), mark(revId(j - i), 'compare')],
      say:
        `First piece ${i}: p[${i}] + r[${j - i}] = ${p[i]} + ${r[j - i]} = ${cand}.` +
        (was === -Infinity
          ? ' The best so far.'
          : better
            ? ` Better than ${was}.`
            : ` Not better than ${was} (a first piece of ${wasBest}).`),
      lines: memo
        ? better
          ? ['m.loop', 'm.max', 'm.keep']
          : ['m.loop', 'm.max']
        : better
          ? ['b.inner', 'b.max', 'b.keep']
          : ['b.inner', 'b.max'],
      vars: { n, j, i, q, sums: count.sums },
      level: 3,
      extra: { at: j, tryCut: i, bestCut: best },
    };
  }
  r[j] = q;
  s[j] = best;
  yield {
    state: state(),
    marks: [mark(revId(j), 'new'), mark(cutId(j), 'new'), mark(priceId(best), 'compare')],
    say: `r[${j}] = ${q}, with a first piece of length ${best}: p[${best}] + r[${j - best}] = ${p[best]} + ${r[j - best]}.${j === best ? ' Selling it whole is best.' : ''}`,
    lines: memo ? ['m.store'] : ['b.outer', 'b.store'],
    vars: { n, j, q, sums: count.sums },
    level: last ? 1 : 2,
    extra: { at: j, bestCut: best },
  };
}

function* bottomUp(start: S): Gen {
  const { p } = start;
  const n = nOf(start);
  const r = emptyRow(n);
  const s = emptyRow(n);
  const state = (): S => ({ p, r: [...r], s: [...s] });
  const count = { sums: 0 };
  r[0] = 0;
  s[0] = 0;
  yield {
    state: state(),
    marks: [mark(revId(0), 'new')],
    say: `r[0] = 0: a rod of length 0 sells for nothing. Now fill r[1] to r[${n}], each from the shorter lengths.`,
    lines: ['b.base'],
    vars: { n, j: 0, sums: 0 },
    level: 2,
    extra: { at: 0 },
  };
  for (let j = 1; j <= n; j++) yield* fillLength(p, r, s, j, count, false, false);
  const end = state();
  yield {
    state: end,
    marks: [mark(revId(n), 'found')],
    say: `r[${n}] = ${r[n]}: the most a rod of length ${n} can earn. That took ${plural(count.sums, 'sum')}, n(n + 1)/2. Press Cut the rod to see the pieces.`,
    lines: ['b.ret'],
    vars: { n, best: r[n]!, sums: count.sums },
    level: 1,
  };
  return end;
}

function* topDown(start: S): Gen {
  const { p } = start;
  const n = nOf(start);
  const r = emptyRow(n);
  const s = emptyRow(n);
  const state = (): S => ({ p, r: [...r], s: [...s] });
  const stack: number[] = [];
  let calls = 0;
  let hits = 0;
  const vars = (j: number) => ({ n, j, calls, hits, depth: stack.length });
  yield {
    state: state(),
    marks: [],
    say: `Make an empty memo r[0..${n}] and call memoCut(${n}). Each call looks in the memo first, and stores its answer there before it returns.`,
    lines: ['m.sig'],
    vars: { n, calls, hits },
    level: 2,
  };

  function* call(j: number, caller: number | null): Generator<RodStep, number, void> {
    calls++;
    stack.push(j);
    const who = caller === null ? `memoCut(${j})` : `memoCut(${caller}) calls memoCut(${j})`;
    if (r[j] !== null) {
      hits++;
      yield {
        state: state(),
        marks: [mark(revId(j), 'found'), mark(frameId(j), 'found')],
        say: `${who}: r[${j}] = ${r[j]} is already in the memo, so it returns at once.`,
        lines: ['m.check', 'm.hit'],
        vars: vars(j),
        level: 3,
        extra: { stack: [...stack], hit: j, at: j },
      };
      stack.pop();
      return r[j]!;
    }
    if (j === 0) {
      r[0] = 0;
      s[0] = 0;
      yield {
        state: state(),
        marks: [mark(revId(0), 'new'), mark(frameId(0), 'active')],
        say: `${who}: length 0 earns nothing. Store r[0] = 0 and return it.`,
        lines: ['m.check', 'm.base', 'm.store'],
        vars: vars(0),
        level: 2,
        extra: { stack: [...stack], at: 0 },
      };
      stack.pop();
      return 0;
    }
    yield {
      state: state(),
      marks: [mark(revId(j), 'active'), mark(frameId(j), 'active')],
      say: `${who}: r[${j}] is not in the memo, so try every first piece, 1 to ${j}.`,
      lines: ['m.check', 'm.loop'],
      vars: vars(j),
      level: 3,
      extra: { stack: [...stack], at: j },
    };
    let q = -Infinity;
    let best = 0;
    for (let i = 1; i <= j; i++) {
      const sub = yield* call(j - i, j);
      const cand = p[i]! + sub;
      const better = cand > q;
      const was = q;
      if (better) {
        q = cand;
        best = i;
      }
      yield {
        state: state(),
        marks: [
          mark(revId(j), 'active'),
          mark(frameId(j), 'active'),
          mark(priceId(i), 'compare'),
          mark(revId(j - i), 'compare'),
        ],
        say:
          `Back in memoCut(${j}), first piece ${i}: p[${i}] + r[${j - i}] = ${p[i]} + ${sub} = ${cand}.` +
          (was === -Infinity
            ? ' The best so far.'
            : better
              ? ` Better than ${was}.`
              : ` Not better than ${was}.`),
        lines: better ? ['m.loop', 'm.max', 'm.keep'] : ['m.loop', 'm.max'],
        vars: { ...vars(j), i, q },
        level: 3,
        extra: { stack: [...stack], at: j, tryCut: i, bestCut: best },
      };
    }
    r[j] = q;
    s[j] = best;
    yield {
      state: state(),
      marks: [mark(revId(j), 'new'), mark(cutId(j), 'new'), mark(frameId(j), 'active')],
      say: `memoCut(${j}) stores r[${j}] = ${q} (first piece ${best}) in the memo and returns it.`,
      lines: ['m.store'],
      vars: { ...vars(j), q },
      level: 2,
      extra: { stack: [...stack], at: j, bestCut: best },
    };
    stack.pop();
    return q;
  }

  const best = yield* call(n, null);
  const end = state();
  yield {
    state: end,
    marks: [mark(revId(n), 'found')],
    say: `memoCut(${n}) returns ${best}: the most a rod of length ${n} can earn. ${plural(calls, 'call')}, ${plural(hits, 'memo hit')}. Press Cut the rod to see the pieces.`,
    lines: ['m.ret'],
    vars: { n, best, calls, hits },
    level: 1,
  };
  return end;
}

const fill: Op = {
  label: 'Fill the table',
  arity: 0,
  *run(s, _args, { settings }): Gen {
    const n = nOf(s);
    if (isFull(s)) {
      yield {
        state: s,
        marks: [mark(revId(n), 'found')],
        say: `The table is already full: r[${n}] = ${s.r[n]}. Press Cut the rod, or type new prices.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    return yield* settings.style === 'memo' ? topDown(s) : bottomUp(s);
  },
};

const next: Op = {
  label: 'Fill the next length',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const n = nOf(st);
    const memo = settings.style === 'memo';
    if (isFull(st)) {
      yield {
        state: st,
        marks: [mark(revId(n), 'found')],
        say: `Every length is filled already: r[${n}] = ${st.r[n]}. Press Cut the rod, or type new prices.`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const r = [...st.r];
    const s = [...st.s];
    const j = r.indexOf(null);
    if (j === 0) {
      r[0] = 0;
      s[0] = 0;
      const next: S = { p: st.p, r, s };
      yield {
        state: next,
        marks: [mark(revId(0), 'new')],
        say: 'r[0] = 0: a rod of length 0 sells for nothing.',
        lines: [memo ? 'm.base' : 'b.base'],
        vars: { n, j: 0 },
        level: 1,
        extra: { at: 0 },
      };
      return next;
    }
    yield* fillLength(st.p, r, s, j, { sums: 0 }, memo, true);
    return { p: st.p, r, s };
  },
};

const cut: Op = {
  label: 'Cut the rod',
  arity: 0,
  *run(s): Gen {
    const n = nOf(s);
    if (!isFull(s)) {
      yield {
        state: s,
        marks: [mark(revId(n), 'error')],
        say: `Fill the table first. The cuts are read from s[${n}] and the cells it points to, and those are not there yet.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const pieces: number[] = [];
    let j = n;
    yield {
      state: s,
      marks: [mark(cutId(n), 'active')],
      say: `Start with the whole rod, length ${n}. s[${n}] says where the first cut goes.`,
      lines: ['c.sig'],
      vars: { j, revenue: s.r[n]! },
      level: 2,
      extra: { pieces: [], rest: n },
    };
    while (j > 0) {
      const k = s.s[j]!;
      pieces.push(k);
      const left = j - k;
      yield {
        state: s,
        marks: [
          mark(cutId(j), 'found'),
          mark(priceId(k), 'compare'),
          mark(pieceId(pieces.length - 1), 'found'),
        ],
        say:
          left > 0
            ? `s[${j}] = ${k}: cut off a piece of length ${k} (worth ${s.p[k]}). Length ${left} is left; look at s[${left}].`
            : `s[${j}] = ${k}: the last piece, length ${k} (worth ${s.p[k]}). Nothing is left.`,
        lines: ['c.loop', 'c.print'],
        vars: { j: left, piece: k, revenue: s.r[n]! },
        level: 2,
        extra: { pieces: [...pieces], rest: left },
      };
      j = left;
    }
    const worth = pieces.map((k) => s.p[k]!);
    const g = greedyCut(s.p, n);
    const greedySay =
      g.value < s.r[n]!
        ? ` Greedy by price per unit cuts ${andList(g.pieces)} and earns only ${g.value}.`
        : '';
    yield {
      state: s,
      marks: [mark(revId(n), 'found')],
      say:
        (pieces.length === 1
          ? `Sell the rod whole: length ${n} earns ${s.r[n]}. No cut does better.`
          : `Cut into ${andList(pieces)}: ${worth.join(' + ')} = ${s.r[n]}.`) + greedySay,
      lines: ['c.ret'],
      vars: { revenue: s.r[n]!, pieces: pieces.join(' '), greedy: g.value },
      level: 1,
      extra: { pieces: [...pieces], rest: 0 },
    };
    return s;
  },
};

const pricesOp: Op = {
  label: 'Set prices',
  arity: 1,
  *run(s, [arg]): Gen {
    const prices = pricesFromArg(arg);
    if (typeof prices === 'string') {
      yield {
        state: s,
        marks: [],
        say: `The prices stay as they were. ${prices}`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const next = stateFor(prices);
    yield {
      state: next,
      marks: [],
      say: `A rod of length ${prices.length}. A piece of length i sells for p[i]: ${prices.map((v, k) => `p[${k + 1}] = ${v}`).join(', ')}. Press Fill the table.`,
      lines: [],
      vars: { n: prices.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { prices: pricesOp, fill, next, cut };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RodSettings): PseudoBlock[] {
  const fillBlock: PseudoBlock =
    settings.style === 'memo'
      ? {
          op: 'fill',
          lines: [
            L(
              'm.sig',
              0,
              'memoCut(p, j)   // memo r[0..n] starts empty',
              'To find the best revenue for length j, top-down:',
            ),
            L('m.check', 1, 'if r[j] is known', 'if the memo has it,'),
            L('m.hit', 2, 'return r[j]', 'return it at once.'),
            L('m.base', 1, 'if j == 0: q = 0', 'Length 0 earns nothing.'),
            L('m.loop', 1, 'else q = -∞; for i = 1 to j', 'Otherwise try every first piece i:'),
            L(
              'm.max',
              2,
              'if p[i] + memoCut(p, j - i) > q',
              'if its price plus the best for the rest beats q,',
            ),
            L(
              'm.keep',
              3,
              'q = p[i] + r[j - i]; s[j] = i',
              'keep it, and remember the first piece.',
            ),
            L('m.store', 1, 'r[j] = q; return q', 'Store the answer in the memo and return it.'),
            L(
              'm.ret',
              0,
              'answer: memoCut(p, n)',
              'The first call returns the best revenue for the whole rod.',
            ),
          ],
        }
      : {
          op: 'fill',
          lines: [
            L('b.sig', 0, 'bottomUpCutRod(p, n)', 'To fill the table for a rod of length n:'),
            L('b.base', 1, 'r[0] = 0', 'Length 0 earns nothing.'),
            L('b.outer', 1, 'for j = 1 to n', 'For each length j, shortest first:'),
            L('b.inner', 2, 'q = -∞; for i = 1 to j', 'try every first piece i,'),
            L(
              'b.max',
              3,
              'if q < p[i] + r[j - i]',
              'and if its price plus the best for the rest beats q,',
            ),
            L(
              'b.keep',
              4,
              'q = p[i] + r[j - i]; s[j] = i',
              'keep it, and remember the first piece.',
            ),
            L('b.store', 2, 'r[j] = q', 'The best is the revenue for length j.'),
            L('b.ret', 1, 'return r and s', 'r[n] is the answer; s says how to cut.'),
          ],
        };
  return [
    fillBlock,
    {
      op: 'cut',
      lines: [
        L('c.sig', 0, 'printCutRod(s, n)', 'To list the pieces:'),
        L('c.loop', 1, 'while n > 0', 'while some rod is left,'),
        L(
          'c.print',
          2,
          'print s[n]; n = n - s[n]',
          'cut off the first piece s[n] and keep going with the rest.',
        ),
        L('c.ret', 1, 'the pieces add up to r[n]', 'Their prices add up to the best revenue.'),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  const n = nOf(state);
  return `A rod of length ${n}, and the price of a piece of each length from 1 to ${n}. How should you cut it to earn the most? Press Fill the table, or type new prices.`;
}

export function initialVars(state: S) {
  return { n: nOf(state) };
}

const show = (v: number | null) => (v === null ? 'empty' : String(v));

export function describe(state: S): string {
  const n = nOf(state);
  return `Rod of length ${n}. Prices p[1..${n}]: ${state.p.slice(1).join(', ')}. Revenue r[0..${n}]: ${state.r.map(show).join(', ')}. First cut s[1..${n}]: ${state.s.slice(1).map(show).join(', ')}.`;
}
