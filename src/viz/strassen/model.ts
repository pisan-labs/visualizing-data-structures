/**
 * Strassen's matrix multiplication. Split A and B into four (n/2) × (n/2) blocks each. The
 * block product needs eight half-size products (A11·B11 + A12·B21 and so on); Strassen found a
 * way with seven, paid for with 18 block additions instead of 4. Recursing gives
 * T(n) = 7T(n/2) + Θ(n²) = Θ(n^log₂7) ≈ n^2.81 scalar multiplications instead of n³.
 *
 * Settings
 *   method   'strassen' (seven products) or 'block' (the plain divide and conquer, eight)
 *   names    how the seven products are written: 'clrs' (CLRS 4.2: ten sums S1..S10, then
 *            P1..P7) or 'm' (Strassen's own grouping, as on most slides: M1..M7, each a product
 *            of two sums). The same arithmetic, in a different order.
 *
 * The run is planned up front (every call, its operands and its product), and the steps walk
 * through it: split, sums, the products one by one (each a recursive call), then combine. A
 * size that is not a power of 2 is padded with zeros up to the next one, as real code must.
 * For 8 × 8, the scalar products of each 2 × 2 call are shown together, in one step.
 */
import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, mark, plural } from '../_recursion/kit';

export type Method = 'strassen' | 'block';
export type Names = 'clrs' | 'm';

export interface StSettings {
  [key: string]: Scalar;
  method: Method;
  names: Names;
}

export const defaults: StSettings = { method: 'strassen', names: 'clrs' };

export type Mat = number[][];

export const MAX_N = 8;
export const MAX_ENTRY = 9;

// ---------------------------------------------------------------------------------------------
// The schemes

export type Quad = 'A11' | 'A12' | 'A21' | 'A22' | 'B11' | 'B12' | 'B21' | 'B22';
/** A sum of blocks: each term a sign and a block. */
export type Expr = [1 | -1, Quad][];

export interface ProductSpec {
  name: string;
  left: Expr;
  right: Expr;
  /** How the factors are written: a block, a named sum (S1) or a sum in brackets. */
  leftText: string;
  rightText: string;
}

export interface Scheme {
  /** Sums computed first, by name (CLRS's S1..S10); empty when the products hold their sums. */
  sums: { name: string; expr: Expr }[];
  products: ProductSpec[];
  /** C11, C12, C21, C22 as signed sums of products (indices from 0). */
  combine: [1 | -1, number][][];
}

const e = (...ts: string[]): Expr =>
  ts.map((t) => [t.startsWith('-') ? -1 : 1, t.replace(/^[-+]/, '') as Quad]);

export const exprText = (x: Expr): string =>
  x.map(([sg, q], i) => (i === 0 ? (sg < 0 ? '−' : '') : sg < 0 ? ' − ' : ' + ') + q).join('');

const factor = (x: Expr) => (x.length === 1 ? x[0]![1] : `(${exprText(x).replace(/ /g, '')})`);

const CLRS_SUMS = [
  e('B12', '-B22'),
  e('A11', 'A12'),
  e('A21', 'A22'),
  e('B21', '-B11'),
  e('A11', 'A22'),
  e('B11', 'B22'),
  e('A12', '-A22'),
  e('B21', 'B22'),
  e('A11', '-A21'),
  e('B11', 'B12'),
];

const clrs: Scheme = {
  sums: CLRS_SUMS.map((expr, i) => ({ name: `S${i + 1}`, expr })),
  products: (
    [
      ['A11', 1],
      [2, 'B22'],
      [3, 'B11'],
      ['A22', 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ] as [Quad | number, Quad | number][]
  ).map(([l, r], i) => {
    const side = (x: Quad | number) =>
      typeof x === 'number'
        ? { expr: CLRS_SUMS[x - 1]!, text: `S${x}` }
        : { expr: e(x), text: x as string };
    const a = side(l);
    const b = side(r);
    return { name: `P${i + 1}`, left: a.expr, right: b.expr, leftText: a.text, rightText: b.text };
  }),
  combine: [
    [
      [1, 4],
      [1, 3],
      [-1, 1],
      [1, 5],
    ],
    [
      [1, 0],
      [1, 1],
    ],
    [
      [1, 2],
      [1, 3],
    ],
    [
      [1, 4],
      [1, 0],
      [-1, 2],
      [-1, 6],
    ],
  ],
};

const mSpecs: [Expr, Expr][] = [
  [e('A11', 'A22'), e('B11', 'B22')],
  [e('A21', 'A22'), e('B11')],
  [e('A11'), e('B12', '-B22')],
  [e('A22'), e('B21', '-B11')],
  [e('A11', 'A12'), e('B22')],
  [e('A21', '-A11'), e('B11', 'B12')],
  [e('A12', '-A22'), e('B21', 'B22')],
];

const mScheme: Scheme = {
  sums: [],
  products: mSpecs.map(([l, r], i) => ({
    name: `M${i + 1}`,
    left: l,
    right: r,
    leftText: factor(l),
    rightText: factor(r),
  })),
  combine: [
    [
      [1, 0],
      [1, 3],
      [-1, 4],
      [1, 6],
    ],
    [
      [1, 2],
      [1, 4],
    ],
    [
      [1, 1],
      [1, 3],
    ],
    [
      [1, 0],
      [-1, 1],
      [1, 2],
      [1, 5],
    ],
  ],
};

const blockPairs: [Quad, Quad][] = [
  ['A11', 'B11'],
  ['A12', 'B21'],
  ['A11', 'B12'],
  ['A12', 'B22'],
  ['A21', 'B11'],
  ['A22', 'B21'],
  ['A21', 'B12'],
  ['A22', 'B22'],
];

const block: Scheme = {
  sums: [],
  products: blockPairs.map(([l, r], i) => ({
    name: `P${i + 1}`,
    left: e(l),
    right: e(r),
    leftText: l,
    rightText: r,
  })),
  combine: [0, 2, 4, 6].map((k) => [
    [1, k],
    [1, k + 1],
  ]),
};

export function schemeOf(st: Pick<StSettings, 'method' | 'names'>): Scheme {
  if (st.method === 'block') return block;
  return st.names === 'm' ? mScheme : clrs;
}

/** Block additions a call makes: the sums before the products, and the combine. */
export function blockAdds(s: Scheme): { before: number; after: number } {
  const terms = (x: Expr) => x.length - 1;
  const before = s.sums.length
    ? s.sums.reduce((n, x) => n + terms(x.expr), 0)
    : s.products.reduce((n, p) => n + terms(p.left) + terms(p.right), 0);
  const after = s.combine.reduce((n, c) => n + c.length - 1, 0);
  return { before, after };
}

export const combineText = (s: Scheme, k: number): string =>
  s.combine[k]!.map(
    ([sg, i], j) => `${j === 0 ? '' : sg < 0 ? ' − ' : ' + '}${s.products[i]!.name}`,
  ).join('');

export const BLOCK_NAMES = ['C11', 'C12', 'C21', 'C22'] as const;

// ---------------------------------------------------------------------------------------------
// Matrices

export const zeros = (n: number): Mat => Array.from({ length: n }, () => Array<number>(n).fill(0));

export function mul(a: Mat, b: Mat): Mat {
  const n = a.length;
  return a.map((_, i) =>
    Array.from({ length: n }, (_, j) => a[i]!.reduce((s, x, k) => s + x * b[k]![j]!, 0)),
  );
}

export function quad(m: Mat, q: '11' | '12' | '21' | '22'): Mat {
  const h = m.length / 2;
  const r0 = q[0] === '1' ? 0 : h;
  const c0 = q[1] === '1' ? 0 : h;
  return m.slice(r0, r0 + h).map((row) => row.slice(c0, c0 + h));
}

function evalExpr(x: Expr, A: Mat, B: Mat): Mat {
  const blocks = x.map(([sg, q]) => ({ sg, m: quad(q[0] === 'A' ? A : B, q.slice(1) as '11') }));
  const h = blocks[0]!.m.length;
  return Array.from({ length: h }, (_, i) =>
    Array.from({ length: h }, (_, j) => blocks.reduce((s, b) => s + b.sg * b.m[i]![j]!, 0)),
  );
}

function join(c11: Mat, c12: Mat, c21: Mat, c22: Mat): Mat {
  return [...c11.map((r, i) => [...r, ...c12[i]!]), ...c21.map((r, i) => [...r, ...c22[i]!])];
}

export const matText = (m: Mat): string =>
  m.length === 1 && m[0]!.length === 1
    ? num(m[0]![0]!)
    : `[${m.map((r) => r.map(num).join(' ')).join('; ')}]`;

export const num = (x: number): string => (x < 0 ? `−${-x}` : String(x));

// ---------------------------------------------------------------------------------------------
// The plan and the state

export interface SCall {
  id: number;
  parent: number | null;
  /** Which product of its parent this call is (0-based), or -1 for the first call. */
  part: number;
  depth: number;
  n: number;
  A: Mat;
  B: Mat;
  C: Mat;
  children: number[];
  /** The sums (CLRS's S1..S10, or each product's two factors), for a call with n > 1. */
  sums: Mat[];
}

export type Phase = 'split' | 'sums' | 'products' | 'combine' | 'leaf' | 'done';

export interface StState {
  method: Method;
  names: Names;
  calls: SCall[];
  /** The size typed in, before padding. */
  size: number;
  /** Calls started so far (ids 1..made), and the ones that returned. */
  made: number;
  returned: number[];
  /** The running call, and where it is. */
  current: number | null;
  phase: Phase;
  /** The product of the current call that just came back, if any. */
  back: number | null;
  mults: number;
  adds: number;
  done: boolean;
}

type S = StState;
type StStep = Step<S, undefined>;
type Op = OpSpec<S, StSettings, undefined>;

export function init(st: StSettings): S {
  return {
    method: st.method,
    names: st.names,
    calls: [],
    size: 0,
    made: 0,
    returned: [],
    current: null,
    phase: 'done',
    back: null,
    mults: 0,
    adds: 0,
    done: false,
  };
}

/** Every call of the run, in call order. */
export function plan(A: Mat, B: Mat, scheme: Scheme): SCall[] {
  const calls: SCall[] = [];
  const go = (A: Mat, B: Mat, parent: number | null, part: number, depth: number): SCall => {
    const n = A.length;
    const c: SCall = {
      id: calls.length + 1,
      parent,
      part,
      depth,
      n,
      A,
      B,
      C: mul(A, B),
      children: [],
      sums: [],
    };
    calls.push(c);
    if (n === 1) return c;
    if (scheme.sums.length) c.sums = scheme.sums.map((x) => evalExpr(x.expr, A, B));
    scheme.products.forEach((p, k) => {
      const kid = go(evalExpr(p.left, A, B), evalExpr(p.right, A, B), c.id, k, depth + 1);
      c.children.push(kid.id);
    });
    return c;
  };
  go(A, B, null, -1, 0);
  return calls;
}

/** The product of a call from its children's products, the way the scheme combines them. */
export function combined(c: SCall, calls: SCall[], scheme: Scheme): Mat {
  const P = c.children.map((id) => calls[id - 1]!.C);
  const h = c.n / 2;
  const blocks = scheme.combine.map((terms) =>
    Array.from({ length: h }, (_, i) =>
      Array.from({ length: h }, (_, j) => terms.reduce((s, [sg, k]) => s + sg * P[k]![i]![j]!, 0)),
    ),
  );
  return join(blocks[0]!, blocks[1]!, blocks[2]!, blocks[3]!);
}

// ---------------------------------------------------------------------------------------------
// Parsing

/** "1 2; 3 4 * 5 6; 7 8": rows split by ; or /, the two matrices by *, × or x. */
export function parseMatrices(raw: string): { A: Mat; B: Mat } | Error {
  const t = String(raw ?? '').trim();
  if (!t) return new Error('Type two matrices, such as 1 2; 3 4 * 5 6; 7 8.');
  const parts = t.split(/\s*[*×xX·]\s*/).filter((p) => p !== '');
  if (parts.length !== 2)
    return new Error(
      'Type two matrices with * between them, rows split by ;, such as 1 2; 3 4 * 5 6; 7 8.',
    );
  const read = (p: string, name: string): Mat | Error => {
    const rows = p
      .split(/\s*[;/]\s*/)
      .filter((r) => r.trim() !== '')
      .map((r) => r.trim().split(/[\s,]+/));
    const n = rows.length;
    if (n > MAX_N) return new Error(`${name} has ${n} rows. Keep it to ${MAX_N} × ${MAX_N}.`);
    for (const r of rows)
      if (r.length !== n)
        return new Error(
          `${name} must be square: it has ${n} rows, but a row has ${plural(r.length, 'entry', 'entries')}.`,
        );
    const m: Mat = [];
    for (const r of rows) {
      const row: number[] = [];
      for (const x of r) {
        if (!/^[-−]?\d+$/.test(x)) return new Error(`"${x}" in ${name} is not a whole number.`);
        const v = Number(x.replace('−', '-'));
        if (Math.abs(v) > MAX_ENTRY)
          return new Error(`Entries go from −${MAX_ENTRY} to ${MAX_ENTRY}; ${name} has ${v}.`);
        row.push(v);
      }
      m.push(row);
    }
    return m;
  };
  const A = read(parts[0]!, 'A');
  if (A instanceof Error) return A;
  const B = read(parts[1]!, 'B');
  if (B instanceof Error) return B;
  if (A.length !== B.length)
    return new Error(
      `A is ${A.length} × ${A.length} but B is ${B.length} × ${B.length}. Make them the same size.`,
    );
  return { A, B };
}

export const matrixText = (m: Mat): string => m.map((r) => r.join(' ')).join('; ');

/** The next power of 2 at or above n. */
export const pow2 = (n: number): number => (n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n)));

export function pad(m: Mat, N: number): Mat {
  return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => m[i]?.[j] ?? 0));
}

// ---------------------------------------------------------------------------------------------
// The run

/** n³ multiplications and n²(n − 1) additions for the schoolbook method, at size n. */
export const schoolMults = (n: number) => n ** 3;
export const schoolAdds = (n: number) => n * n * (n - 1);

export const callName = (s: Pick<S, 'calls' | 'method' | 'names'>, id: number): string => {
  const c = s.calls[id - 1]!;
  if (c.parent === null) return 'A·B';
  return schemeOf(s).products[c.part]!.name;
};

/** The products from the root down to call id: "P3 › P5". */
export function pathName(s: Pick<S, 'calls' | 'method' | 'names'>, id: number): string {
  const out: string[] = [];
  for (
    let c: SCall | undefined = s.calls[id - 1];
    c && c.parent !== null;
    c = s.calls[c.parent - 1]
  )
    out.unshift(callName(s, c.id));
  return out.length ? out.join(' › ') : 'A·B';
}

function* run(A0: Mat, B0: Mat, settings: StSettings): Generator<StStep, S, void> {
  const size = A0.length;
  const N = pow2(size);
  const A = pad(A0, N);
  const B = pad(B0, N);
  const scheme = schemeOf(settings);
  const calls = plan(A, B, scheme);
  const k = scheme.products.length;
  const adds = blockAdds(scheme);
  const quietLeaves = N >= 8;
  const s: S = {
    method: settings.method,
    names: settings.names,
    calls,
    size,
    made: 0,
    returned: [],
    current: null,
    phase: 'split',
    back: null,
    mults: 0,
    adds: 0,
    done: false,
  };
  const snap = (): S => ({ ...s, returned: [...s.returned] });
  const vars = (): Record<string, Scalar> => ({
    n: N,
    calls: s.made,
    multiplications: s.mults,
    additions: s.adds,
    'n³': schoolMults(N),
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
  ): StStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: vars(),
    level,
  });
  const node = (id: number) => `node-${id}`;
  const lv = (depth: number): 2 | 3 => (depth <= 1 ? 2 : 3);

  if (N !== size)
    yield step(
      `${size} is not a power of 2, so pad A and B with zeros to ${N} × ${N}. The zeros change nothing in the product, and every split now comes out even.`,
      ['pad'],
      2,
    );

  const visit = function* (id: number): Generator<StStep, void, void> {
    const c = calls[id - 1]!;
    s.made = Math.max(s.made, id);
    s.current = id;
    s.back = null;
    const name = pathName(s, id);
    if (c.n === 1) {
      s.mults++;
      s.phase = 'leaf';
      s.returned.push(id);
      if (!quietLeaves)
        yield step(
          `${name} = ${num(c.A[0]![0]!)} · ${num(c.B[0]![0]!)} = ${num(c.C[0]![0]!)}: 1 × 1, so one scalar multiplication.`,
          ['base', 'direct'],
          3,
          [[node(id), 'active']],
        );
      return;
    }
    const h = c.n / 2;
    s.phase = 'split';
    yield step(
      c.parent === null
        ? `A and B are ${c.n} × ${c.n}. Split each into four ${h} × ${h} blocks: A11, A12, A21, A22 and B11, B12, B21, B22.`
        : `${name} multiplies two ${c.n} × ${c.n} matrices, so it splits them too, into ${h} × ${h} blocks.`,
      ['split'],
      lv(c.depth),
      [[node(id), 'active']],
    );
    if (adds.before) {
      s.phase = 'sums';
      s.adds += adds.before * h * h;
      yield step(
        scheme.sums.length
          ? `Ten sums of blocks, S1 to S10, each ${h} × ${h}: ${plural(adds.before * h * h, 'scalar addition')}. Every factor of the seven products is now a block or an S.`
          : `The factors of M1 to M7 need ${adds.before} block sums, each ${h} × ${h}: ${plural(adds.before * h * h, 'scalar addition')}.`,
        ['sums'],
        c.depth === 0 ? 2 : 3,
        [[node(id), 'active']],
      );
    }
    s.phase = 'products';
    for (const kid of c.children) {
      yield* visit(kid);
      s.current = id;
      s.phase = 'products';
      s.back = calls[kid - 1]!.part;
      const kc = calls[kid - 1]!;
      if (kc.n > 1)
        yield step(
          `Back in ${name}: ${callName(s, kid)} = ${kc.n <= 2 ? matText(kc.C) : `a ${kc.n} × ${kc.n} block`}. ${kc.part + 1 < k ? `${plural(kc.part + 1, 'product')} of ${k} done.` : `All ${k} products are done.`}`,
          ['prod', `p${callName(s, kid)}`],
          3,
          [
            [node(id), 'active'],
            [node(kid), 'found'],
          ],
        );
    }
    s.phase = 'combine';
    s.back = null;
    s.adds += adds.after * h * h;
    s.returned.push(id);
    const sums = scheme.combine.map((_, b) => `${BLOCK_NAMES[b]} = ${combineText(scheme, b)}`);
    yield step(
      quietLeaves && c.n === 2
        ? `${name}: seven scalar products, then ${BLOCK_NAMES.join(', ')} from them. ${name} = ${matText(c.C)}.`
        : `${name}: put the blocks together. ${sums.join(', ')}: ${plural(adds.after * h * h, 'scalar addition')}.${c.n <= 2 ? ` ${name} = ${matText(c.C)}.` : ''}`,
      ['comb', 'c0', 'c1', 'c2', 'c3', 'ret'],
      lv(c.depth),
      [[node(id), 'found']],
    );
  };

  yield* visit(1);
  s.current = null;
  s.phase = 'done';
  s.done = true;
  const root = calls[0]!;
  const same = matText(root.C) === matText(mul(A, B));
  yield step(
    `Done: ${N === 1 ? `${num(root.C[0]![0]!)}` : 'C = A·B'}, with ${plural(s.mults, 'scalar multiplication')} and ${plural(s.adds, 'scalar addition')}. The schoolbook method takes ${schoolMults(N)} and ${schoolAdds(N)}.${same ? '' : ' (Something went wrong.)'}${N !== size ? ` Drop the padding to get the ${size} × ${size} answer.` : ''}`,
    ['ret'],
    1,
    [[node(1), 'found']],
  );
  return snap();
}

const multiply: Op = {
  label: 'Multiply A·B',
  arity: 1,
  *run(s, [raw], { settings }) {
    const r = parseMatrices(String(raw ?? ''));
    if (r instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `${r.message} Nothing was multiplied.`,
        lines: [],
        vars: { calls: 0 },
        level: 1,
      };
      return s;
    }
    return yield* run(r.A, r.B, settings);
  },
};

export const ops = { multiply };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS 4.2. Lines stay short for a phone.

export function pseudocode(st: StSettings): PseudoBlock[] {
  const scheme = schemeOf(st);
  const strassen = st.method === 'strassen';
  const name = strassen ? 'STRASSEN' : 'MULTIPLY';
  const lines = [
    L('sig', 0, `${name}(A, B)`, 'To multiply two n × n matrices:'),
    L('pad', 1, 'pad n up to a power of 2', 'Make the size a power of 2 (zeros).'),
    L('base', 1, 'if n == 1', 'If they are single numbers,'),
    L('direct', 2, 'return a11 · b11', 'multiply them.'),
    L('split', 1, 'split A, B into n/2 blocks', 'Otherwise cut each into four blocks.'),
  ];
  if (strassen && scheme.sums.length)
    lines.push(L('sums', 1, 'S1..S10 = sums of blocks', 'Add and subtract blocks ten times.'));
  else if (strassen)
    lines.push(L('sums', 1, 'the sums inside M1..M7', 'Add the blocks the factors need.'));
  lines.push(
    L(
      'prod',
      1,
      strassen
        ? `${scheme.products[0]!.name}..${scheme.products.at(-1)!.name} = 7 products`
        : 'P1..P8 = 8 block products',
      strassen ? 'Multiply seven times, recursively.' : 'Multiply eight times, recursively.',
    ),
  );
  for (const p of scheme.products)
    lines.push(
      L(
        `p${p.name}`,
        2,
        `${p.name} = ${p.leftText}·${p.rightText}`,
        `${p.name}: ${exprText(p.left)} times ${exprText(p.right)}.`,
      ),
    );
  lines.push(L('comb', 1, 'combine into C11..C22', 'Add and subtract products into C.'));
  for (let b = 0; b < 4; b++)
    lines.push(
      L(
        `c${b}`,
        2,
        `${BLOCK_NAMES[b]} = ${combineText(scheme, b)}`,
        `${BLOCK_NAMES[b]} from ${scheme.combine[b]!.map(([, i]) => scheme.products[i]!.name).join(', ')}.`,
      ),
    );
  lines.push(L('ret', 1, 'return C', 'That block matrix is A·B.'));
  return [{ op: 'multiply', lines }];
}

export function initialSay(_s: S, st: StSettings): string {
  return st.method === 'strassen'
    ? 'Type two square matrices and press Multiply. Each split makes seven half-size products instead of eight.'
    : 'Type two square matrices and press Multiply. This version makes all eight half-size block products.';
}

export function initialVars(): Record<string, Scalar> {
  return { calls: 0 };
}

export function describe(s: S): string {
  if (!s.calls.length) return 'Nothing multiplied yet.';
  const root = s.calls[0]!;
  const head = `A·B for ${root.n} × ${root.n} matrices`;
  if (!s.done)
    return `${head}, in progress: ${s.made} of ${s.calls.length} calls made, ${s.mults} scalar multiplications so far.`;
  return `${head} = ${matText(root.C)}, in ${s.calls.length} calls, ${s.mults} scalar multiplications and ${s.adds} additions.`;
}

/** A matrix as an argument, for tests and presets. */
export const multiplyCall = (A: Mat, B: Mat): [string, Value] => [
  'multiply',
  `${matrixText(A)} * ${matrixText(B)}`,
];
