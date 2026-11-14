/**
 * DP over intervals: a row of items, and a best order to deal with them that is decided by
 * solving every stretch of the row [a..b] from its shorter stretches. Two problems (a setting):
 *
 * - remove (the default): numbered tiles sit in a row between two end posts worth 1. Taking a
 *   tile scores its number times the numbers of the two things beside it at that moment, and the
 *   row closes up. Take every tile; what is the best total? Solve [a..b] by the tile k taken LAST
 *   in it: by then its neighbours are a − 1 and b + 1, which are still there, and [a..k − 1] and
 *   [k + 1..b] were cleared before it, each on its own:
 *     B[a][b] = max over a ≤ k ≤ b of B[a][k − 1] + B[k + 1][b] + v[a − 1]·v[k]·v[b + 1],
 *   with B of an empty stretch 0 and v[0] = v[n + 1] = 1 (the posts).
 * - merge: piles in a row. Merging two neighbouring piles costs their total size. Merge them all
 *   into one at the least cost. Solve [a..b] by the split k of its LAST merge, [a..k] with
 *   [k + 1..b]; that merge costs the whole stretch's size:
 *     M[a][b] = min over a ≤ k < b of M[a][k] + M[k + 1][b] + (v[a] + … + v[b]), M[a][a] = 0.
 *
 * The table fills by length: every stretch of 1, then of 2, ..., then the whole row, so the
 * shorter stretches a cell reads are ready. The naive approach is plain recursion on the same
 * rule: a stretch is solved again every time a longer one asks for it, 3^(n − 1) calls for the
 * whole row. Work units (../_dp2/kit.ts): `calls`, `cells` and `choices` (one k tried).
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
import { copy2, dpWork, nthTime, zeros } from '../_dp2/kit';

export const MAX_N = 6;
export const MAX_TILE = 9;
export const MAX_PILE = 20;

export type Problem = 'remove' | 'merge';

export interface IVSettings {
  [key: string]: Scalar;
  approach: Approach;
  problem: Problem;
}

export const defaults: IVSettings = { approach: 'pattern', problem: 'remove' };

export interface IVState {
  /** The items, tiles 1..n as v[0..n − 1]. */
  v: number[];
  /** best[a][b] for the stretch of items a + 1..b + 1 (0-based a ≤ b); null where empty. */
  best: (number | null)[][];
  /** The best k (0-based item) for each stretch: the tile taken last, or where the last merge splits. */
  K: (number | null)[][];
}

/** A stretch of items, 0-based, both ends included. */
export interface Span {
  a: number;
  b: number;
}

export interface IVExtra {
  /** The stretch being solved and the k being tried (0-based). */
  span?: Span;
  k?: number;
  /** Recursion: calls made on each stretch. */
  calls?: number[][];
  /** Plain recursion: what each stretch's last call returned (nothing is kept). */
  seen?: (number | null)[][];
  seenK?: (number | null)[][];
  /** Recursion: the stretches of the calls on the stack, outermost first. */
  stack?: Span[];
  /** The cells a candidate reads: [row, col] of the stretches either side of k. */
  reads?: { from: [number, number]; to: [number, number]; best: boolean }[];
  /** The trace: what is left of the row (tiles not yet taken, or the piles as merged so far). */
  left?: Span[];
  /** The trace: stretches walked so far. */
  walked?: Span[];
}

type S = IVState;
type X = IVExtra;
export type IVStep = Step<S, X>;
type Op = OpSpec<S, IVSettings, X>;
type Gen = Generator<IVStep, S, void>;

export const START = [5, 6, 1, 4];

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
/** Shape ids: the table cell of stretch [a..b] (0-based), and an item in the strip. */
export const cellId = (a: number, b: number) => `cell-${a}-${b}`;
export const itemId = (i: number) => `item-${i}`;

export const square = (n: number) =>
  Array.from({ length: n }, () => Array<number | null>(n).fill(null));
export const stateFor = (v: number[]): S => ({ v, best: square(v.length), K: square(v.length) });

// ----- Input -----

export function readItems(arg: Value | undefined, problem: Problem): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const max = problem === 'merge' ? MAX_PILE : MAX_TILE;
  const what = problem === 'merge' ? 'pile sizes' : 'tile numbers';
  const how = `Type 1 to ${MAX_N} ${what}, whole numbers from 1 to ${max}, such as 3 1 5 8.`;
  if (tokens.length === 0) return how;
  if (tokens.length > MAX_N) return `That is ${tokens.length} items. Use at most ${MAX_N}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `"${t}" is not a whole number. ${how}`;
    const x = Number(t);
    if (x < 1 || x > max) return `${x} is out of range. ${how}`;
    out.push(x);
  }
  return out;
}

// ----- The rule, without steps -----

/** The value beside the row: the posts, worth 1. `i` is 0-based; −1 and n are the posts. */
export const at = (v: readonly number[], i: number) => (i < 0 || i >= v.length ? 1 : v[i]!);

export const sumOf = (v: readonly number[], a: number, b: number) => {
  let s = 0;
  for (let i = a; i <= b; i++) s += v[i]!;
  return s;
};

/** The ks [a..b] tries: every item (remove), or every split but the last item (merge). */
export const choicesFor = (p: Problem, a: number, b: number): number[] => {
  const out: number[] = [];
  for (let k = a; k <= (p === 'merge' ? b - 1 : b); k++) out.push(k);
  return out;
};

/** A candidate's value from its two sides' values. */
export function candidate(
  p: Problem,
  v: readonly number[],
  a: number,
  b: number,
  k: number,
  left: number,
  right: number,
): number {
  return p === 'merge'
    ? left + right + sumOf(v, a, b)
    : left + right + at(v, a - 1) * v[k]! * at(v, b + 1);
}

/** The two sides of k: [a..k − 1] and [k + 1..b] (remove), or [a..k] and [k + 1..b] (merge). */
export const sides = (p: Problem, a: number, b: number, k: number): [Span, Span] =>
  p === 'merge'
    ? [
        { a, b: k },
        { a: k + 1, b },
      ]
    : [
        { a, b: k - 1 },
        { a: k + 1, b },
      ];

/** The whole table, bottom-up by length, and the best k of each stretch (the first on a tie). */
export function solveTable(v: readonly number[], p: Problem): { best: number[][]; K: number[][] } {
  const n = v.length;
  const best = zeros(n, n);
  const K = zeros(n, n);
  const get = (s: Span) => (s.a > s.b ? 0 : best[s.a]![s.b]!);
  for (let len = 1; len <= n; len++)
    for (let a = 0; a + len - 1 < n; a++) {
      const b = a + len - 1;
      if (p === 'merge' && a === b) {
        best[a]![b] = 0;
        K[a]![b] = a;
        continue;
      }
      let top: number | null = null;
      for (const k of choicesFor(p, a, b)) {
        const [l, r] = sides(p, a, b, k);
        const c = candidate(p, v, a, b, k, get(l), get(r));
        if (top === null || (p === 'merge' ? c < top : c > top)) {
          top = c;
          K[a]![b] = k;
        }
      }
      best[a]![b] = top!;
    }
  return { best, K };
}

/** Calls and choices plain recursion makes on a stretch of each length. */
function naiveCount(p: Problem, len: number): { calls: number; choices: number } {
  const memo: { calls: number; choices: number }[] = [{ calls: 0, choices: 0 }];
  for (let L = 1; L <= len; L++) {
    let calls = 1;
    let choices = 0;
    if (!(p === 'merge' && L === 1))
      for (let k = 0; k < (p === 'merge' ? L - 1 : L); k++) {
        choices++;
        const [x, y] = p === 'merge' ? [k + 1, L - k - 1] : [k, L - k - 1];
        calls += memo[x]!.calls + memo[y]!.calls;
        choices += memo[x]!.choices + memo[y]!.choices;
      }
    memo.push({ calls, choices });
  }
  return memo[len]!;
}

export function totals(n: number, p: Problem): Totals {
  const naive = naiveCount(p, n);
  let choices = 0;
  for (let L = 1; L <= n; L++) choices += (n - L + 1) * (p === 'merge' ? L - 1 : L);
  return { naive: naive.calls + naive.choices, pattern: (n * (n + 1)) / 2 + choices };
}

export const naiveCalls = (n: number, p: Problem) => naiveCount(p, n).calls;

/** The order the best plan takes tiles (1-based), or its merges as brackets of pile sizes. */
export function planOf(
  v: readonly number[],
  K: readonly (readonly (number | null)[])[],
  p: Problem,
): string {
  const n = v.length;
  if (p === 'merge') {
    const br = (a: number, b: number): string => {
      if (a === b) return String(v[a]);
      const k = K[a]![b]!;
      return `(${br(a, k)} ${br(k + 1, b)})`;
    };
    return br(0, n - 1);
  }
  const order: number[] = [];
  const go = (a: number, b: number) => {
    if (a > b) return;
    const k = K[a]![b]!;
    go(a, k - 1);
    go(k + 1, b);
    order.push(k + 1);
  };
  go(0, n - 1);
  return order.join(' ');
}

// ----- Text -----

const T = (p: Problem) => (p === 'merge' ? 'M' : 'B');
const F = (p: Problem) => (p === 'merge' ? 'cost' : 'best');
/** "B[2][4]", 1-based. */
const ref = (p: Problem, s: Span) => `${T(p)}[${s.a + 1}][${s.b + 1}]`;
const call = (p: Problem, s: Span) => `${F(p)}(${s.a + 1}, ${s.b + 1})`;
/** "tiles 2 to 4", "tile 3". */
export const stretch = (p: Problem, s: Span) => {
  const noun = p === 'merge' ? 'pile' : 'tile';
  return s.a === s.b ? `${noun} ${s.a + 1}` : `${noun}s ${s.a + 1} to ${s.b + 1}`;
};

/** A candidate in words and numbers. */
function candText(
  p: Problem,
  v: readonly number[],
  s: Span,
  k: number,
  get: (x: Span) => number,
  form: (x: Span) => string,
): { value: number; text: string } {
  const [l, r] = sides(p, s.a, s.b, k);
  const lv = l.a > l.b ? 0 : get(l);
  const rv = r.a > r.b ? 0 : get(r);
  const value = candidate(p, v, s.a, s.b, k, lv, rv);
  const parts: { f: string; n: string }[] = [];
  if (l.a <= l.b) parts.push({ f: form(l), n: String(lv) });
  if (r.a <= r.b) parts.push({ f: form(r), n: String(rv) });
  if (p === 'merge') {
    const sum = sumOf(v, s.a, s.b);
    return {
      value,
      text: `split after pile ${k + 1}: ${parts.map((x) => x.f).join(' + ')} + the stretch’s size = ${parts.map((x) => x.n).join(' + ')} + ${sum} = ${value}`,
    };
  }
  const L = at(v, s.a - 1);
  const R = at(v, s.b + 1);
  const score = `${L} × ${v[k]} × ${R}`;
  return {
    value,
    text: `tile ${k + 1} last: ${parts.length ? `${parts.map((x) => x.f).join(' + ')} + ` : ''}${score} = ${parts.length ? `${parts.map((x) => x.n).join(' + ')} + ` : ''}${L * v[k]! * R} = ${value}`,
  };
}

const beside = (v: readonly number[], s: Span) => {
  const side = (i: number) => (i < 0 || i >= v.length ? 'the post (1)' : `tile ${i + 1} (${v[i]})`);
  return `${side(s.a - 1)} and ${side(s.b + 1)}`;
};

// ----- Steps -----

function refuse(s: S, why: string): IVStep {
  return { state: s, marks: [], say: why, lines: [], level: 1, vars: { n: s.v.length } };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const v = readItems(arg, settings.problem);
    if (typeof v === 'string') {
      yield refuse(s, `The row stays as it was. ${v}`);
      return s;
    }
    const next = stateFor(v);
    yield {
      state: next,
      marks: [],
      say: `${v.length === 1 ? 'One' : v.length} ${settings.problem === 'merge' ? (v.length === 1 ? 'pile' : 'piles') : v.length === 1 ? 'tile' : 'tiles'}: ${v.join(', ')}. Press Solve.`,
      lines: [],
      level: 1,
      vars: { n: v.length },
    };
    return next;
  },
};

const better = (p: Problem, c: number, top: number | null) =>
  top === null || (p === 'merge' ? c < top : c > top);

const finalText = (p: Problem, v: number, n: number) =>
  p === 'merge'
    ? `Merging all ${n} piles costs at least ${v}`
    : n === 1
      ? `The best total for the one tile is ${v}`
      : `The best total for all ${n} tiles is ${v}`;

/** The pattern: every stretch, shortest first. */
function* bottomUp(s: S, settings: IVSettings): Gen {
  const p = settings.problem;
  const { v } = s;
  const n = v.length;
  const best = square(n);
  const K = square(n);
  const tot = totals(n, p);
  const work = dpWork('choices');
  const state = (): S => ({ v, best: copy2(best), K: copy2(K) });
  const get = (x: Span) => best[x.a]![x.b]!;
  const vars = (x: Span, more: Record<string, Scalar> = {}) => ({
    a: x.a + 1,
    b: x.b + 1,
    length: x.b - x.a + 1,
    ...more,
    ...workVars(work, tot),
  });
  yield {
    state: state(),
    marks: [],
    say:
      p === 'merge'
        ? `Fill M by length: every stretch of 1 pile, then of 2, up to all ${n}. A stretch is solved by where its last merge splits it, and both halves are shorter, so they are ready.`
        : `Fill B by length: every stretch of 1 tile, then of 2, up to all ${n}. A stretch is solved by the tile taken last in it, and the two sides of that tile are shorter, so they are ready.`,
    lines: ['b.sig'],
    level: 2,
    vars: vars({ a: 0, b: n - 1 }),
  };
  for (let len = 1; len <= n; len++)
    for (let a = 0; a + len - 1 < n; a++) {
      const b = a + len - 1;
      const span = { a, b };
      if (p === 'merge' && a === b) {
        best[a]![a] = 0;
        K[a]![a] = a;
        work.add('cells');
        yield {
          state: state(),
          marks: [mark(cellId(a, a), 'active'), mark(itemId(a), 'active')],
          say: `${ref(p, span)} = 0: one pile is already merged.`,
          lines: ['b.len', 'b.one'],
          level: len === 1 && a === n - 1 && n > 1 ? 1 : 2,
          vars: vars(span, { [T(p)]: 0 }),
          extra: { span },
        };
        continue;
      }
      let top: number | null = null;
      let topK = a;
      const ks = choicesFor(p, a, b);
      for (const k of ks) {
        const c = candText(p, v, span, k, get, (x) => ref(p, x));
        work.add('choices');
        const wins = better(p, c.value, top);
        if (wins) {
          top = c.value;
          topK = k;
        }
        if (ks.length > 1)
          yield {
            state: state(),
            marks: [mark(cellId(a, b), 'active')],
            say: `${ref(p, span)}, ${c.text}.${wins ? (k === a ? ' The first try.' : ' The best so far.') : ` Not ${p === 'merge' ? 'cheaper' : 'better'} than ${top}.`}`,
            lines: ['b.len', 'b.try'],
            level: 3,
            vars: vars(span, { k: k + 1 }),
            extra: { span, k, reads: readsOf(p, span, k, wins) },
          };
      }
      best[a]![b] = top!;
      K[a]![b] = topK;
      work.add('cells');
      const lastOfLen = a + len === n && len < n;
      const why =
        ks.length === 1 && p === 'remove'
          ? `${candText(p, v, span, a, get, (x) => ref(p, x)).text}: one tile, taken last of course, between ${beside(v, span)}`
          : p === 'merge'
            ? `the cheapest split is after pile ${topK + 1}`
            : `tile ${topK + 1} goes last`;
      yield {
        state: state(),
        marks: [mark(cellId(a, b), 'new'), mark(itemId(topK), 'found')],
        say: `${ref(p, span)} = ${top}: ${why}.${lastOfLen ? ` Every stretch of length ${len} is done.` : ''}`,
        lines: ['b.len', 'b.keep'],
        level: lastOfLen ? 1 : 2,
        vars: vars(span, { [T(p)]: top!, k: topK + 1 }),
        extra: { span, k: topK, reads: readsOf(p, span, topK, true) },
      };
    }
  const end = state();
  const answer = best[0]![n - 1]!;
  yield {
    state: end,
    marks: [mark(cellId(0, n - 1), 'found')],
    say: `${finalText(p, answer, n)}: ${ref(p, { a: 0, b: n - 1 })}. The table solved ${plural(work.get('cells'), 'stretch', 'stretches')} with ${plural(work.get('choices'), 'choice')}; plain recursion would take ${tot.naive} calls and choices. Press Trace the order to see it.`,
    lines: ['b.ret'],
    level: 1,
    vars: { n, [p === 'merge' ? 'cost' : 'score']: answer, ...workVars(work, tot) },
  };
  return end;
}

function readsOf(p: Problem, s: Span, k: number, win: boolean): X['reads'] {
  const out: NonNullable<X['reads']> = [];
  for (const side of sides(p, s.a, s.b, k))
    if (side.a <= side.b) out.push({ from: [side.a, side.b], to: [s.a, s.b], best: win });
  return out;
}

/** Plain recursion on the same rule, from the whole row. */
function* naive(s: S, settings: IVSettings): Gen {
  const p = settings.problem;
  const { v } = s;
  const n = v.length;
  const tot = totals(n, p);
  const work = dpWork('choices');
  const calls = zeros(n, n);
  const seen = square(n);
  const seenK = square(n);
  const stack: Span[] = [];
  const extra = (more: X = {}): X => ({
    calls: copy2(calls),
    seen: copy2(seen),
    seenK: copy2(seenK),
    stack: [...stack],
    ...more,
  });
  const vars = (x: Span, more: Record<string, Scalar> = {}) => ({
    a: x.a + 1,
    b: x.b + 1,
    depth: stack.length,
    ...more,
    ...workVars(work, tot),
  });
  yield {
    state: s,
    marks: [],
    say: `Plain recursion: call ${call(p, { a: 0, b: n - 1 })} on the whole row. It tries every ${p === 'merge' ? 'split for the last merge' : 'tile as the last one taken'}, and asks for the stretches either side. Nothing is stored, so a short stretch is solved again every time a longer one asks for it. The corner of each cell counts its calls.`,
    lines: ['n.top'],
    level: 2,
    vars: vars({ a: 0, b: n - 1 }),
    extra: extra(),
  };

  function* visit(span: Span, caller: Span | null): Generator<IVStep, number, void> {
    const { a, b } = span;
    work.add('calls');
    calls[a]![b]!++;
    stack.push(span);
    const k0 = calls[a]![b]!;
    const who = `${caller ? `${call(p, caller)} calls ` : ''}${call(p, span)}${k0 > 1 ? `, ${nthTime(k0)} for this stretch` : ''}`;
    if (p === 'merge' && a === b) {
      seen[a]![b] = 0;
      seenK[a]![b] = a;
      yield {
        state: s,
        marks: [mark(cellId(a, b), 'new')],
        say: `${who}: one pile, nothing to merge. Return 0.`,
        lines: ['n.sig', 'n.one'],
        level: 2,
        vars: vars(span),
        extra: extra({ span }),
      };
      stack.pop();
      return 0;
    }
    if (p === 'remove' && a === b) {
      const c = at(v, a - 1) * v[a]! * at(v, a + 1);
      work.add('choices');
      seen[a]![b] = c;
      seenK[a]![b] = a;
      yield {
        state: s,
        marks: [mark(cellId(a, b), 'new'), mark(itemId(a), 'active')],
        say: `${who}: one tile, between ${beside(v, span)}: ${at(v, a - 1)} × ${v[a]} × ${at(v, a + 1)} = ${c}. Return ${c}.`,
        lines: ['n.sig', 'n.try'],
        level: 2,
        vars: vars(span),
        extra: extra({ span, k: a }),
      };
      stack.pop();
      return c;
    }
    seen[a]![b] = null;
    seenK[a]![b] = null;
    yield {
      state: s,
      marks: [mark(cellId(a, b), 'active')],
      say: `${who}.${k0 > 1 ? ' Nothing was kept, so it starts over.' : ''} It tries ${p === 'merge' ? `each split of ${stretch(p, span)}` : `each of ${stretch(p, span)} as the last one taken`}.`,
      lines: ['n.sig'],
      level: 2,
      vars: vars(span),
      extra: extra({ span }),
    };
    let top: number | null = null;
    let topK = a;
    for (const k of choicesFor(p, a, b)) {
      const got = new Map<string, number>();
      for (const side of sides(p, a, b, k))
        if (side.a <= side.b) got.set(`${side.a}-${side.b}`, yield* visit(side, span));
      const c = candText(
        p,
        v,
        span,
        k,
        (x) => got.get(`${x.a}-${x.b}`)!,
        (x) => call(p, x),
      );
      work.add('choices');
      const wins = better(p, c.value, top);
      if (wins) {
        top = c.value;
        topK = k;
      }
      yield {
        state: s,
        marks: [mark(cellId(a, b), 'active')],
        say: `Back in ${call(p, span)}, ${c.text}.${wins ? (k === a ? ' The first try.' : ' The best so far.') : ` Not ${p === 'merge' ? 'cheaper' : 'better'} than ${top}.`}`,
        lines: ['n.try'],
        level: 3,
        vars: vars(span, { k: k + 1 }),
        extra: extra({ span, k, reads: readsOf(p, span, k, wins) }),
      };
    }
    seen[a]![b] = top;
    seenK[a]![b] = topK;
    yield {
      state: s,
      marks: [mark(cellId(a, b), 'new'), mark(itemId(topK), 'found')],
      say: `${call(p, span)} = ${top}, with ${p === 'merge' ? `the split after pile ${topK + 1}` : `tile ${topK + 1} last`}. Return ${top}.`,
      lines: ['n.ret'],
      level: 3,
      vars: vars(span, { [F(p)]: top! }),
      extra: extra({ span, k: topK }),
    };
    stack.pop();
    return top!;
  }

  const answer = yield* visit({ a: 0, b: n - 1 }, null);
  const most = Math.max(...calls.flat());
  let busy: Span | null = null;
  for (let len = 1; len <= n && !busy; len++)
    for (let a = 0; a + len - 1 < n && !busy; a++)
      if (calls[a]![a + len - 1] === most) busy = { a, b: a + len - 1 };
  yield {
    state: s,
    marks: [mark(cellId(0, n - 1), 'found')],
    say: `${finalText(p, answer, n)}. Plain recursion made ${plural(work.get('calls'), 'call')} and tried ${plural(work.get('choices'), 'choice')} for ${plural((n * (n + 1)) / 2, 'stretch', 'stretches')}: ${call(p, busy!)} alone was called ${most === 1 ? 'once' : `${most} times`}. The table solves each stretch once.`,
    lines: ['n.top'],
    level: 1,
    vars: { n, [p === 'merge' ? 'cost' : 'score']: answer, ...workVars(work, tot) },
    extra: extra({ stack: [] }),
  };
  return s;
}

const solve: Op = {
  label: 'Solve',
  arity: 0,
  *run(s, _args, { settings }) {
    return approachOf(settings) === 'naive'
      ? yield* naive(s, settings)
      : yield* bottomUp(s, settings);
  },
};

/** Walk the k table from the whole row: remove takes tiles; merge joins piles. */
const trace: Op = {
  label: 'Trace the order',
  arity: 0,
  *run(s, _args, { settings }) {
    const p = settings.problem;
    const { v } = s;
    const n = v.length;
    if (s.best[0]![n - 1] === null) {
      yield refuse(
        s,
        approachOf(settings) === 'naive'
          ? 'Plain recursion keeps no table, so there is nothing to read the order from. Set Approach to the table, then Solve and trace.'
          : 'Solve first: the trace reads the best k of each stretch from the filled table.',
      );
      return s;
    }
    const K = s.K;
    const total = s.best[0]![n - 1]!;
    // What is left of the row: single tiles (remove), or the piles merged so far (merge).
    let left: Span[] = v.map((_, i) => ({ a: i, b: i }));
    const walked: Span[] = [];
    let score = 0;
    const steps: IVStep[] = [];
    const push = (say: string, lines: string[], marks: Mark[], level: 1 | 2 = 2) =>
      steps.push({
        state: s,
        marks,
        say,
        lines,
        level,
        vars: { [p === 'merge' ? 'cost' : 'score']: score },
        extra: { left: [...left], walked: [...walked] },
      });
    const go = (span: Span) => {
      const { a, b } = span;
      if (a > b) return;
      if (p === 'merge' && a === b) return;
      const k = K[a]![b]!;
      walked.push(span);
      push(
        p === 'merge'
          ? `${stretch(p, span)}: the last merge joins ${stretch(p, { a, b: k })} with ${stretch(p, { a: k + 1, b })}, so merge each of those first.`
          : `${stretch(p, span)}: tile ${k + 1} goes last${a < b ? `, so take ${[k > a ? stretch(p, { a, b: k - 1 }) : '', k < b ? stretch(p, { a: k + 1, b }) : ''].filter(Boolean).join(' and ')} first` : ''}.`,
        ['t.loop'],
        [mark(cellId(a, b), 'active'), mark(itemId(k), 'active')],
      );
      const [l, r] = sides(p, a, b, k);
      go(l);
      go(r);
      if (p === 'merge') {
        const x = sumOf(v, a, k);
        const y = sumOf(v, k + 1, b);
        score += x + y;
        left = left
          .filter((g) => g.a < a || g.b > b)
          .concat({ a, b })
          .sort((g, h) => g.a - h.a);
        push(
          `Merge the pile of ${x} (${stretch(p, { a, b: k })}) with the pile of ${y} (${stretch(p, { a: k + 1, b })}): it costs ${x} + ${y} = ${x + y}. Cost so far ${score}.`,
          ['t.do'],
          [mark(itemId(a), 'new'), mark(cellId(a, b), 'found')],
        );
      } else {
        const L = at(v, a - 1);
        const R = at(v, b + 1);
        score += L * v[k]! * R;
        left = left.filter((g) => g.a !== k);
        push(
          `Take tile ${k + 1} (${v[k]}): its neighbours now are ${beside(v, span)}, so it scores ${L} × ${v[k]} × ${R} = ${L * v[k]! * R}. Total so far ${score}.`,
          ['t.do'],
          [mark(cellId(a, b), 'found')],
        );
      }
    };
    push(
      `Start at the whole row, ${ref(p, { a: 0, b: n - 1 })} = ${total}. The k table says ${p === 'merge' ? 'where each stretch’s last merge splits it' : 'which tile each stretch takes last'}; follow it down.`,
      ['t.sig'],
      [mark(cellId(0, n - 1), 'active')],
    );
    go({ a: 0, b: n - 1 });
    const plan = planOf(v, K, p);
    for (const st of steps) yield st;
    yield {
      state: s,
      marks: [mark(cellId(0, n - 1), 'found')],
      say:
        p === 'merge'
          ? `The cheapest merging, as brackets of pile sizes: ${plan}. It costs ${score} = ${ref(p, { a: 0, b: n - 1 })}.`
          : n === 1
            ? `Take the one tile: ${score}.`
            : `The best order takes the tiles ${plan.split(' ').join(', ')} (by position): ${score} in all, ${ref(p, { a: 0, b: n - 1 })}.`,
      lines: ['t.ret'],
      level: 1,
      vars: { [p === 'merge' ? 'cost' : 'score']: score, order: plan },
      extra: { left: [...left], walked: [...walked] },
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

export function pseudocode(settings: IVSettings): PseudoBlock[] {
  const merge = settings.problem === 'merge';
  const t = merge ? 'M' : 'B';
  const rule = merge
    ? {
        text: `${t}[a][k] + ${t}[k + 1][b] + sum(v[a..b])`,
        plain: 'merge each half the best way, then pay the whole stretch’s size for the last merge',
      }
    : {
        text: `${t}[a][k − 1] + ${t}[k + 1][b] + v[a − 1]·v[k]·v[b + 1]`,
        plain:
          'clear each side of k the best way, then take k between the two things outside the stretch',
      };
  const traceBlock: PseudoBlock = {
    op: 'trace',
    lines: [
      L('t.sig', 0, 'order(a = 1, b = n)', 'To read the order, start with the whole row:'),
      L(
        't.loop',
        1,
        'k = K[a][b]; order(the two sides of k)',
        'look up its k and do both sides of it first;',
      ),
      L(
        't.do',
        1,
        merge ? 'merge [a..k] with [k + 1..b]' : 'take tile k',
        merge ? 'then merge the two halves.' : 'then take tile k, last in its stretch.',
      ),
      L('t.ret', 0, 'return the order', 'That is the best order.'),
    ],
  };
  if (approachOf(settings) === 'naive') {
    const f = merge ? 'cost' : 'best';
    return [
      {
        op: 'solve',
        lines: [
          L('n.top', 0, `answer = ${f}(1, n)`, 'Ask for the whole row.'),
          L(
            'n.sig',
            0,
            `${f}(a, b)`,
            merge ? 'To merge piles a..b at the least cost:' : 'To score tiles a..b best:',
          ),
          ...(merge ? [L('n.one', 1, 'if a = b: return 0', 'one pile needs no merging;')] : []),
          L(
            'n.try',
            1,
            `for k = a to ${merge ? 'b − 1' : 'b'}: ${merge ? 'min' : 'max'} of ${rule.text.replace(/[BM]\[(\w[^\]]*)\]\[([^\]]*)\]/g, `${f}($1, $2)`)}`,
            `try every ${merge ? 'split' : 'last tile'} k: ${rule.plain}, asking for the sides again;`,
          ),
          L(
            'n.ret',
            1,
            `return the ${merge ? 'least' : 'best'}`,
            `hand back the ${merge ? 'cheapest' : 'best'}.`,
          ),
        ],
      },
      traceBlock,
    ];
  }
  return [
    {
      op: 'solve',
      lines: [
        L(
          'b.sig',
          0,
          merge ? 'mergeAll(v[1..n])' : 'takeAll(v[1..n])',
          'To fill the table, shortest stretches first:',
        ),
        L(
          'b.len',
          1,
          'for len = 1 to n, for a = 1 to n − len + 1: b = a + len − 1',
          'for every stretch a..b, by length:',
        ),
        ...(merge ? [L('b.one', 2, 'if a = b: M[a][a] = 0', 'one pile costs nothing;')] : []),
        L(
          'b.try',
          2,
          `for k = a to ${merge ? 'b − 1' : 'b'}: try ${rule.text}`,
          `try every ${merge ? 'split' : 'last tile'} k: ${rule.plain};`,
        ),
        L(
          'b.keep',
          2,
          `${t}[a][b] = the ${merge ? 'least' : 'best'}; K[a][b] = its k`,
          `keep the ${merge ? 'cheapest' : 'best'} and the k that made it.`,
        ),
        L('b.ret', 1, `return ${t}[1][n]`, 'The whole row’s cell is the answer.'),
      ],
    },
    traceBlock,
  ];
}

// ----- Start -----

export const init = (): S => stateFor([...START]);

export function describe(s: S, settings?: IVSettings): string {
  const p = settings?.problem ?? 'remove';
  const n = s.v.length;
  const cells: string[] = [];
  for (let len = 1; len <= n; len++)
    for (let a = 0; a + len - 1 < n; a++) {
      const v = s.best[a]![a + len - 1];
      if (v !== null && v !== undefined) cells.push(`${a + 1} to ${a + len}: ${v}`);
    }
  return `${p === 'merge' ? 'Piles' : 'Tiles'} ${s.v.join(', ')}. ${cells.length ? `Stretches solved: ${cells.join('; ')}.` : 'No stretch solved yet.'}`;
}

export function initialSay(s: S, settings: IVSettings): string {
  return settings.problem === 'merge'
    ? `Piles in a row: merging two neighbours costs their total size. Press Solve for the cheapest way to merge them all, or type pile sizes and press Load.`
    : `Tiles in a row between two posts worth 1: taking a tile scores it times its two neighbours, then the row closes up. Press Solve for the best order, or type tile numbers and press Load.`;
}

export const initialVars = (s: S) => ({ n: s.v.length });
