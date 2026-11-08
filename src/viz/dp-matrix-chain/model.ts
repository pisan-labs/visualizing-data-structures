import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import type { Cell } from '../../layouts/table';
import { cellId, mark, plural } from '../_dp/kit';

export const MAX_N = 6;
export const MAX_DIM = 40;

export interface ChainState {
  /** Dimensions p0..pn: matrix Ai is p[i-1] x p[i]. */
  p: number[];
  /** m[i][j] (0-based, i <= j): the fewest scalar multiplications for Ai+1..Aj+1. */
  m: (number | null)[][];
  /** s[i][j]: the split k (1-based, as in the textbook) of the best order, for i < j. */
  s: (number | null)[][];
}

export type ChainSettings = { [key: string]: Scalar };

/** A piece of the parenthesization: a matrix, a range not split yet, or a bracket. */
export type Token =
  { kind: 'mat'; i: number } | { kind: 'range'; i: number; j: number } | { kind: 'open' | 'close' };

export interface ChainExtra {
  /** The cell being filled and the split being tried (1-based k). */
  at?: Cell;
  k?: number;
  /** The best split so far. */
  bestK?: number;
  /** The parenthesization so far. */
  tokens?: Token[];
  /** The range just split, to highlight. */
  split?: Cell;
}

type S = ChainState;
type X = ChainExtra;
type Op = OpSpec<S, ChainSettings, X>;
type ChainStep = Step<S, X>;
type Gen = Generator<ChainStep, S, void>;

export const defaults: ChainSettings = {};

/** The textbook chain: six matrices, 30x35, 35x15, 15x5, 5x10, 10x20, 20x25. */
export const START_P = [30, 35, 15, 5, 10, 20, 25];

export const square = (n: number) =>
  Array.from({ length: n }, () => Array<number | null>(n).fill(null));

export function stateFor(p: number[]): S {
  const n = p.length - 1;
  return { p, m: square(n), s: square(n) };
}

export const init = (): S => stateFor(START_P);
export const nOf = (st: S) => st.p.length - 1;

/** Shape ids: the m table's cells are cell-i-j, the s table's s-cell-i-j. */
export const mId = (i: number, j: number) => cellId(i, j);
export const sId = (i: number, j: number) => `s-${cellId(i, j)}`;
export const dimId = (i: number) => `rh-1-${i}`;

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const sub = (k: number) => [...String(k)].map((d) => SUB[Number(d)]).join('');
export const A = (i: number) => `A${sub(i)}`;

export function dimsFromArg(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;x×]+/)
    .filter(Boolean);
  const how = `Type the dimensions p0 p1 ... pn, such as 30 35 15 5: from 2 to ${MAX_N + 1} whole numbers from 1 to ${MAX_DIM}.`;
  if (tokens.length < 2) return how;
  if (tokens.length > MAX_N + 1)
    return `That is ${tokens.length - 1} matrices. Use at most ${MAX_N}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `"${t}" is not a whole number. ${how}`;
    const v = Number(t);
    if (v < 1 || v > MAX_DIM) return `${v} is out of range. ${how}`;
    out.push(v);
  }
  return out;
}

export const isFull = (st: S) => st.m.every((r, i) => r.every((v, j) => j < i || v !== null));

export function filledLengths(st: S): number {
  const n = nOf(st);
  let len = 0;
  while (len < n && st.m[0]![len] !== null) len++;
  return len;
}

/** The parenthesization as plain text, A1, A2, ...: what the code tabs print. */
export function orderText(st: S, i = 0, j = nOf(st) - 1): string {
  if (i === j) return `A${i + 1}`;
  const k = st.s[i]![j]!;
  return `(${orderText(st, i, k - 1)}${orderText(st, k, j)})`;
}

export function tokensText(tokens: Token[]): string {
  return tokens
    .map((t) =>
      t.kind === 'mat'
        ? A(t.i)
        : t.kind === 'range'
          ? `[${A(t.i)}…${A(t.j)}]`
          : t.kind === 'open'
            ? '('
            : ')',
    )
    .join('');
}

function* fillLengths(st: S, upto: number): Gen {
  const { p } = st;
  const n = nOf(st);
  const m = st.m.map((r) => [...r]);
  const s = st.s.map((r) => [...r]);
  const state = (): S => ({ p, m: m.map((r) => [...r]), s: s.map((r) => [...r]) });
  for (let len = filledLengths(st) + 1; len <= upto; len++) {
    if (len === 1) {
      for (let i = 0; i < n; i++) m[i]![i] = 0;
      yield {
        state: state(),
        marks: Array.from({ length: n }, (_, i) => mark(mId(i, i), 'new')),
        say: 'A chain of one matrix needs no multiplication: m[i][i] = 0 down the diagonal.',
        lines: ['m.base'],
        vars: { n, l: 1 },
        level: upto === 1 ? 1 : 2,
      };
      continue;
    }
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      let best = Infinity;
      let bestK = 0;
      for (let k = i + 1; k <= j; k++) {
        // Split after A_k (1-based): (A_{i+1}..A_k)(A_{k+1}..A_{j+1}).
        const left = m[i]![k - 1]!;
        const right = m[k]![j]!;
        const mult = p[i]! * p[k]! * p[j + 1]!;
        const q = left + right + mult;
        const better = q < best;
        const was = best;
        if (better) {
          best = q;
          bestK = k;
        }
        yield {
          state: state(),
          marks: [
            mark(mId(i, j), 'active'),
            mark(mId(i, k - 1), 'compare'),
            mark(mId(k, j), 'compare'),
          ],
          say:
            `Split ${A(i + 1)}…${A(j + 1)} after ${A(k)}: m[${i + 1}][${k}] + m[${k + 1}][${j + 1}] + p${sub(i)}·p${sub(k)}·p${sub(j + 1)} = ${left} + ${right} + ${p[i]}·${p[k]}·${p[j + 1]} = ${q}.` +
            (was === Infinity
              ? ' The best so far.'
              : better
                ? ` Better than ${was}.`
                : ` Not better than ${was}.`),
          lines: better ? ['m.k', 'm.q', 'm.keep'] : ['m.k', 'm.q'],
          vars: { n, l: len, i: i + 1, j: j + 1, k, q },
          level: 3,
          extra: { at: [i, j], k, bestK },
        };
      }
      m[i]![j] = best;
      s[i]![j] = bestK;
      const last = i + len === n;
      yield {
        state: state(),
        marks: [mark(mId(i, j), 'new'), mark(sId(i, j), 'new')],
        say: `m[${i + 1}][${j + 1}] = ${best}: multiply ${A(i + 1)}…${A(j + 1)} best by splitting after ${A(bestK)}, so s[${i + 1}][${j + 1}] = ${bestK}.${last ? ` Chains of length ${len} are done.` : ''}`,
        lines: ['m.loop', 'm.store'],
        vars: { n, l: len, i: i + 1, j: j + 1, 'm[i][j]': best },
        level: last ? 1 : 2,
        extra: { at: [i, j], bestK },
      };
    }
  }
  return state();
}

const fill: Op = {
  label: 'Fill the tables',
  arity: 0,
  *run(st): Gen {
    const n = nOf(st);
    if (isFull(st)) {
      yield {
        state: st,
        marks: [mark(mId(0, n - 1), 'found')],
        say: `The tables are already full: m[1][${n}] = ${st.m[0]![n - 1]}. Press Parenthesize, or type new dimensions.`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const end = yield* fillLengths(st, n);
    const best = end.m[0]![n - 1]!;
    // The worst order, for scale: the same recurrence with max.
    const worst = worstCost(st.p);
    yield {
      state: end,
      marks: [mark(mId(0, n - 1), 'found')],
      say: `m[1][${n}] = ${best}: the fewest scalar multiplications for the whole chain.${n > 2 ? ` The worst order needs ${worst}.` : ''}${n > 1 ? ' Press Parenthesize to see the order.' : ''}`,
      lines: ['m.ret'],
      vars: { n, cost: best, worst },
      level: 1,
    };
    return end;
  },
};

/** The most multiplications any order needs: the recurrence with max instead of min. */
export function worstCost(p: number[]): number {
  const n = p.length - 1;
  const w = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let len = 2; len <= n; len++)
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      for (let k = i + 1; k <= j; k++)
        w[i]![j] = Math.max(w[i]![j]!, w[i]![k - 1]! + w[k]![j]! + p[i]! * p[k]! * p[j + 1]!);
    }
  return w[0]![n - 1]!;
}

const diagonal: Op = {
  label: 'Fill one chain length',
  arity: 0,
  *run(st): Gen {
    const done = filledLengths(st);
    if (done === nOf(st)) {
      yield {
        state: st,
        marks: [],
        say: 'Every chain length is filled already. Press Parenthesize, or type new dimensions.',
        lines: [],
        level: 1,
      };
      return st;
    }
    return yield* fillLengths(st, done + 1);
  },
};

const paren: Op = {
  label: 'Parenthesize',
  arity: 0,
  *run(st): Gen {
    const n = nOf(st);
    if (!isFull(st)) {
      yield {
        state: st,
        marks: [mark(mId(0, n - 1), 'error')],
        say: `Fill the tables first. The order is read from s, starting at s[1][${n}].`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const range = (i: number, j: number): Token[] =>
      i === j ? [{ kind: 'mat', i: i + 1 }] : [{ kind: 'range', i: i + 1, j: j + 1 }];
    let tokens: Token[] = range(0, n - 1);
    yield {
      state: st,
      marks: n > 1 ? [mark(sId(0, n - 1), 'active')] : [],
      say:
        n > 1
          ? `Start with the whole chain, ${A(1)}…${A(n)}. s[1][${n}] says where its last multiplication splits it.`
          : `One matrix, ${A(1)}: nothing to multiply.`,
      lines: ['p.sig'],
      vars: { cost: st.m[0]![n - 1]! },
      level: 2,
      extra: { tokens },
    };
    for (;;) {
      const at = tokens.findIndex((t) => t.kind === 'range');
      if (at < 0) break;
      const r = tokens[at] as { kind: 'range'; i: number; j: number };
      const i = r.i - 1;
      const j = r.j - 1;
      const k = st.s[i]![j]!;
      tokens = [
        ...tokens.slice(0, at),
        { kind: 'open' },
        ...range(i, k - 1),
        ...range(k, j),
        { kind: 'close' },
        ...tokens.slice(at + 1),
      ];
      yield {
        state: st,
        marks: [mark(sId(i, j), 'found'), mark(mId(i, j), 'compare')],
        say: `s[${i + 1}][${j + 1}] = ${k}: ${A(i + 1)}…${A(j + 1)} is (${A(i + 1)}…${A(k)}) times (${A(k + 1)}…${A(j + 1)}), costing ${st.m[i]![j]} in all.`,
        lines: ['p.split', 'p.rec'],
        vars: { i: i + 1, j: j + 1, k, cost: st.m[0]![n - 1]! },
        level: 2,
        extra: { tokens, split: [i, j] },
      };
    }
    yield {
      state: st,
      marks: [mark(mId(0, n - 1), 'found')],
      say: `${tokensText(tokens)}: ${plural(st.m[0]![n - 1]!, 'scalar multiplication')}.`,
      lines: ['p.ret'],
      vars: { cost: st.m[0]![n - 1]!, order: orderText(st) },
      level: 1,
      extra: { tokens },
    };
    return st;
  },
};

const dims: Op = {
  label: 'Set dimensions',
  arity: 1,
  *run(st, [arg]): Gen {
    const p = dimsFromArg(arg);
    if (typeof p === 'string') {
      yield {
        state: st,
        marks: [],
        say: `The dimensions stay as they were. ${p}`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const next = stateFor(p);
    yield {
      state: next,
      marks: [],
      say: `${plural(p.length - 1, 'matrix', 'matrices')}: ${p
        .slice(1)
        .map((d, i) => `${A(i + 1)} is ${p[i]}×${d}`)
        .join(', ')}. Press Fill the tables.`,
      lines: [],
      vars: { n: p.length - 1 },
      level: 1,
    };
    return next;
  },
};

export const ops = { dims, fill, diagonal, paren };

const Ln = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
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
        Ln(
          'm.sig',
          0,
          'matrixChainOrder(p[0..n])',
          'To fill the tables for matrices A1..An, where Ai is p[i-1] × p[i]:',
        ),
        Ln('m.base', 1, 'm[i][i] = 0 for i = 1 to n', 'one matrix costs nothing.'),
        Ln(
          'm.loop',
          1,
          'for l = 2 to n, for i = 1 to n - l + 1: j = i + l - 1; m[i][j] = ∞',
          'For each chain length, shortest first, and each chain Ai..Aj of that length:',
        ),
        Ln('m.k', 2, 'for k = i to j - 1', 'try every place to split it,'),
        Ln(
          'm.q',
          3,
          'q = m[i][k] + m[k + 1][j] + p[i - 1]·p[k]·p[j]; if q < m[i][j]',
          'cost of the left part, plus the right part, plus multiplying the two results;',
        ),
        Ln('m.keep', 4, 'm[i][j] = q; s[i][j] = k', 'keep the cheapest, and where it split.'),
        Ln(
          'm.store',
          2,
          '(m[i][j] and s[i][j] are final)',
          'The best split for this chain is known.',
        ),
        Ln('m.ret', 1, 'return m and s', 'm[1][n] is the cost; s says how to bracket.'),
      ],
    },
    {
      op: 'paren',
      lines: [
        Ln('p.sig', 0, 'printParens(s, i, j)', 'To bracket the chain Ai..Aj:'),
        Ln(
          'p.split',
          1,
          'if i == j: print Ai; else k = s[i][j]',
          'one matrix prints itself; otherwise look up the split,',
        ),
        Ln(
          'p.rec',
          2,
          'print "(" printParens(s, i, k) printParens(s, k + 1, j) ")"',
          'and bracket the left part and the right part the same way.',
        ),
        Ln(
          'p.ret',
          1,
          '// the order with the fewest multiplications',
          'The brackets give the order with the fewest multiplications.',
        ),
      ],
    },
  ];
}

export function initialSay(st: S): string {
  const n = nOf(st);
  return `${plural(n, 'matrix', 'matrices')} to multiply, ${A(1)} to ${A(n)}. The product is the same in any order, but the work is not. Which order needs the fewest multiplications? Press Fill the tables, or type new dimensions.`;
}

export const initialVars = (st: S) => ({ n: nOf(st) });

export function describe(st: S): string {
  const show = (v: number | null) => (v === null ? 'empty' : String(v));
  const n = nOf(st);
  const rows = (t: (number | null)[][], from: number) =>
    t
      .map(
        (r, i) =>
          `row ${i + 1}: ${r
            .slice(i + from)
            .map(show)
            .join(' ')}`,
      )
      .join('; ');
  return `Dimensions ${st.p.join(', ')}. Table m, upper triangle by rows: ${rows(st.m, 0)}.${n > 1 ? ` Table s, above the diagonal: ${rows(st.s.slice(0, n - 1), 1)}.` : ''}`;
}
