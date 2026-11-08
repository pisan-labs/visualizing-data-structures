import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, mark, wholeArg } from '../_recursion/kit';

/** basic: EUCLID(a, b) returns d. extended: EXTENDED-EUCLID(a, b) returns (d, x, y), as in CLRS. */
export type Version = 'basic' | 'extended';

export interface EuclidSettings {
  [key: string]: Scalar;
  version: Version;
}

export const defaults: EuclidSettings = { version: 'basic' };

export const MAX = 999;

/** One call of the recursion: its arguments, the quotient and remainder, and (extended) x, y. */
export interface EuRow {
  a: number;
  b: number;
  q: number | null;
  r: number | null;
  x: number | null;
  y: number | null;
}

export interface EuState {
  kind: 'gcd' | 'inverse' | null;
  /** The first call's arguments; for an inverse, a and the modulus m. */
  a0: number;
  b0: number;
  rows: EuRow[];
  /** Rows the whole run will have, so the drawing keeps its size. */
  total: number;
  /** The run computes x and y. */
  extended: boolean;
  d: number | null;
  /** For an inverse: the inverse, or null when there is none (or not found yet). */
  inverse: number | null;
  done: boolean;
}

type S = EuState;
type EuStep = Step<S, undefined>;
type Op = OpSpec<S, EuclidSettings, undefined>;

export function init(): S {
  return {
    kind: null,
    a0: 0,
    b0: 0,
    rows: [],
    total: 0,
    extended: false,
    d: null,
    inverse: null,
    done: false,
  };
}

/** The calls Euclid makes: [a, b] for each, the last one with b = 0. */
export function euclidCalls(a: number, b: number): [number, number][] {
  const out: [number, number][] = [[a, b]];
  while (b !== 0) {
    [a, b] = [b, a % b];
    out.push([a, b]);
  }
  return out;
}

/** The finished rows of EXTENDED-EUCLID(a, b), back-substitution included. */
export function extendedRows(a: number, b: number): EuRow[] {
  const rows: EuRow[] = euclidCalls(a, b).map(([x, y]) => ({
    a: x,
    b: y,
    q: y === 0 ? null : Math.floor(x / y),
    r: y === 0 ? null : x % y,
    x: null,
    y: null,
  }));
  const last = rows[rows.length - 1]!;
  last.x = 1;
  last.y = 0;
  for (let i = rows.length - 2; i >= 0; i--) {
    const below = rows[i + 1]!;
    rows[i]!.x = below.y;
    rows[i]!.y = below.x! - rows[i]!.q! * below.y!;
  }
  return rows;
}

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The modular inverse of a mod m, or null when gcd(a, m) is not 1. */
export function modInverse(a: number, m: number): number | null {
  const rows = extendedRows(a, m);
  if (rows[rows.length - 1]!.a !== 1) return null;
  return (((rows[0]!.x! % m) + m) % m) % m;
}

/** F(1) = F(2) = 1, F(3) = 2, ... */
export function fib(k: number): number {
  let [x, y] = [0, 1];
  for (let i = 0; i < k; i++) [x, y] = [y, x + y];
  return x;
}

/** The most recursive calls Lamé's theorem allows for a > b >= 1: the largest k with F(k+1) <= b. */
export function lameK(b: number): number {
  let k = 0;
  while (fib(k + 2) <= b) k++;
  return k;
}

/** The most calls EUCLID(a, b) can make by Lamé's theorem (one more when a < b: the swap). */
export function lameBound(a: number, b: number): number {
  if (b === 0) return 0;
  return a >= b ? lameK(b) : 1 + lameK(a);
}

const fmt = (n: number) => (n < 0 ? `(${n})` : String(n));
const callText = (r: Pick<EuRow, 'a' | 'b'>, ext: boolean) =>
  `${ext ? 'extEuclid' : 'euclid'}(${r.a}, ${r.b})`;

function* run(
  a0: number,
  b0: number,
  kind: 'gcd' | 'inverse',
  extended: boolean,
): Generator<EuStep, S, void> {
  const finished = extendedRows(a0, b0);
  const rows: EuRow[] = [];
  const st: S = {
    kind,
    a0,
    b0,
    rows,
    total: finished.length,
    extended,
    d: null,
    inverse: null,
    done: false,
  };
  const snap = (): S => ({ ...st, rows: rows.map((r) => ({ ...r })) });
  const calls = () => Math.max(0, rows.length - 1);
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    calls: calls(),
    'Lamé bound': lameBound(a0, b0),
    ...more,
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
    more: Record<string, Scalar> = {},
  ): EuStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: vars(more),
    level,
  });
  const c = (r: number, key: string) => `eu-${r}-${key}`;

  rows.push({ a: a0, b: b0, q: null, r: null, x: null, y: null });
  const opening =
    kind === 'inverse'
      ? `To invert ${a0} mod ${b0}, run extended Euclid on (${a0}, ${b0}): if the gcd is 1, then ${a0}·x + ${b0}·y = 1, and x is the inverse.`
      : `Call ${callText(rows[0]!, extended)}.`;
  yield step(opening, ['sig'], 2, [
    [c(0, 'a'), 'active'],
    [c(0, 'b'), 'active'],
  ]);

  for (let i = 0; ; i++) {
    const row = rows[i]!;
    if (row.b === 0) {
      st.d = row.a;
      if (extended) {
        row.x = 1;
        row.y = 0;
      }
      yield step(
        extended
          ? `b is 0, the base case: gcd = ${row.a}, with x = 1 and y = 0, because ${row.a}·1 + 0·0 = ${row.a}.`
          : `b is 0, the base case: the gcd is a = ${row.a}.`,
        ['base', 'ret'],
        2,
        [
          [c(i, 'a'), 'found'],
          ...(extended
            ? ([
                [c(i, 'x'), 'new'],
                [c(i, 'y'), 'new'],
              ] as [string, MarkRole][])
            : []),
        ],
      );
      break;
    }
    yield step(`Is b = 0? No, b is ${row.b}.`, ['base'], 3, [[c(i, 'b'), 'compare']]);
    row.q = Math.floor(row.a / row.b);
    row.r = row.a % row.b;
    yield step(
      `${row.a} = ${row.q}·${row.b} + ${row.r}, so ${row.a} mod ${row.b} = ${row.r}.${row.a < row.b ? ` (a < b: the remainder is a itself, so this call just swaps them.)` : ''}`,
      ['rec'],
      2,
      [
        [c(i, 'q'), 'active'],
        [c(i, 'r'), 'active'],
      ],
    );
    rows.push({ a: row.b, b: row.r, q: null, r: null, x: null, y: null });
    yield step(
      `Recurse on (b, a mod b): ${callText(rows[i + 1]!, extended)}. Any number that divides ${row.a} and ${row.b} also divides ${row.r}, so the gcd is the same.`,
      ['rec'],
      2,
      [
        [c(i + 1, 'a'), 'active'],
        [c(i + 1, 'b'), 'active'],
      ],
    );
  }

  if (extended) {
    for (let i = rows.length - 2; i >= 0; i--) {
      const row = rows[i]!;
      const below = rows[i + 1]!;
      row.x = below.y;
      row.y = below.x! - row.q! * below.y!;
      yield step(
        `Back up a row: x = y' = ${below.y}, and y = x' − ⌊a/b⌋·y' = ${below.x} − ${row.q}·${fmt(below.y!)} = ${row.y}. Check: ${row.a}·${fmt(row.x!)} + ${row.b}·${fmt(row.y)} = ${st.d}.`,
        ['back'],
        2,
        [
          [c(i, 'x'), 'new'],
          [c(i, 'y'), 'new'],
          [c(i + 1, 'x'), 'compare'],
          [c(i + 1, 'y'), 'compare'],
        ],
      );
    }
  }

  st.done = true;
  const top = rows[0]!;
  const k = calls();
  const lame = `${k} recursive ${k === 1 ? 'call' : 'calls'}; Lamé's theorem allows at most ${lameBound(a0, b0)} for these numbers.`;
  if (kind === 'inverse') {
    if (st.d !== 1) {
      yield step(
        `gcd(${a0}, ${b0}) = ${st.d}, not 1, so ${a0} has no inverse mod ${b0}: every multiple of ${a0} mod ${b0} is a multiple of ${st.d}.`,
        [],
        1,
        [[c(rows.length - 1, 'a'), 'error']],
        { d: st.d, inverse: 'none' },
      );
      return snap();
    }
    st.inverse = (((top.x! % b0) + b0) % b0) % b0;
    yield step(
      `${a0}·${fmt(top.x!)} + ${b0}·${fmt(top.y!)} = 1, so ${a0}·${fmt(top.x!)} ≡ 1 (mod ${b0}). The inverse is ${top.x} mod ${b0} = ${st.inverse}: ${a0}·${st.inverse} = ${a0 * st.inverse} ≡ 1.`,
      [],
      1,
      [[c(0, 'x'), 'found']],
      { d: 1, x: top.x, y: top.y, inverse: st.inverse },
    );
    return snap();
  }
  yield step(
    extended
      ? `gcd(${a0}, ${b0}) = ${st.d} = ${a0}·${fmt(top.x!)} + ${b0}·${fmt(top.y!)}. ${lame}`
      : `gcd(${a0}, ${b0}) = ${st.d}. ${lame}`,
    [],
    1,
    extended
      ? [
          [c(0, 'x'), 'found'],
          [c(0, 'y'), 'found'],
        ]
      : [[c(rows.length - 1, 'a'), 'found']],
    extended ? { d: st.d, x: top.x, y: top.y } : { d: st.d },
  );
  return snap();
}

function bad(s: S, say: string): EuStep {
  return { state: s, marks: [], say, lines: [], vars: { calls: 0 }, level: 1 };
}

const gcdOp: Op = {
  label: 'gcd(a, b)',
  arity: 2,
  *run(s, [ra, rb], { settings }) {
    const a = wholeArg(ra, 0, MAX);
    const b = wholeArg(rb, 0, MAX);
    if (a === null || b === null) {
      yield bad(s, `gcd needs two whole numbers a and b from 0 to ${MAX}. Nothing was run.`);
      return s;
    }
    return yield* run(a, b, 'gcd', settings.version === 'extended');
  },
};

const inverseOp: Op = {
  label: 'Inverse of a mod m',
  arity: 2,
  *run(s, [ra, rm]) {
    const a = wholeArg(ra, 0, MAX);
    const m = wholeArg(rm, 2, MAX);
    if (a === null || m === null) {
      yield bad(
        s,
        `An inverse needs a whole number a from 0 to ${MAX} and a modulus m from 2 to ${MAX}. Nothing was run.`,
      );
      return s;
    }
    return yield* run(a, m, 'inverse', true);
  },
};

export const ops = { gcd: gcdOp, inverse: inverseOp };

export function pseudocode(s: EuclidSettings): PseudoBlock[] {
  const ext = s.version === 'extended';
  const extLines = [
    L('sig', 0, 'EXTENDED-EUCLID(a, b)', 'To find d = gcd(a, b) and x, y with ax + by = d:'),
    L('base', 1, 'if b == 0', 'If b is 0,'),
    L('ret', 2, 'return (a, 1, 0)', 'd is a, and a·1 + b·0 = a.'),
    L(
      'rec',
      1,
      "(d', x', y') = EXTENDED-EUCLID(b, a mod b)",
      'Otherwise solve the smaller pair (b, a mod b),',
    ),
    L(
      'back',
      1,
      "return (d', y', x' − ⌊a/b⌋·y')",
      'then swap its x and y and subtract ⌊a/b⌋ times y.',
    ),
  ];
  const gcdLines = ext
    ? extLines
    : [
        L('sig', 0, 'EUCLID(a, b)', 'To find the greatest common divisor of a and b:'),
        L('base', 1, 'if b == 0', 'If b is 0,'),
        L('ret', 2, 'return a', 'the answer is a.'),
        L(
          'rec',
          1,
          'else return EUCLID(b, a mod b)',
          'Otherwise the answer is the gcd of b and the remainder of a ÷ b.',
        ),
      ];
  return [
    { op: 'gcd', lines: gcdLines },
    { op: 'inverse', lines: extLines },
  ];
}

export function initialSay(_s: S, st: EuclidSettings): string {
  return st.version === 'extended'
    ? 'Type a and b and press gcd(a, b). Extended Euclid also finds x and y with a·x + b·y = gcd(a, b).'
    : 'Type a and b and press gcd(a, b). Each call replaces (a, b) with (b, a mod b) until b is 0.';
}

export function initialVars(): Record<string, Scalar> {
  return { calls: 0 };
}

export function describe(s: S): string {
  if (!s.kind) return 'No gcd computed yet.';
  const rows = s.rows.map((r) => `(${r.a}, ${r.b})`).join(', ');
  const head = s.kind === 'inverse' ? `Inverse of ${s.a0} mod ${s.b0}` : `gcd(${s.a0}, ${s.b0})`;
  if (!s.done) return `${head}, in progress. Calls so far: ${rows}.`;
  if (s.kind === 'inverse')
    return `${head}: ${s.inverse === null ? 'none, the gcd is ' + s.d : s.inverse}. Calls: ${rows}.`;
  return `${head} = ${s.d}. Calls: ${rows}.`;
}
