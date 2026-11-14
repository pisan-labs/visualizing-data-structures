/**
 * Product quantization (Jégou, Douze and Schmid 2011), on at most 10 vectors of 4 whole numbers
 * from 0 to 10.
 *
 *   train    split every vector into m pieces of 4/m numbers; run k-means (the k-means page's
 *            rules, kmeans.ts) on each piece's sub-vectors to get a codebook of k* centres
 *   encode   store each vector as m codes: for each piece, the number of its nearest centre
 *   search   asymmetric distance computation (ADC): the query stays exact; a table holds the
 *            squared distance from each piece of the query to every centre of that piece's
 *            codebook (m·k* entries), and a stored vector's distance is the sum of the m entries
 *            its code picks. Compared with the exact distance, and the K = 3 nearest by the table
 *            with the true K nearest
 *
 * Settings: pieces m (1, 2 or 4) and the codebook size k* (2, 4 or 8, so a code takes
 * m·log₂ k* bits). Ties: a piece nearest two centres takes the lower code; vectors are ranked
 * by (distance, the order they were loaded).
 *
 * Operations: load (vectors), train, encode, search (one vector).
 */
import type { Rng } from '../../engine/rng';
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { nameOf, shuffled } from '../_retrieve/points';
import { num } from '../k-means/model';
import { dist2, lloyd, nearest, seedPlus } from './kmeans';

export { num };

export const D = 4;
export const MOST = 10;
export const MAX = 10;
export const K = 3;
/** Bits in one stored number: 32-bit floats. */
export const FLOAT_BITS = 32;

export type Pieces = '1' | '2' | '4';
export type Size = '2' | '4' | '8';

export interface PqSettings {
  [key: string]: Scalar;
  pieces: Pieces;
  size: Size;
}

export const defaults: PqSettings = { pieces: '2', size: '4' };

export interface Vec4 {
  id: number;
  name: string;
  v: number[];
}

export interface PqSearch {
  q: number[];
  /** table[j][c]: d² from the query's piece j to centre c of codebook j. */
  table: number[][];
  approx: number[];
  exact: number[];
  /** The K nearest by the table, and the true K nearest, as vector indices. */
  found: number[];
  truth: number[];
}

export interface PqState {
  vecs: Vec4[];
  /** The pieces and codebook size the codebooks were trained with; 0 before training. */
  m: number;
  ks: number;
  /** books[j][c]: centre c of piece j's codebook. */
  books: number[][][];
  /** Every uniform number k-means++ drew, piece by piece (for the code tabs). */
  draws: number[];
  /** codes[i][j]: vector i's code for piece j; null until the vectors are encoded. */
  codes: number[][] | null;
  last?: PqSearch;
}

export interface PqExtra {
  /** Training: the piece whose codebook is changing, and its sub-vectors' clusters. */
  piece?: number;
  labels?: number[];
  /** The vector being encoded or scored. */
  vec?: number;
  /** Encoding: d² from the vector's piece j to each centre of codebook j. */
  dd?: number[][];
  /** Searching: the query, the table rows filled so far, and the distances worked out so far. */
  q?: number[];
  table?: number[][];
  approx?: number[];
}

type S = PqState;
type X = PqExtra;
type Op = OpSpec<S, PqSettings, X>;
type PStep = Step<S, X>;
type Gen = Generator<PStep, S, void>;

export const piecesOf = (s: PqSettings) =>
  ['1', '2', '4'].includes(String(s.pieces)) ? Number(s.pieces) : 2;
export const sizeOf = (s: PqSettings) =>
  ['2', '4', '8'].includes(String(s.size)) ? Number(s.size) : 4;
export const bitsOf = (m: number, ks: number) => m * Math.log2(ks);
export const rowId = (v: Vec4) => `r-${v.id}`;
export const dotId = (j: number, v: Vec4) => `s${j}-${v.id}`;
export const centreId = (j: number, c: number) => `k${j}-${c}`;
export const cellId = (j: number, c: number) => `t-${j}-${c}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export function init(): S {
  return { vecs: [], m: 0, ks: 0, books: [], draws: [], codes: null };
}

// ---------------------------------------------------------------------------------------------
// The arithmetic, shared with the tests and the practice questions

/** Piece j of v when it is cut into m pieces. */
export const pieceOf = (v: readonly number[], m: number, j: number) => {
  const w = D / m;
  return v.slice(j * w, (j + 1) * w);
};

/** The m codes of a vector: the nearest centre of each piece's codebook. */
export const encode = (v: readonly number[], books: readonly number[][][]) =>
  books.map((book, j) => nearest(pieceOf(v, books.length, j), book));

/** The vector a code stands for: its centres, one per piece, side by side. */
export const decode = (code: readonly number[], books: readonly number[][][]) =>
  code.flatMap((c, j) => books[j]![c]!);

/** The distance table for a query: d² from each of its pieces to every centre of that piece. */
export const adcTable = (q: readonly number[], books: readonly number[][][]) =>
  books.map((book, j) => book.map((c) => dist2(pieceOf(q, books.length, j), c)));

/** A stored vector's distance by the table: the entries its code picks, added in order. */
export function adc(table: readonly number[][], code: readonly number[]): number {
  let t = 0;
  code.forEach((c, j) => (t += table[j]![c]!));
  return t;
}

/** The k smallest values' indices, ties to the lower index. */
export function smallest(xs: readonly number[], k = K): number[] {
  return xs
    .map((d, i) => [d, i] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, k)
    .map(([, i]) => i);
}

// ---------------------------------------------------------------------------------------------
// Reading vectors

/** Vectors typed as "1,8,3,2 2,7,1,1", or a count of random ones. */
export function readVectors(text: string): number[][] | string {
  const t = text.trim();
  if (!t) return 'Type vectors such as 1,8,3,2 2,7,1,1.';
  const re =
    /\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/g;
  const found = [...t.matchAll(re)];
  if (t.replace(re, '').replace(/[\s;]+/g, '') !== '' || !found.length)
    return 'Write each vector as four numbers with commas, such as 1,8,3,2, and separate vectors with spaces.';
  const vs = found.map((m) => [m[1], m[2], m[3], m[4]].map(Number));
  if (vs.some((v) => v.some((x) => !Number.isInteger(x))))
    return 'Use whole numbers, such as 1,8,3,2.';
  if (vs.some((v) => v.some((x) => x < 0 || x > MAX))) return `Keep the numbers from 0 to ${MAX}.`;
  if (vs.length > MOST) return `At most ${MOST} vectors.`;
  return vs;
}

export const writeVectors = (vs: readonly (readonly number[])[]) =>
  vs.map((v) => v.join(',')).join(' ');

/** The input box: a list of vectors, or a count of random ones. */
export function parseVectors(token: string): Value | Error {
  const t = token.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n < 1 || n > MOST) return new Error(`For random vectors, pick a count from 1 to ${MOST}.`);
    return n;
  }
  const vs = readVectors(t);
  return typeof vs === 'string' ? new Error(vs) : writeVectors(vs);
}

// ---------------------------------------------------------------------------------------------
// Narration helpers

export function vars(
  s: S,
  set: PqSettings,
  extra: Record<string, Scalar> = {},
): Record<string, Scalar> {
  const m = s.m || piecesOf(set);
  const ks = s.ks || sizeOf(set);
  return {
    N: s.vecs.length,
    pieces: m,
    'codebook size': ks,
    'bits per vector': bitsOf(m, ks),
    'raw bits': D * FLOAT_BITS,
    ...extra,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "(1, 8 | 3, 2)": the numbers with a bar between pieces. */
export function cut(v: readonly number[], m: number): string {
  const w = D / m;
  return `(${Array.from({ length: m }, (_, j) =>
    v
      .slice(j * w, (j + 1) * w)
      .map(num)
      .join(', '),
  ).join(' | ')})`;
}
/** "(1.5, 7.5)" or "3": one piece or centre. */
export const piece = (p: readonly number[]) =>
  p.length === 1 ? num(p[0]!) : `(${p.map(num).join(', ')})`;
const vecText = (v: Vec4, m: number) => `${v.name} ${cut(v.v, m)}`;
const codeText = (code: readonly number[]) => code.join(' ');
const which = (m: number, j: number) => {
  const w = D / m;
  const idx = Array.from({ length: w }, (_, i) => `x${'₁₂₃₄'[j * w + i]}`);
  return idx.length === 1 ? idx[0]! : `${idx.slice(0, -1).join(', ')} and ${idx.at(-1)}`;
};

function stop(s: S, set: PqSettings, say: string): PStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, set) };
}

function* fail(s: S, set: PqSettings, say: string): Gen {
  yield stop(s, set, say);
  return s;
}

/** n random vectors, for Load with a count. */
export function randomVectors(rng: Rng, n: number): number[][] {
  return Array.from({ length: n }, () => Array.from({ length: D }, () => rng.int(0, MAX)));
}

const clamp = (x: number) => Math.max(0, Math.min(MAX, x));

/** n vectors near a few prototypes: each number moved by at most 1. */
export function nearPrototypes(rng: Rng, n: number, k = 4): number[][] {
  const protos = Array.from({ length: k }, () =>
    Array.from({ length: D }, () => rng.int(1, MAX - 1)),
  );
  return shuffled(
    rng,
    Array.from({ length: n }, (_, i) => protos[i % k]!.map((x) => clamp(x + rng.int(-1, 1)))),
  );
}

// ---------------------------------------------------------------------------------------------
// Operations

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s0, args, { settings, rng }) {
    const a = args[0];
    let vs: number[][] | string;
    if (typeof a === 'number' || (typeof a === 'string' && /^\s*\d+\s*$/.test(a))) {
      const n = Number(a);
      vs =
        Number.isInteger(n) && n >= 1 && n <= MOST
          ? randomVectors(rng, n)
          : `For random vectors, pick a count from 1 to ${MOST}.`;
    } else vs = typeof a === 'string' ? readVectors(a) : 'Type vectors such as 1,8,3,2 2,7,1,1.';
    if (typeof vs === 'string') return yield* fail(s0, settings, vs);
    const next: S = { ...init(), vecs: vs.map((v, i) => ({ id: i, name: nameOf(i + 1), v })) };
    const m = piecesOf(settings);
    yield {
      state: next,
      marks: next.vecs.map((v) => mark(rowId(v), 'new')),
      say: `${plural(vs.length, 'vector')} of ${D} numbers: ${next.vecs.map((v) => vecText(v, m)).join(', ')}. Stored as 32-bit floats, each takes ${D * FLOAT_BITS} bits. Press Train to build ${m === 1 ? 'a codebook' : `${m} codebooks, one per piece`}.`,
      lines: ['lload'],
      level: 1,
      vars: vars(next, settings),
    };
    return next;
  },
};

const trainOp: Op = {
  label: 'Train',
  arity: 0,
  *run(s0, _args, { settings, rng }) {
    if (!s0.vecs.length) return yield* fail(s0, settings, 'Load some vectors first.');
    const m = piecesOf(settings);
    const ks = sizeOf(settings);
    const n = s0.vecs.length;
    if (n < ks)
      return yield* fail(
        s0,
        settings,
        `A codebook of ${ks} centres needs at least ${ks} vectors to train on, and there ${n === 1 ? 'is' : 'are'} ${n}. Load more vectors or pick a smaller codebook.`,
      );
    const books: number[][][] = [];
    const draws: number[] = [];
    const base: S = { ...init(), vecs: s0.vecs, m, ks };
    const cur = (): S => ({
      ...base,
      books: books.map((b) => b.map((c) => [...c])),
      draws: [...draws],
    });
    for (let j = 0; j < m; j++) {
      const sub = s0.vecs.map((v) => pieceOf(v.v, m, j));
      const us = Array.from({ length: ks }, () => rng.next());
      draws.push(...us);
      const seeds = seedPlus(sub, us);
      books[j] = seeds.map((i) => [...sub[i]!]);
      const seeded = cur();
      yield {
        state: seeded,
        marks: books[j]!.map((_, c) => mark(centreId(j, c), 'new')),
        say: `${m === 1 ? 'The whole vector is one piece' : `Piece ${j + 1} is ${which(m, j)}`}. Run k-means on the ${n} ${m === 1 ? 'vectors' : 'pieces'} with k = ${ks}. k-means++ starts from ${seeds.map((i) => s0.vecs[i]!.name).join(', ')}: ${seeds.map((i, c) => `centre ${c} = ${piece(sub[i]!)}`).join(', ')}.`,
        lines: ['tseed'],
        level: 3,
        vars: vars(seeded, settings),
        extra: { piece: j },
      };
      const run = lloyd(sub, books[j]!);
      for (const [i, r] of run.history.entries()) {
        books[j] = r.centres.map((c) => [...c]);
        const st = cur();
        yield {
          state: st,
          marks: [],
          say: `Piece ${j + 1}, k-means round ${i + 1}: every ${m === 1 ? 'vector' : 'piece'} joins its nearest centre, then every centre moves to the mean of its ${m === 1 ? 'vectors' : 'pieces'}: ${r.centres.map((c, k) => `${k} = ${piece(c)}`).join(', ')}.`,
          lines: ['tround'],
          level: 3,
          vars: vars(st, settings, { round: i + 1 }),
          extra: { piece: j, labels: r.labels },
        };
      }
      books[j] = run.centres;
      const done = cur();
      const labels = sub.map((p) => nearest(p, run.centres));
      yield {
        state: done,
        marks: books[j]!.map((_, c) => mark(centreId(j, c), 'found')),
        say: `Codebook ${j + 1}${m === 1 ? '' : ` (${which(m, j)})`}: ${plural(ks, 'centre')} after ${plural(run.rounds, 'round')} of k-means: ${run.centres.map((c, k) => `${k} = ${piece(c)}`).join(', ')}.`,
        lines: ['tbook'],
        level: 2,
        vars: vars(done, settings),
        extra: { piece: j, labels },
      };
    }
    const next = cur();
    const numbers = m * ks * (D / m);
    yield {
      state: next,
      marks: [],
      say: `Trained ${m === 1 ? `one codebook of ${ks} centres` : `${m} codebooks of ${ks} centres each`}: ${numbers} numbers in all, shared by every vector. A code picks one centre per piece, so ${m === 1 ? `there are only ${ks} different vectors a code can stand for` : `the codes can stand for ${Array.from({ length: m }, () => ks).join(' × ')} = ${ks ** m} different vectors, from only ${m * ks} stored centres`}. Press Encode.`,
      lines: ['tret'],
      level: 1,
      vars: vars(next, settings),
    };
    return next;
  },
};

const encodeOp: Op = {
  label: 'Encode',
  arity: 0,
  *run(s0, _args, { settings }) {
    if (!s0.vecs.length) return yield* fail(s0, settings, 'Load some vectors first.');
    if (!s0.books.length)
      return yield* fail(
        s0,
        settings,
        'Train the codebooks first: a code is a list of centre numbers.',
      );
    const { m, ks, books } = s0;
    const codes: number[][] = [];
    const base: S = { ...s0, codes: null, last: undefined };
    let err = 0;
    for (const [i, v] of s0.vecs.entries()) {
      const dd = books.map((book, j) => book.map((c) => dist2(pieceOf(v.v, m, j), c)));
      const code = encode(v.v, books);
      codes.push(code);
      const e = dist2(v.v, decode(code, books));
      err += e;
      const cur: S = { ...base, codes: codes.map((c) => [...c]) };
      const parts = code.map(
        (c, j) =>
          `${m === 1 ? '' : `piece ${j + 1} ${piece(pieceOf(v.v, m, j))} is `}nearest centre ${c} ${piece(books[j]![c]!)}, d² ${num(dd[j]![c]!)}`,
      );
      yield {
        state: cur,
        marks: [mark(rowId(v), 'active'), ...code.map((c, j) => mark(centreId(j, c), 'found'))],
        say: `${vecText(v, m)}: ${parts.join('; ')}. Code: ${codeText(code)}. It stands for ${cut(decode(code, books), m)}, off by ${num(e)} (squared).`,
        lines: ['efor', 'ecode'],
        level: 2,
        vars: vars(cur, settings, { 'distance computations': (i + 1) * m * ks }),
        extra: { vec: i, dd },
      };
    }
    const next: S = { ...base, codes };
    const bits = bitsOf(m, ks);
    const n = s0.vecs.length;
    yield {
      state: next,
      marks: [],
      say: `Every vector is now ${plural(m, 'code')} of ${plural(Math.log2(ks), 'bit')}: ${plural(bits, 'bit')} a vector, ${n * bits} for all ${n}, against ${D * FLOAT_BITS} bits a vector for ${D} floats (${num((D * FLOAT_BITS) / bits)} times smaller). The price: each vector is replaced by its centres, and the squared errors add up to ${num(err)}.`,
      lines: ['eret'],
      level: 1,
      vars: vars(next, settings, { 'squared error': Math.round(err * 100) / 100 }),
    };
    return next;
  },
};

const searchOp: Op = {
  label: 'Search',
  arity: 1,
  *run(s0, args, { settings }) {
    if (!s0.vecs.length) return yield* fail(s0, settings, 'Load some vectors first.');
    if (!s0.codes)
      return yield* fail(
        s0,
        settings,
        s0.books.length
          ? 'Encode the vectors first: the search reads their codes.'
          : 'Train the codebooks and encode the vectors first.',
      );
    const a = args[0];
    const qs = typeof a === 'string' ? readVectors(a) : 'Search takes one vector, such as 2,7,3,3.';
    if (typeof qs === 'string' || qs.length !== 1)
      return yield* fail(
        s0,
        settings,
        typeof qs === 'string' ? qs : 'Search takes one vector, such as 2,7,3,3.',
      );
    const q = qs[0]!;
    const { m, ks, books, codes } = s0;
    const s: S = { ...s0, last: undefined };
    const table: number[][] = [];
    for (let j = 0; j < m; j++) {
      const qj = pieceOf(q, m, j);
      table.push(books[j]!.map((c) => dist2(qj, c)));
      yield {
        state: s,
        marks: books[j]!.map((_, c) => mark(cellId(j, c), 'new')),
        say: `${j === 0 ? `Search for the vectors nearest q = ${cut(q, m)}. The query is not encoded: it stays exact, and only the stored vectors are approximate (asymmetric distance). ` : ''}${m === 1 ? `Measure q against every centre: ${table[0]!.map((d, c) => `${c} → ${num(d)}`).join(', ')}. That is the whole table.` : `Row ${j + 1} of the table: q's piece ${j + 1}, ${piece(qj)}, against the ${ks} centres of codebook ${j + 1}: ${table[j]!.map((d, c) => `${c} → ${num(d)}`).join(', ')}.`}`,
        lines: ['stable'],
        level: 2,
        vars: vars(s, settings, { 'table entries': table.length * ks }),
        extra: { q, table: table.map((r) => [...r]) },
      };
    }
    const approx: number[] = [];
    const exact = s.vecs.map((v) => dist2(q, v.v));
    for (const [i, v] of s.vecs.entries()) {
      const code = codes[i]!;
      const d = adc(table, code);
      approx.push(d);
      const diff = d - exact[i]!;
      yield {
        state: s,
        marks: [mark(rowId(v), 'active'), ...code.map((c, j) => mark(cellId(j, c), 'found'))],
        say: `${v.name}, code ${codeText(code)}: ${m === 1 ? `look up entry ${code[0]}: ${num(d)}` : `look up ${code.map((c, j) => `row ${j + 1} entry ${c}`).join(', ')}: ${code.map((c, j) => num(table[j]![c]!)).join(' + ')} = ${num(d)}`}. The exact d² is ${num(exact[i]!)}: ${Math.abs(diff) < 1e-9 ? 'no error' : `off by ${diff > 0 ? '+' : '−'}${num(Math.abs(diff))}`}.`,
        lines: ['sfor', 'ssum'],
        level: 2,
        vars: vars(s, settings, { 'table entries': m * ks, lookups: (i + 1) * m }),
        extra: { q, table: table.map((r) => [...r]), approx: [...approx], vec: i },
      };
    }
    const found = smallest(approx);
    const truth = smallest(exact);
    const done: PqSearch = { q, table, approx, exact, found, truth };
    const next: S = { ...s, last: done };
    const n = s.vecs.length;
    const hit = found.filter((i) => truth.includes(i)).length;
    const total = Math.min(K, n);
    const nm = (xs: number[], ds: number[]) =>
      xs.map((i) => `${s.vecs[i]!.name} ${num(ds[i]!)}`).join(', ');
    let worst = 0;
    exact.forEach((e, i) => {
      if (Math.abs(approx[i]! - e) > Math.abs(approx[worst]! - exact[worst]!)) worst = i;
    });
    const same = found.join() === truth.join();
    yield {
      state: next,
      marks: [],
      say: `By the table, the nearest are ${nm(found, approx)}; exactly, ${nm(truth, exact)}. ${same ? 'The same, in the same order.' : `Recall ${hit}/${total}${hit === total ? ': the same vectors, in a different order' : ''}.`} The table took ${m * ks} distances on pieces of ${D / m} number${m === 4 ? '' : 's'}; then each vector cost ${m === 1 ? 'one lookup' : `${m} lookups and ${m - 1} addition${m === 2 ? '' : 's'}`}. ${Math.abs(approx[worst]! - exact[worst]!) < 1e-9 ? 'Every distance is exact: every piece of every vector sits on a centre.' : `The largest error is ${num(Math.abs(approx[worst]! - exact[worst]!))}, for ${s.vecs[worst]!.name}.`}`,
      lines: ['sret'],
      level: 1,
      vars: vars(next, settings, {
        'table entries': m * ks,
        lookups: n * m,
        recall: Math.round((100 * hit) / total) / 100,
      }),
    };
    return next;
  },
};

export const ops = { load: loadOp, train: trainOp, encode: encodeOp, search: searchOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(set: PqSettings): PseudoBlock[] {
  const m = piecesOf(set);
  const ks = sizeOf(set);
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(vectors)', 'Start from some vectors'),
        L('lload', 1, `x₁ … x_N, each of ${D} numbers`, 'of four numbers each.'),
      ],
    },
    {
      op: 'train',
      lines: [
        L('tsig', 0, `TRAIN(vectors, m = ${m}, k* = ${ks})`, 'Build the codebooks:'),
        L(
          'tfor',
          1,
          'for each piece j = 1 … m',
          `cut every vector into ${m === 1 ? 'one piece' : `${m} pieces`},`,
        ),
        L(
          'tseed',
          2,
          `start from k* k-means++ seeds among the pieces u_j(x)`,
          'and for each piece pick spread-out starting centres,',
        ),
        L(
          'tround',
          2,
          'repeat: assign each u_j(x) to its nearest centre; move each centre to the mean',
          'run k-means on that piece alone,',
        ),
        L('tbook', 2, 'codebook_j = the k* centres', 'and keep its centres as the codebook.'),
        L('tret', 1, 'return codebook_1 … codebook_m', `A code can stand for k*^m vectors.`),
      ],
    },
    {
      op: 'encode',
      lines: [
        L('esig', 0, 'ENCODE(vectors)', 'Compress every vector:'),
        L('efor', 1, 'for each vector x', 'for each vector,'),
        L(
          'ecode',
          2,
          'code(x)_j = the c with the least |u_j(x) − codebook_j[c]|²',
          'store the number of the nearest centre of each piece.',
        ),
        L(
          'eret',
          1,
          `return the codes (m·log₂ k* = ${bitsOf(m, ks)} bits each)`,
          'Keep the codes; throw the vectors away.',
        ),
      ],
    },
    {
      op: 'search',
      lines: [
        L('ssig', 0, `SEARCH(q, k = ${K})`, 'Find the vectors nearest q:'),
        L(
          'stable',
          1,
          'T[j][c] = |u_j(q) − codebook_j[c]|² for every piece j and centre c',
          'measure each piece of q against its codebook, once,',
        ),
        L('sfor', 1, 'for each stored code', 'then for each stored vector'),
        L('ssum', 2, 'd(q, x) ≈ Σ_j T[j][code(x)_j]', 'add up the table entries its code picks.'),
        L('sret', 1, 'return the k with the least sums', 'The smallest sums win.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words

export function initialSay(): string {
  return 'No vectors yet. Load some (four numbers each, or a count for random ones), then Train: k-means on each piece of the vectors makes a codebook. Encode stores each vector as a few small numbers, and Search measures a query against the codes with a table.';
}

export const initialVars = (s: S, set: PqSettings) => vars(s, set);

export function describe(s: S): string {
  if (!s.vecs.length) return 'No vectors.';
  const m = s.m || 2;
  const vs = `Vectors: ${s.vecs.map((v) => vecText(v, m)).join(', ')}.`;
  if (!s.books.length) return `${vs} No codebooks yet.`;
  const books = s.books
    .map((b, j) => `codebook ${j + 1}: ${b.map((c, k) => `${k} = ${piece(c)}`).join(', ')}`)
    .join('; ');
  const codes = s.codes
    ? ` Codes: ${s.codes.map((c, i) => `${s.vecs[i]!.name} ${codeText(c)}`).join(', ')}.`
    : '';
  const last = s.last
    ? ` Last search for ${cut(s.last.q, m)}: by the table ${s.last.found.map((i) => s.vecs[i]!.name).join(', ')}; exactly ${s.last.truth.map((i) => s.vecs[i]!.name).join(', ')}.`
    : '';
  return `${vs} ${books}.${codes}${last}`;
}
