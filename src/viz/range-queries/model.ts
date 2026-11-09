import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { minus, plural, plus, readIndex, readList, readNumber, span } from '../_range/kit';

/** The array the page starts with, already built. */
export const START = [5, 3, 8, 1, 9, 2, 7, 4];

export interface RQState {
  a: number[];
  /** Prefix sums P[0..n] (empty with a sparse table). null: not computed yet. */
  p: (number | null)[];
  /**
   * Sparse table (empty with prefix sums): m[k][i] is the smallest of A[i .. i + 2^k − 1], for
   * k = 0 (A itself) up to ⌊log₂ n⌋. null: not computed yet.
   */
  m: (number | null)[][];
  /** Additions (prefix sums) or min() calls (sparse table) made by the last build. */
  buildCost: number;
  /** The same for the last query. */
  queryCost: number;
}

export interface RQSettings {
  [key: string]: Scalar;
  structure: 'prefix' | 'sparse';
}

export interface Window {
  lo: number;
  hi: number;
  label: string;
  role?: MarkRole;
  /** 0 is the lane nearest the range bracket; 1 is right above A. */
  lane: 0 | 1;
}

export interface RQExtra {
  /** What the operation is about, as a bracket over A with a label. */
  range?: { lo: number; hi: number; label: string; role?: MarkRole };
  /** Prefix sums: arrows from fence 0 to fence `to`, between A and P. Lane = position. */
  spans?: { to: number; label: string; role?: MarkRole }[];
  /** Sparse table: windows drawn as brackets over A. */
  windows?: Window[];
}

type S = RQState;
type X = RQExtra;
type Op = OpSpec<S, RQSettings, X>;
type RQStep = Step<S, X>;

export const defaults: RQSettings = { structure: 'prefix' };

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** Shape id of table entry M[k][i]; row 0 is A. */
export const cellId = (k: number, i: number) => (k === 0 ? `a-${i}` : `m${k}-${i}`);

/** The largest k with 2^k ≤ n: the table has rows 0 to levels(n). */
export const levels = (n: number) => (n <= 1 ? 0 : Math.floor(Math.log2(n)));

export function prefixOf(a: readonly number[]): number[] {
  const p = [0];
  for (const x of a) p.push(p[p.length - 1]! + x);
  return p;
}

export function sparseOf(a: readonly number[]): number[][] {
  const m = [[...a]];
  for (let k = 1; 2 ** k <= a.length; k++) {
    const prev = m[k - 1]!;
    const half = 2 ** (k - 1);
    m.push(
      Array.from({ length: a.length - 2 ** k + 1 }, (_, i) => Math.min(prev[i]!, prev[i + half]!)),
    );
  }
  return m;
}

/** min() calls to build a sparse table on n values: one per entry above row 0. */
export function sparseCost(n: number): number {
  let c = 0;
  for (let k = 1; 2 ** k <= n; k++) c += n - 2 ** k + 1;
  return c;
}

function built(a: number[], settings: RQSettings): S {
  return settings.structure === 'sparse'
    ? { a, p: [], m: sparseOf(a), buildCost: sparseCost(a.length), queryCost: 0 }
    : { a, p: prefixOf(a), m: [], buildCost: a.length, queryCost: 0 };
}

export function init(settings: RQSettings): S {
  return built([...START], settings);
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { n: s.a.length, ...more, 'build cost': s.buildCost, 'query cost': s.queryCost };
}

const copy = (s: S): S => ({
  a: [...s.a],
  p: [...s.p],
  m: s.m.map((r) => [...r]),
  buildCost: s.buildCost,
  queryCost: s.queryCost,
});

/** A step that refuses the call and changes nothing. The script for the code tabs skips these. */
function* refuse(s: S, say: string, line: string): Generator<RQStep, S, void> {
  yield { state: s, marks: [mark('a-name', 'error')], say, lines: [line], level: 1, vars: vars(s) };
  return s;
}

/** Why indices i..j cannot be queried, or null when they can. */
function badRange(n: number, i: number, j: number): string | null {
  const last = `A has ${plural(n, 'value')}, A[0] to A[${n - 1}]`;
  if (i < 0 || i >= n) return `There is no A[${i}]: ${last}.`;
  if (j < 0 || j >= n) return `There is no A[${j}]: ${last}.`;
  if (i > j) return `i = ${i} is after j = ${j}. The range runs from i up to j, so swap them.`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Build

function* buildPrefix(a: number[]): Generator<RQStep, S, void> {
  const n = a.length;
  const w: S = { a, p: Array<number | null>(n + 1).fill(null), m: [], buildCost: 0, queryCost: 0 };
  w.p[0] = 0;
  yield {
    state: copy(w),
    marks: [mark('p-0', 'new')],
    say: `build: A gets ${plural(n, 'value')}, and P gets n + 1 = ${n + 1} entries, P[0] to P[${n}]. P[k] is the sum of the first k values: A[0..k), from A[0] up to but not including A[k] (0-based and half-open). So P[0] = 0, the sum of no values.`,
    lines: ['build.sig', 'pb.zero'],
    level: 2,
    vars: vars(w),
  };
  for (let k = 0; k < n; k++) {
    const before = w.p[k]!;
    const total = before + a[k]!;
    w.p[k + 1] = total;
    w.buildCost += 1;
    yield {
      state: copy(w),
      marks: [mark(`a-${k}`, 'active'), mark(`p-${k}`, 'compare'), mark(`p-${k + 1}`, 'new')],
      say: `P[${k + 1}] = P[${k}] + A[${k}] = ${plus(before, a[k]!)} = ${total}: the sum of ${span(0, k)}.`,
      lines: ['pb.loop', 'pb.add'],
      level: 2,
      vars: vars(w, { k }),
      extra: { spans: [{ to: k + 1, label: `P[${k + 1}] = ${total}`, role: 'active' }] },
    };
  }
  yield {
    state: copy(w),
    marks: [],
    say: `P is built with ${plural(n, 'addition')}: O(n). Now any sum(i, j) is P[j + 1] − P[i], one subtraction, however long the range.`,
    lines: [],
    level: 1,
    vars: vars(w),
  };
  return copy(w);
}

/** "Rows k = 1 to 3 will hold every window of 2, 4, … 8 values", for K rows above A. */
function upperRows(K: number): string {
  if (K === 1) return 'Row k = 1 will hold every window of 2 values';
  if (K === 2) return 'Rows k = 1 and 2 will hold every window of 2 and 4 values';
  return `Rows k = 1 to ${K} will hold every window of 2, 4, … ${2 ** K} values`;
}

function* buildSparse(a: number[]): Generator<RQStep, S, void> {
  const n = a.length;
  const K = levels(n);
  const m: (number | null)[][] = [[...a]];
  for (let k = 1; k <= K; k++) m.push(Array<number | null>(n - 2 ** k + 1).fill(null));
  const w: S = { a, p: [], m, buildCost: 0, queryCost: 0 };
  yield {
    state: copy(w),
    marks: [],
    say:
      K === 0
        ? 'build: A gets 1 value. Row k = 0 of the table is A itself, and one value has no longer windows, so the table is done.'
        : `build: A gets ${plural(n, 'value')}. Row k = 0 of the table is A itself: a window of one value is its own minimum. ${upperRows(K)}, the powers of two that fit in n = ${n}.`,
    lines: ['build.sig', 'sb.base'],
    level: 2,
    vars: vars(w),
  };
  for (let k = 1; k <= K; k++) {
    const len = 2 ** k;
    const half = len / 2;
    const row = m[k]!;
    for (let i = 0; i + len <= n; i++) {
      const x = m[k - 1]![i]!;
      const y = m[k - 1]![i + half]!;
      row[i] = Math.min(x, y);
      w.buildCost += 1;
      yield {
        state: copy(w),
        marks: [
          mark(cellId(k - 1, i), 'compare'),
          mark(cellId(k - 1, i + half), 'compare'),
          mark(cellId(k, i), 'new'),
        ],
        say: `M[${k}][${i}] = min(M[${k - 1}][${i}], M[${k - 1}][${i + half}]) = min(${x}, ${y}) = ${row[i]}: the smallest of ${span(i, i + len - 1)}, from its halves ${span(i, i + half - 1)} and ${span(i + half, i + len - 1)}.`,
        lines: ['sb.level', 'sb.loop', 'sb.min'],
        level: 3,
        vars: vars(w, { k, i }),
        extra: {
          windows: [
            { lo: i, hi: i + len - 1, label: `M[${k}][${i}] = ${row[i]}`, role: 'active', lane: 0 },
            { lo: i, hi: i + half - 1, label: String(x), lane: 1 },
            { lo: i + half, hi: i + len - 1, label: String(y), lane: 1 },
          ],
        },
      };
    }
    const count = n - len + 1;
    yield {
      state: copy(w),
      marks: row.map((_, i) => mark(cellId(k, i), 'done')),
      say:
        k < K
          ? `Row k = ${k} is done: ${plural(count, 'window')} of ${len} values, each the smaller of two windows of ${half} from row ${k - 1}.`
          : `Row k = ${k} is done, and so is the table: ${plural(w.buildCost, 'min() call')}, O(n log n). Now any min(i, j) takes two lookups and one min().`,
      lines: ['sb.level'],
      level: k < K ? 2 : 1,
      vars: vars(w, { k }),
    };
  }
  return copy(w);
}

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [arg], { settings }) {
    const vs = readList(arg);
    if (typeof vs === 'string')
      return yield* refuse(s, `Nothing built. ${vs} The array stays as it was.`, sigOf('build'));
    return settings.structure === 'sparse' ? yield* buildSparse(vs) : yield* buildPrefix(vs);
  },
};

// ---------------------------------------------------------------------------------------------
// Query

function* queryPrefix(s: S, i: number, j: number): Generator<RQStep, S, void> {
  const w = copy(s);
  w.queryCost = 0;
  const hi = w.p[j + 1]!;
  const lo = w.p[i]!;
  const sum = hi - lo;
  const spans = [
    { to: j + 1, label: `P[${j + 1}] = ${hi}`, role: 'active' as const },
    { to: i, label: `P[${i}] = ${lo}` },
  ];
  const ends = [mark(`p-${j + 1}`, 'active'), mark(`p-${i}`, 'compare')];
  const before = i === 0 ? ', which is nothing' : `: that is ${span(0, i - 1)}`;
  yield {
    state: copy(w),
    marks: ends,
    say: `sum(${i}, ${j}) adds up ${span(i, j)}, both ends included. P[${j + 1}] = ${hi} is the sum of everything up to A[${j}], ${span(0, j)}. P[${i}] = ${lo} is the sum of everything before A[${i}]${before}.`,
    lines: ['query.sig'],
    level: 2,
    vars: vars(w, { i, j }),
    extra: { spans, range: { lo: i, hi: j, label: `sum(${i}, ${j})` } },
  };
  w.queryCost = 1;
  const cancel =
    i === 0 ? 'Nothing is taken away.' : `${span(0, i - 1)} is in both sums, so it cancels.`;
  const loop = j > i ? ` A loop over the range would make ${plural(j - i, 'addition')}.` : '';
  yield {
    state: copy(w),
    marks: [
      ...ends,
      ...Array.from({ length: j - i + 1 }, (_, k) => mark(`a-${i + k}`, 'found')),
      ...Array.from({ length: i }, (_, k) => mark(`a-${k}`, 'stale')),
    ],
    say: `sum(${i}, ${j}) = P[${j + 1}] − P[${i}] = ${minus(hi, lo)} = ${sum}. ${cancel} That is one subtraction, however long the range.${loop}`,
    lines: ['pq.ret'],
    level: 1,
    vars: vars(w, { i, j, sum }),
    extra: { spans, range: { lo: i, hi: j, label: `sum(${i}, ${j}) = ${sum}`, role: 'found' } },
  };
  return copy(w);
}

function* querySparse(s: S, i: number, j: number): Generator<RQStep, S, void> {
  const w = copy(s);
  w.queryCost = 0;
  const len = j - i + 1;
  const k = levels(len);
  const size = 2 ** k;
  const t = j - size + 1;
  const x = w.m[k]![i]!;
  const y = w.m[k]![t]!;
  const min = Math.min(x, y);
  const range = { lo: i, hi: j, label: `min(${i}, ${j})` };
  yield {
    state: copy(w),
    marks: [],
    say:
      len === 1
        ? `min(${i}, ${j}) covers one value, so k = 0: row 0, which is A itself.`
        : `min(${i}, ${j}) covers len = ${len} values. The longest window of a power-of-two length that fits is 2^${k} = ${size}, so k = ⌊log₂ ${len}⌋ = ${k}.`,
    lines: ['query.sig', 'sq.k'],
    level: 2,
    vars: vars(w, { i, j, len, k }),
    extra: { range },
  };
  const windows: Window[] = [
    { lo: i, hi: i + size - 1, label: `M[${k}][${i}] = ${x}`, role: 'active', lane: 0 },
    { lo: t, hi: j, label: `M[${k}][${t}] = ${y}`, role: 'active', lane: 1 },
  ];
  const both = [mark(cellId(k, i), 'active'), mark(cellId(k, t), 'active')];
  const overlap =
    t === i
      ? `len is a power of two, so both are the same window, ${span(i, j)}.`
      : `They overlap on ${span(t, i + size - 1)}. That is fine for a minimum: a value counted twice cannot change the smallest.`;
  yield {
    state: copy(w),
    marks: both,
    say: `Two windows of ${size} cover ${span(i, j)}: M[${k}][${i}] = ${x} starts at i and covers ${span(i, i + size - 1)}, and M[${k}][${t}] = ${y} ends at j and covers ${span(t, j)}. ${overlap}`,
    lines: ['sq.ret'],
    level: 2,
    vars: vars(w, { i, j, len, k }),
    extra: { range, windows },
  };
  w.queryCost = 1;
  const where = Array.from({ length: len }, (_, d) => i + d).filter((p) => w.a[p] === min);
  yield {
    state: copy(w),
    marks: [...both, ...where.map((p) => mark(`a-${p}`, 'found'))],
    say: `min(${i}, ${j}) = min(${x}, ${y}) = ${min}. One min() call, however long the range.`,
    lines: ['sq.ret'],
    level: 1,
    vars: vars(w, { i, j, len, k, min }),
    extra: {
      windows,
      range: { lo: i, hi: j, label: `min(${i}, ${j}) = ${min}`, role: 'found' },
    },
  };
  return copy(w);
}

const query: Op = {
  label: 'Query',
  arity: 2,
  *run(s, [ri, rj], { settings }) {
    const name = settings.structure === 'sparse' ? 'min' : 'sum';
    const sig = sigOf('query');
    const i = readIndex(ri);
    const j = readIndex(rj);
    if (typeof i === 'string' || typeof j === 'string')
      return yield* refuse(s, `${name}(i, j): ${typeof i === 'string' ? i : j}`, sig);
    const bad = badRange(s.a.length, i, j);
    if (bad) return yield* refuse(s, `${name}(${i}, ${j}): ${bad}`, sig);
    return settings.structure === 'sparse'
      ? yield* querySparse(s, i, j)
      : yield* queryPrefix(s, i, j);
  },
};

// ---------------------------------------------------------------------------------------------
// Update

function* updatePrefix(s: S, i: number, x: number): Generator<RQStep, S, void> {
  const w = copy(s);
  const n = w.a.length;
  const old = w.a[i]!;
  const d = x - old;
  w.a[i] = x;
  const range = { lo: i, hi: i, label: `update(${i}, ${x})` };
  yield {
    state: copy(w),
    marks: [mark(`a-${i}`, 'active')],
    say: `update(${i}, ${x}): A[${i}] changes from ${old} to ${x}, so d = ${minus(x, old)} = ${d}. Every P[k] with k > ${i} includes A[${i}], so each one is now off by ${d}.`,
    lines: ['update.sig', 'pu.d', 'pu.set'],
    level: 2,
    vars: vars(w, { i, x, d, 'update cost': 0 }),
    extra: { range },
  };
  let cost = 0;
  for (let k = i + 1; k <= n; k++) {
    const before = w.p[k]!;
    w.p[k] = before + d;
    cost += 1;
    yield {
      state: copy(w),
      marks: [mark(`p-${k}`, 'new')],
      say: `P[${k}] = P[${k}] + d = ${plus(before, d)} = ${w.p[k]}. P[${k}] covers ${span(0, k - 1)}, which includes A[${i}].`,
      lines: ['pu.loop', 'pu.add'],
      level: 3,
      vars: vars(w, { i, x, d, k, 'update cost': cost }),
      extra: { range, spans: [{ to: k, label: `P[${k}] = ${w.p[k]}`, role: 'active' }] },
    };
  }
  yield {
    state: copy(w),
    marks: Array.from({ length: n - i }, (_, k) => mark(`p-${i + 1 + k}`, 'done')),
    say: `Done: ${cost === 1 ? `1 entry of P changed, P[${n}]` : `${cost} entries of P changed, P[${i + 1}] to P[${n}]`}. One changed value costs O(n) here. A Fenwick tree or a segment tree makes both updates and sums O(log n).`,
    lines: [],
    level: 1,
    vars: vars(w, { i, x, d, 'update cost': cost }),
    extra: { range },
  };
  return copy(w);
}

function* updateSparse(s: S, i: number, x: number): Generator<RQStep, S, void> {
  const w = copy(s);
  const n = w.a.length;
  const K = levels(n);
  const old = w.a[i]!;
  w.a[i] = x;
  w.m[0]![i] = x;
  const range = { lo: i, hi: i, label: `update(${i}, ${x})` };
  yield {
    state: copy(w),
    marks: [mark(`a-${i}`, 'active')],
    say:
      K === 0
        ? `update(${i}, ${x}): A[${i}] changes from ${old} to ${x}. Row 0 is the whole table, so that is all.`
        : `update(${i}, ${x}): A[${i}], which is also M[0][${i}], changes from ${old} to ${x}. In row k, every window that contains position ${i} may change: those starting from ${i} − 2^k + 1 up to ${i}, at most 2^k of them.`,
    lines: ['update.sig', 'su.set'],
    level: 2,
    vars: vars(w, { i, x, 'update cost': 0 }),
    extra: { range },
  };
  let cost = 0;
  for (let k = 1; k <= K; k++) {
    const len = 2 ** k;
    const half = len / 2;
    const first = Math.max(0, i - len + 1);
    const last = Math.min(i, n - len);
    for (let t = first; t <= last; t++) {
      const p = w.m[k - 1]![t]!;
      const q = w.m[k - 1]![t + half]!;
      w.m[k]![t] = Math.min(p, q);
      cost += 1;
      yield {
        state: copy(w),
        marks: [
          mark(cellId(k - 1, t), 'compare'),
          mark(cellId(k - 1, t + half), 'compare'),
          mark(cellId(k, t), 'new'),
        ],
        say: `M[${k}][${t}] = min(M[${k - 1}][${t}], M[${k - 1}][${t + half}]) = min(${p}, ${q}) = ${w.m[k]![t]}: its window, ${span(t, t + len - 1)}, contains A[${i}].`,
        lines: ['su.level', 'su.loop', 'su.min'],
        level: 3,
        vars: vars(w, { i, x, k, 'update cost': cost }),
        extra: {
          range,
          windows: [
            {
              lo: t,
              hi: t + len - 1,
              label: `M[${k}][${t}] = ${w.m[k]![t]}`,
              role: 'active',
              lane: 0,
            },
            { lo: t, hi: t + half - 1, label: String(p), lane: 1 },
            { lo: t + half, hi: t + len - 1, label: String(q), lane: 1 },
          ],
        },
      };
    }
    const count = last - first + 1;
    yield {
      state: copy(w),
      marks: Array.from({ length: count }, (_, d) => mark(cellId(k, first + d), 'done')),
      say:
        k < K
          ? `Row k = ${k}: ${plural(count, 'window')} of ${len} contain${count === 1 ? 's' : ''} A[${i}], and ${count === 1 ? 'it is' : 'all are'} recomputed.`
          : `Row k = ${k}: ${plural(count, 'window')} of ${len} contain${count === 1 ? 's' : ''} A[${i}]. Done: ${plural(cost, 'entry', 'entries')} recomputed in all. One changed value costs O(n) here, because row k has up to 2^k windows that contain it. A sparse table is for arrays that do not change.`,
      lines: ['su.level'],
      level: k < K ? 2 : 1,
      vars: vars(w, { i, x, k, 'update cost': cost }),
      extra: { range },
    };
  }
  return copy(w);
}

const update: Op = {
  label: 'Update',
  arity: 2,
  *run(s, [ri, rx], { settings }) {
    const sig = sigOf('update');
    const i = readIndex(ri);
    const x = readNumber(rx);
    if (typeof i === 'string') return yield* refuse(s, `update(i, x): ${i}`, sig);
    if (typeof x === 'string') return yield* refuse(s, `update(${i}, x): ${x}`, sig);
    const n = s.a.length;
    if (i < 0 || i >= n)
      return yield* refuse(
        s,
        `update(${i}, ${x}): there is no A[${i}]. A has ${plural(n, 'value')}, A[0] to A[${n - 1}].`,
        sig,
      );
    if (s.a[i] === x) {
      yield {
        state: s,
        marks: [mark(`a-${i}`, 'found')],
        say: `update(${i}, ${x}): A[${i}] is already ${x}, so nothing changes.`,
        lines: ['update.sig'],
        level: 1,
        vars: vars(s, { i, x, 'update cost': 0 }),
      };
      return s;
    }
    return settings.structure === 'sparse'
      ? yield* updateSparse(s, i, x)
      : yield* updatePrefix(s, i, x);
  },
};

/**
 * Every step of an operation carries step data, even an empty one: the view keeps room for
 * brackets and arrows only while an operation runs, and a step without data is a plain picture.
 */
function steady(op: Op): Op {
  return {
    ...op,
    *run(s, args, ctx) {
      const gen = op.run(s, args, ctx);
      let r = gen.next();
      while (!r.done) {
        yield { ...r.value, extra: r.value.extra ?? {} };
        r = gen.next();
      }
      return r.value;
    },
  };
}

export const ops = { query: steady(query), build: steady(build), update: steady(update) };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

/** The signature line of an operation, for refusals. Both structures use these ids. */
function sigOf(op: 'build' | 'query' | 'update'): string {
  return `${op}.sig`;
}

export function pseudocode(settings: RQSettings): PseudoBlock[] {
  if (settings.structure === 'sparse') {
    return [
      {
        op: 'query',
        lines: [
          L('query.sig', 0, 'min(i, j)', 'To find the smallest of A[i] through A[j]:'),
          L(
            'sq.k',
            1,
            'k = ⌊log₂(j − i + 1)⌋',
            'find the longest power-of-two length that fits in the range,',
          ),
          L(
            'sq.ret',
            1,
            'return min(M[k][i], M[k][j − 2^k + 1])',
            'and compare the window of that length that starts at i with the one that ends at j.',
          ),
        ],
      },
      {
        op: 'build',
        lines: [
          L('build.sig', 0, 'build(A)', 'To build the table from A:'),
          L('sb.base', 1, 'M[0][i] = A[i] for every i', 'windows of one value are the values.'),
          L(
            'sb.level',
            1,
            'for k = 1 while 2^k ≤ n',
            'For each window length 2, 4, 8, … that fits in A,',
          ),
          L('sb.loop', 2, 'for i = 0 to n − 2^k', 'and each place a window of that length fits,'),
          L(
            'sb.min',
            3,
            'M[k][i] = min(M[k−1][i], M[k−1][i + 2^(k−1)])',
            'keep the smaller of its two halves.',
          ),
        ],
      },
      {
        op: 'update',
        lines: [
          L('update.sig', 0, 'update(i, x)', 'To change A[i] to x:'),
          L('su.set', 1, 'A[i] = M[0][i] = x', 'store the new value,'),
          L('su.level', 1, 'for k = 1 while 2^k ≤ n', 'then for each window length,'),
          L(
            'su.loop',
            2,
            'for t = max(0, i − 2^k + 1) to min(i, n − 2^k)',
            'for each window of that length that contains position i,',
          ),
          L(
            'su.min',
            3,
            'M[k][t] = min(M[k−1][t], M[k−1][t + 2^(k−1)])',
            'recompute it from its two halves.',
          ),
        ],
      },
    ];
  }
  return [
    {
      op: 'query',
      lines: [
        L('query.sig', 0, 'sum(i, j)', 'To add up A[i] through A[j], both included:'),
        L(
          'pq.ret',
          1,
          'return P[j + 1] − P[i]',
          'take the sum up to A[j] and subtract the sum before A[i].',
        ),
      ],
    },
    {
      op: 'build',
      lines: [
        L('build.sig', 0, 'build(A)', 'To build P from A:'),
        L('pb.zero', 1, 'P[0] = 0', 'the sum of no values is 0.'),
        L('pb.loop', 1, 'for k = 0 to n − 1', 'For each value in A, left to right,'),
        L('pb.add', 2, 'P[k + 1] = P[k] + A[k]', 'add it to the sum so far.'),
        L('pb.note', 0, '// P[k] = A[0] + … + A[k − 1]', 'P[k] is the sum of the first k values.'),
      ],
    },
    {
      op: 'update',
      lines: [
        L('update.sig', 0, 'update(i, x)', 'To change A[i] to x:'),
        L('pu.d', 1, 'd = x − A[i]', 'work out how much it changes by,'),
        L('pu.set', 1, 'A[i] = x', 'store the new value,'),
        L('pu.loop', 1, 'for k = i + 1 to n', 'and for every prefix that includes A[i],'),
        L('pu.add', 2, 'P[k] = P[k] + d', 'add the change.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(state: S, settings: RQSettings): string {
  const n = state.a.length;
  return settings.structure === 'sparse'
    ? `A holds ${plural(n, 'value')}, and its sparse table is built: row k holds the smallest value of every window of 2^k values. Query a range by typing two indices, such as 2 5, or build the table from your own list.`
    : `A holds ${plural(n, 'value')}, and P, its prefix sums, is built. P[k] is the sum of the first k values, A[0..k) (0-based and half-open: up to but not including A[k]), so sum(i, j) = P[j + 1] − P[i]. Query a range by typing two indices, such as 2 5, or build P from your own list.`;
}

export function initialVars(state: S) {
  return vars(state);
}

const listText = (xs: (number | null)[]) =>
  xs.map((v) => (v === null ? 'not computed yet' : String(v))).join(', ');

export function describe(state: S, settings: RQSettings): string {
  const n = state.a.length;
  const a = `A holds ${plural(n, 'value')}, from A[0]: ${state.a.join(', ')}.`;
  if (settings.structure === 'sparse') {
    const rows = state.m
      .slice(1)
      .map((r, k) => `Row k = ${k + 1}, windows of ${2 ** (k + 1)}: ${listText(r)}.`);
    return [a, ...rows].join(' ');
  }
  return `${a} P, from P[0]: ${listText(state.p)}.`;
}
