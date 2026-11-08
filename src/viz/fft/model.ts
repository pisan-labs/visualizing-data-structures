import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, mark } from '../_recursion/kit';

/** clrs: ω = e^(2πi/n), as in CLRS. numpy: ω = e^(−2πi/n), as in numpy and most engineering texts. */
export type Sign = 'clrs' | 'numpy';

export interface FftSettings {
  [key: string]: Scalar;
  sign: Sign;
}

export const defaults: FftSettings = { sign: 'clrs' };

export const MAX_N = 8;
export const MAX_VALUE = 99;

/** A complex number [re, im]. */
export type C = readonly [number, number];

export const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
/** e^(i·angle). */
export const cis = (angle: number): C => [Math.cos(angle), Math.sin(angle)];

/** Round to two decimals, with no −0. */
const r2 = (x: number) => {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
};

/** A complex number as people write it, rounded: 2, −1+2i, 0.71−0.71i, i, −i. */
export function fmtC(z: C): string {
  const re = r2(z[0]);
  const im = r2(z[1]);
  const num = (v: number) => String(v).replace('-', '−');
  if (im === 0) return num(re);
  const imText = Math.abs(im) === 1 ? 'i' : `${num(Math.abs(im))}i`;
  if (re === 0) return im < 0 ? `−${imText}` : imText;
  return `${num(re)}${im < 0 ? '−' : '+'}${imText}`;
}

export const bitReverse = (i: number, bits: number) => {
  let r = 0;
  for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
  return r;
};

export const log2 = (n: number) => Math.round(Math.log2(n));

export interface Butterfly {
  /** Level (block size 2^level), the two rows, and the twiddle exponent k (ω_m^k, m = 2^level). */
  level: number;
  r0: number;
  r1: number;
  k: number;
}

export interface FftState {
  mode: 'fft' | 'multiply' | null;
  n: number;
  /** The network drawn: columns 0..log n, each n values (row order is bit-reversed at column 0). */
  net: (C | null)[][];
  /** What the network computes now, e.g. "FFT of A" or "inverse FFT". */
  title: string;
  /** The network runs with conjugated roots: an inverse transform. */
  inverse: boolean;
  butterfly: Butterfly | null;
  /** Blocks finished so far, as "level-index". */
  blocks: string[];
  /** The input of a plain transform, or the polynomials and their product. */
  a: number[];
  b: number[];
  ahat: C[] | null;
  bhat: C[] | null;
  chat: C[] | null;
  /** Product coefficients, once known. */
  c: number[] | null;
  /** For a plain transform: its output. */
  y: C[] | null;
  phase: 'A' | 'B' | 'pointwise' | 'inverse' | 'done' | null;
}

type S = FftState;
type FStep = Step<S, undefined>;
type Op = OpSpec<S, FftSettings, undefined>;

export function init(): S {
  return {
    mode: null,
    n: 0,
    net: [],
    title: '',
    inverse: false,
    butterfly: null,
    blocks: [],
    a: [],
    b: [],
    ahat: null,
    bhat: null,
    chat: null,
    c: null,
    y: null,
    phase: null,
  };
}

/** ω_m^k for the settings, conjugated for an inverse transform. */
export function twiddle(m: number, k: number, sign: Sign, inverse: boolean): C {
  const dir = (sign === 'clrs' ? 1 : -1) * (inverse ? -1 : 1);
  return cis((dir * 2 * Math.PI * k) / m);
}

/** The DFT by its definition, for checking: y_k = Σ a_j ω^(jk). */
export function dft(a: readonly C[], sign: Sign, inverse = false): C[] {
  const n = a.length;
  return a.map((_, k) => {
    let s: C = [0, 0];
    a.forEach((x, j) => (s = cadd(s, cmul(x, twiddle(n, (j * k) % n, sign, inverse)))));
    return s;
  });
}

export const nextPow2 = (k: number) => {
  let n = 2;
  while (n < k) n *= 2;
  return n;
};

/** Parse "1 2 3" (or with commas) into numbers, or null. */
export function parseList(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => !/^[+-]?\d+$/.test(p))) return null;
  const xs = parts.map(Number);
  if (xs.some((x) => Math.abs(x) > MAX_VALUE)) return null;
  return xs;
}

const vec = (xs: readonly C[]) => `[${xs.map(fmtC).join(', ')}]`;

const snapOf = (s: S): S => ({
  ...s,
  net: s.net.map((col) => [...col]),
  blocks: [...s.blocks],
  a: [...s.a],
  b: [...s.b],
  butterfly: s.butterfly && { ...s.butterfly },
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
    vars: {
      n: s.n || null,
      butterflies: s.blocks.length ? butterfliesDone(s) : 0,
      ...(s.butterfly ? { k: s.butterfly.k, m: 2 ** s.butterfly.level } : {}),
    },
    level,
  };
}

/** Butterflies done in the current transform: half a block's size for every block finished. */
function butterfliesDone(s: S): number {
  return s.blocks.reduce((sum, b) => sum + 2 ** (Number(b.split('-')[0]) - 1), 0);
}

export const nodeId = (col: number, row: number) => `node-${col}-${row}`;

/**
 * Run the recursive radix-2 FFT on the network, block by block in the order the recursion
 * finishes them. `input` is in natural order; column 0 gets it bit-reversed.
 */
function* transform(
  s: S,
  input: readonly C[],
  sign: Sign,
  inverse: boolean,
  fine: 2 | 3,
): Generator<FStep, C[], void> {
  const n = input.length;
  const bits = log2(n);
  s.inverse = inverse;
  s.blocks = [];
  s.butterfly = null;
  s.net = Array.from({ length: bits + 1 }, () => Array.from({ length: n }, () => null as C | null));
  for (let r = 0; r < n; r++) s.net[0]![r] = input[bitReverse(r, bits)]!;
  const order = Array.from({ length: n }, (_, r) => `a${bitReverse(r, bits)}`).join(' ');
  yield makeStep(
    s,
    `${s.title}: the recursion splits the input into even and odd positions, again and again, down to single values. Read down the first column: ${order}. A single value is its own transform.`,
    ['rec0', 'rec1', 'base'],
    2,
    Array.from({ length: n }, (_, r) => [nodeId(0, r), 'visit'] as [string, MarkRole]),
  );
  const w = inverse ? 'ω⁻¹' : 'ω';
  const go = function* (level: number, j: number): Generator<FStep, void, void> {
    if (level === 0) return;
    yield* go(level - 1, 2 * j);
    yield* go(level - 1, 2 * j + 1);
    const m = 2 ** level;
    const half = m / 2;
    for (let k = 0; k < half; k++) {
      const r0 = j * m + k;
      const r1 = r0 + half;
      const y0 = s.net[level - 1]![r0]!;
      const y1 = s.net[level - 1]![r1]!;
      const t = cmul(twiddle(m, k, sign, inverse), y1);
      s.net[level]![r0] = cadd(y0, t);
      s.net[level]![r1] = csub(y0, t);
      s.butterfly = { level, r0, r1, k };
      yield makeStep(
        s,
        `Size ${m}, k = ${k}: ${w}${sub(m)}^${k} = ${fmtC(twiddle(m, k, sign, inverse))}. Top: ${fmtC(y0)} + ${fmtC(twiddle(m, k, sign, inverse))}·(${fmtC(y1)}) = ${fmtC(s.net[level]![r0]!)}. Bottom: ${fmtC(y0)} − that product = ${fmtC(s.net[level]![r1]!)}.`,
        ['loop', 'top', 'bottom', 'step'],
        fine,
        [
          [nodeId(level, r0), 'active'],
          [nodeId(level, r1), 'active'],
          [nodeId(level - 1, r0), 'compare'],
          [nodeId(level - 1, r1), 'compare'],
          [`root-${inverse ? (n - (k * n) / m) % n : (k * n) / m}`, 'active'],
        ],
      );
    }
    s.butterfly = null;
    s.blocks.push(`${level}-${j}`);
    if (level < bits)
      yield makeStep(
        s,
        `A size-${m} transform is done: ${half} ${half === 1 ? 'butterfly' : 'butterflies'}, each one multiplication and two additions.`,
        ['ret'],
        fine === 3 ? 2 : 3,
        Array.from(
          { length: m },
          (_, i) => [nodeId(level, j * m + i), 'found'] as [string, MarkRole],
        ),
      );
  };
  yield* go(bits, 0);
  // Column log n holds the output in natural order.
  return s.net[bits]!.map((z) => z!);
}

const sub = (m: number) => String(m).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]!);

const rejectStep = (s: S, say: string): FStep => makeStep(s, say, [], 1);

const fftOp: Op = {
  label: 'Transform',
  arity: 1,
  *run(s, [raw], { settings }) {
    const xs = parseList(String(raw ?? ''));
    if (!xs || xs.length > MAX_N) {
      yield rejectStep(
        s,
        `Type up to ${MAX_N} whole numbers from −${MAX_VALUE} to ${MAX_VALUE}, separated by spaces, such as 1 2 3 4. Nothing was transformed.`,
      );
      return s;
    }
    const n = nextPow2(xs.length);
    const st: S = { ...init(), mode: 'fft', n, a: [...xs, ...Array(n - xs.length).fill(0)] };
    st.title = 'FFT of a';
    const pad =
      n > xs.length
        ? ` Padded with ${n - xs.length} ${n - xs.length === 1 ? 'zero' : 'zeros'} to n = ${n}, a power of 2.`
        : '';
    yield makeStep(
      st,
      `a = [${st.a.join(', ')}].${pad} The FFT evaluates the polynomial a0 + a1·x + a2·x² + … at the ${n} complex ${n}th roots of unity.`,
      ['sig'],
      2,
    );
    const y = yield* transform(
      st,
      st.a.map((v) => [v, 0] as C),
      settings.sign,
      false,
      3,
    );
    st.y = y;
    st.phase = 'done';
    yield makeStep(
      st,
      `y = ${vec(y)}: y[k] is the polynomial's value at ω^k. ${(n * log2(n)) / 2} butterflies instead of the ${n * n} multiplications of evaluating term by term.`,
      ['ret'],
      1,
      y.map((_, r) => [nodeId(log2(n), r), 'found'] as [string, MarkRole]),
    );
    return snapOf(st);
  },
};

/** "1 2 | 3 4": two coefficient lists, lowest power first. */
export function parsePair(text: string): [number[], number[]] | null {
  const halves = text.split(/[|;]/);
  if (halves.length !== 2) return null;
  const a = parseList(halves[0]!);
  const b = parseList(halves[1]!);
  if (!a || !b || a.length + b.length - 1 > MAX_N) return null;
  return [a, b];
}

/** a0 + a1·x + a2·x², with the zero terms left out. */
export function polyText(cs: readonly number[]): string {
  const terms: string[] = [];
  cs.forEach((c, k) => {
    if (c === 0) return;
    const x = k === 0 ? '' : k === 1 ? 'x' : `x${'⁰¹²³⁴⁵⁶⁷⁸⁹'[k]}`;
    const coef = k > 0 && Math.abs(c) === 1 ? (c < 0 ? '−' : '') : String(c).replace('-', '−');
    terms.push(`${coef}${x}`);
  });
  if (!terms.length) return '0';
  return terms.join(' + ').replace(/\+ −/g, '− ');
}

const multiplyOp: Op = {
  label: 'Multiply polynomials',
  arity: 1,
  *run(s, [raw], { settings }) {
    const pair = parsePair(String(raw ?? ''));
    if (!pair) {
      yield rejectStep(
        s,
        `Type the two polynomials' coefficients, lowest power first, with a | between them, such as 1 2 | 3 4 for (1 + 2x)(3 + 4x). Together they may have at most ${MAX_N + 1} coefficients. Nothing was multiplied.`,
      );
      return s;
    }
    const [a0, b0] = pair;
    const n = nextPow2(a0.length + b0.length - 1);
    const pad = (xs: number[]) => [...xs, ...Array(n - xs.length).fill(0)];
    const st: S = { ...init(), mode: 'multiply', n, a: pad(a0), b: pad(b0), phase: 'A' };
    const sign = settings.sign;
    yield makeStep(
      st,
      `A = ${polyText(a0)} and B = ${polyText(b0)}. The product has degree ${a0.length + b0.length - 2}, so it needs ${a0.length + b0.length - 1} values to pin it down: use n = ${n}, a power of 2, padding with zeros.`,
      ['pad'],
      2,
    );
    st.title = 'FFT of A';
    st.ahat = yield* transform(
      st,
      st.a.map((v) => [v, 0] as C),
      sign,
      false,
      3,
    );
    yield makeStep(st, `Â = ${vec(st.ahat)}: A at the ${n}th roots of unity.`, ['fa'], 2);
    st.phase = 'B';
    st.title = 'FFT of B';
    st.bhat = yield* transform(
      st,
      st.b.map((v) => [v, 0] as C),
      sign,
      false,
      3,
    );
    yield makeStep(st, `B̂ = ${vec(st.bhat)}: B at the same points.`, ['fb'], 2);
    st.phase = 'pointwise';
    st.chat = st.ahat.map((z, k) => cmul(z, st.bhat![k]!));
    const bits = log2(n);
    st.net = st.net.map((col) => col.map(() => null));
    st.net[bits] = [...st.chat];
    st.blocks = [];
    st.title = 'Â·B̂, point by point';
    yield makeStep(
      st,
      `Multiply point by point: (A·B)(ω^k) = A(ω^k)·B(ω^k), so Ĉ = ${vec(st.chat)}. ${n} multiplications, where multiplying the coefficients directly takes ${a0.length * b0.length}.`,
      ['pt'],
      2,
      st.chat.map((_, r) => [nodeId(bits, r), 'new'] as [string, MarkRole]),
    );
    st.phase = 'inverse';
    st.title = 'inverse FFT of Ĉ';
    const back = yield* transform(st, st.chat, sign, true, 3);
    const scaled = back.map((z) => [z[0] / n, z[1] / n] as C);
    st.c = scaled.slice(0, a0.length + b0.length - 1).map((z) => {
      const v = Math.round(z[0]);
      return v === 0 ? 0 : v;
    });
    st.net[bits] = scaled;
    yield makeStep(
      st,
      `The inverse FFT is the same network with ω⁻¹ in place of ω. Divide each value by n = ${n}: ${vec(scaled)}. These are the product's coefficients (the tiny rounding errors of floating point vanish when rounded).`,
      ['inv', 'round'],
      2,
      scaled.map((_, r) => [nodeId(bits, r), 'found'] as [string, MarkRole]),
    );
    st.phase = 'done';
    yield makeStep(
      st,
      `A·B = ${polyText(st.c)}. Two FFTs, ${n} pointwise products and one inverse FFT: O(n log n) instead of O(n²).`,
      ['round'],
      1,
    );
    return snapOf(st);
  },
};

export const ops = { fft: fftOp, multiply: multiplyOp };

export function pseudocode(st: FftSettings): PseudoBlock[] {
  const root = st.sign === 'clrs' ? 'e^(2πi/n)' : 'e^(−2πi/n)';
  const fft = [
    L('sig', 0, 'RECURSIVE-FFT(a)', 'To transform a, of length n (a power of 2):'),
    L('base', 1, 'if n == 1 return a', 'a single value is its own transform.'),
    L('root', 1, `ωₙ = ${root};  ω = 1`, `Let ωₙ be the principal nth root of unity, ${root}.`),
    L('rec0', 1, 'y⁰ = RECURSIVE-FFT(a₀, a₂, …, aₙ₋₂)', 'Transform the even positions,'),
    L('rec1', 1, 'y¹ = RECURSIVE-FFT(a₁, a₃, …, aₙ₋₁)', 'and the odd positions.'),
    L('loop', 1, 'for k = 0 to n/2 − 1', 'For each k in the first half:'),
    L('top', 2, 'y[k] = y⁰[k] + ω·y¹[k]', 'the top output adds ω times the odd value,'),
    L('bottom', 2, 'y[k + n/2] = y⁰[k] − ω·y¹[k]', 'the bottom output subtracts it,'),
    L('step', 2, 'ω = ω·ωₙ', 'and ω turns one step around the circle.'),
    L('ret', 1, 'return y', 'The result is a at every nth root of unity.'),
  ];
  const mul = [
    L(
      'pad',
      0,
      'n = smallest power of 2 ≥ deg A + deg B + 1',
      'Pick n, a power of 2 with room for the product.',
    ),
    L('fa', 0, 'Â = FFT(A)', 'Evaluate A at the n roots of unity,'),
    L('fb', 0, 'B̂ = FFT(B)', 'and B at the same points.'),
    L('pt', 0, 'Ĉ[k] = Â[k]·B̂[k]  for every k', 'Multiply the values point by point.'),
    L(
      'inv',
      0,
      'C = FFT(Ĉ) with ω⁻¹, divided by n',
      'Interpolate: the same transform with the inverse root, then divide by n.',
    ),
    L('round', 0, 'round C to integers', 'Round away the floating-point error.'),
  ];
  return [
    { op: 'fft', lines: fft },
    {
      op: 'multiply',
      lines: [
        ...mul,
        ...fft
          .filter((l) =>
            ['top', 'bottom', 'loop', 'step', 'rec0', 'rec1', 'base', 'ret'].includes(l.id),
          )
          .map((l) => ({ ...l, indent: l.indent + 1 })),
      ],
    },
  ];
}

export function initialSay(_s: S, st: FftSettings): string {
  return `Type up to 8 numbers and press Transform, or two polynomials like 1 2 | 3 4 and press Multiply. ω = ${st.sign === 'clrs' ? 'e^(2πi/n)' : 'e^(−2πi/n)'}.`;
}

export function initialVars(): Record<string, Scalar> {
  return { n: null };
}

export function describe(s: S): string {
  if (!s.mode) return 'Nothing transformed yet.';
  const out = s.net[s.net.length - 1] ?? [];
  if (s.mode === 'fft') {
    if (s.phase === 'done' && s.y) return `FFT of [${s.a.join(', ')}] = ${vec(s.y)}.`;
    return `FFT of [${s.a.join(', ')}], n = ${s.n}, in progress.`;
  }
  const head = `Multiplying ${polyText(s.a)} by ${polyText(s.b)} with n = ${s.n}`;
  if (s.phase === 'done' && s.c) return `${head}: the product is ${polyText(s.c)}.`;
  return `${head}: ${s.title}. Output column: ${out.map((z) => (z ? fmtC(z) : '?')).join(', ')}.`;
}
