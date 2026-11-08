import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, mark, wholeArg } from '../_recursion/kit';

/** ltr: CLRS MODULAR-EXPONENTIATION, the bits from the top down. rtl: from the lowest bit up. */
export type Order = 'ltr' | 'rtl';

export interface PowSettings {
  [key: string]: Scalar;
  order: Order;
}

export const defaults: PowSettings = { order: 'ltr' };

export const MAX_A = 999;
export const MAX_B = 1023;
export const MAX_M = 999;

/**
 * One bit's row. Left to right: the exponent so far (c), d after squaring, and d after the
 * multiply when the bit is 1. Right to left: the power a^(2^i) mod m and the result after the
 * multiply when the bit is 1.
 */
export interface PowRow {
  /** Bit position i (2^i). */
  i: number;
  bit: 0 | 1;
  c: number | null;
  squared: number | null;
  multiplied: number | null;
  power: number | null;
}

export interface PowState {
  a: number;
  b: number;
  m: number;
  order: Order;
  /** The exponent's bits, highest first. Empty before the first run. */
  bits: (0 | 1)[];
  /** The bit position being worked on, or null. */
  at: number | null;
  rows: PowRow[];
  result: number | null;
  squarings: number;
  multiplies: number;
  done: boolean;
}

type S = PowState;
type PowStep = Step<S, undefined>;
type Op = OpSpec<S, PowSettings, undefined>;

export function init(s: PowSettings): S {
  return {
    a: 0,
    b: 0,
    m: 0,
    order: s.order,
    bits: [],
    at: null,
    rows: [],
    result: null,
    squarings: 0,
    multiplies: 0,
    done: false,
  };
}

export const bitsOf = (b: number): (0 | 1)[] =>
  b
    .toString(2)
    .split('')
    .map((ch) => (ch === '1' ? 1 : 0));

/** Multiplications a naive loop makes: a·a·...·a, b − 1 of them (none for b ≤ 1). */
export const naive = (b: number) => Math.max(0, b - 1);

/** a^b mod m by repeated squaring, the plain way, for checking. */
export function powMod(a: number, b: number, m: number): number {
  let r = 1 % m;
  let x = a % m;
  while (b > 0) {
    if (b & 1) r = (r * x) % m;
    x = (x * x) % m;
    b >>= 1;
  }
  return r;
}

/** The shape id of bit position i in the exponent row. */
export const bitId = (i: number) => `bit-${i}`;
export const cellOf = (r: number, key: string) => `mp-${r}-${key}`;

/** Run square-and-multiply as steps. Shared with the RSA page, which draws its own picture. */
export function* powSteps(
  a: number,
  b: number,
  m: number,
  order: Order,
): Generator<PowStep, S, void> {
  const bits = bitsOf(b);
  const k = bits.length - 1;
  const st: S = {
    a,
    b,
    m,
    order,
    bits,
    at: null,
    rows: [],
    result: null,
    squarings: 0,
    multiplies: 0,
    done: false,
  };
  const snap = (): S => ({ ...st, rows: st.rows.map((r) => ({ ...r })) });
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    squarings: st.squarings,
    multiplies: st.multiplies,
    mults: st.squarings + st.multiplies,
    naive: naive(b),
    ...more,
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
    more: Record<string, Scalar> = {},
  ): PowStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: vars(more),
    level,
  });

  yield step(
    `${a}^${b} mod ${m}. In binary ${b} is ${bits.join('')}: ${bits.length} ${bits.length === 1 ? 'bit' : 'bits'}, ${
      bits.length < naive(b)
        ? `so about ${bits.length} squarings instead of ${naive(b)} multiplications.`
        : `so about ${bits.length} ${bits.length === 1 ? 'squaring' : 'squarings'}. Multiplying by ${a} directly takes ${naive(b)} ${naive(b) === 1 ? 'multiplication' : 'multiplications'}, so for an exponent this small squaring saves nothing; it pays off as b grows.`
    }`,
    ['init'],
    2,
    bits.map((_, j) => [bitId(k - j), 'visit'] as [string, MarkRole]),
    order === 'ltr' ? { c: 0, d: 1 } : { result: 1 % m },
  );

  if (order === 'ltr') {
    let c = 0;
    let d = 1 % m;
    for (let j = 0; j <= k; j++) {
      const i = k - j;
      const bit = bits[j]!;
      st.at = i;
      const row: PowRow = { i, bit, c: null, squared: null, multiplied: null, power: null };
      st.rows.push(row);
      const r = st.rows.length - 1;
      const before = d;
      c *= 2;
      d = (d * d) % m;
      st.squarings++;
      row.c = c;
      row.squared = d;
      yield step(
        `Bit ${i} is ${bit}. Square: c doubles to ${c}, and d = ${before}·${before} mod ${m} = ${d}, which is ${a}^${c} mod ${m}.`,
        ['loop', 'dbl', 'sq'],
        2,
        [
          [bitId(i), 'active'],
          [cellOf(r, 'sq'), 'active'],
        ],
        { c, d },
      );
      if (bit === 1) {
        const prev = d;
        c += 1;
        d = (d * (a % m)) % m;
        st.multiplies++;
        row.c = c;
        row.multiplied = d;
        yield step(
          `The bit is 1, so multiply by a: c = ${c}, and d = ${prev}·${a % m} mod ${m} = ${d}.`,
          ['if', 'inc', 'mul'],
          2,
          [
            [bitId(i), 'active'],
            [cellOf(r, 'mul'), 'active'],
          ],
          { c, d },
        );
      } else {
        yield step(`The bit is 0: no multiply.`, ['if'], 3, [[bitId(i), 'compare']], { c, d });
      }
    }
    st.result = d;
  } else {
    let result = 1 % m;
    let power = a % m;
    for (let j = k; j >= 0; j--) {
      const i = k - j;
      const bit = bits[j]!;
      st.at = i;
      const row: PowRow = { i, bit, c: null, squared: null, multiplied: null, power };
      st.rows.push(row);
      const r = st.rows.length - 1;
      if (bit === 1) {
        const prev = result;
        result = (result * power) % m;
        st.multiplies++;
        row.multiplied = result;
        yield step(
          `Bit ${i} is 1, so multiply the result by ${a}^${2 ** i} mod ${m} = ${power}: ${prev}·${power} mod ${m} = ${result}.`,
          ['loop', 'if', 'mul'],
          2,
          [
            [bitId(i), 'active'],
            [cellOf(r, 'mul'), 'active'],
          ],
          { result, power },
        );
      } else {
        yield step(`Bit ${i} is 0: skip it.`, ['loop', 'if'], 3, [[bitId(i), 'compare']], {
          result,
          power,
        });
      }
      const old = power;
      power = (power * power) % m;
      st.squarings++;
      if (j > 0) {
        yield step(
          `Square the power for the next bit: ${old}·${old} mod ${m} = ${power}, which is ${a}^${2 ** (i + 1)} mod ${m}.`,
          ['sq', 'shift'],
          3,
          [[cellOf(r, 'pow'), 'compare']],
          { result, power },
        );
      } else {
        yield step(
          `The loop squares once more (${old}·${old} mod ${m} = ${power}), a multiplication nobody uses.`,
          ['sq', 'shift'],
          3,
          [[cellOf(r, 'pow'), 'compare']],
          { result, power },
        );
      }
    }
    st.result = result;
  }

  st.at = null;
  st.done = true;
  const used = st.squarings + st.multiplies;
  yield step(
    `${a}^${b} mod ${m} = ${st.result}. That took ${used} multiplications (${st.squarings} squarings and ${st.multiplies} multiplies); multiplying by ${a} again and again takes ${naive(b)}.`,
    [],
    1,
    [],
    { result: st.result },
  );
  return snap();
}

const pow: Op = {
  label: 'Compute a^b mod m',
  arity: 3,
  *run(s, [ra, rb, rm], { settings }) {
    const a = wholeArg(ra, 0, MAX_A);
    const b = wholeArg(rb, 0, MAX_B);
    const m = wholeArg(rm, 2, MAX_M);
    if (a === null || b === null || m === null) {
      yield {
        state: s,
        marks: [],
        say: `Type a (0 to ${MAX_A}), b (0 to ${MAX_B}) and m (2 to ${MAX_M}). Nothing was run.`,
        lines: [],
        vars: { mults: 0 },
        level: 1,
      };
      return s;
    }
    return yield* powSteps(a, b, m, settings.order);
  },
};

export const ops = { pow };

export function pseudocode(s: PowSettings): PseudoBlock[] {
  if (s.order === 'rtl')
    return [
      {
        op: 'pow',
        lines: [
          L('init', 0, 'result = 1;  p = a mod m', 'Start with result 1 and p = a.'),
          L(
            'loop',
            0,
            'for each bit bᵢ of b, lowest first',
            'Go through the bits of b from the right:',
          ),
          L('if', 1, 'if bᵢ == 1', 'if the bit is 1,'),
          L(
            'mul',
            2,
            'result = result · p mod m',
            'multiply the result by p (which is a to the 2^i).',
          ),
          L('sq', 1, 'p = p · p mod m', 'Square p, so it is a to the next power of 2,'),
          L('shift', 1, 'i = i + 1', 'and move to the next bit.'),
          L('ret', 0, 'return result', 'The result is a^b mod m.'),
        ],
      },
    ];
  return [
    {
      op: 'pow',
      lines: [
        L('init', 0, 'c = 0;  d = 1', 'Start with d = a to the 0, which is 1.'),
        L('loop', 0, 'for i = k downto 0', 'Go through the bits of b from the left:'),
        L('dbl', 1, 'c = 2c', 'doubling the exponent so far,'),
        L('sq', 1, 'd = d · d mod m', 'by squaring d.'),
        L('if', 1, 'if bᵢ == 1', 'If the bit is 1,'),
        L('inc', 2, 'c = c + 1', 'add one to the exponent'),
        L('mul', 2, 'd = d · a mod m', 'by multiplying d by a.'),
        L('ret', 0, 'return d', 'Now c = b, and d is a^b mod m.'),
      ],
    },
  ];
}

export function initialSay(_s: S, st: PowSettings): string {
  return `Type a, b and m and press Compute. The ${st.order === 'ltr' ? 'bits of b are read from the left, as in CLRS' : 'bits of b are read from the right'}.`;
}

export function initialVars(): Record<string, Scalar> {
  return { mults: 0 };
}

export function describe(s: S): string {
  if (!s.bits.length) return 'Nothing computed yet.';
  const head = `${s.a}^${s.b} mod ${s.m}, exponent bits ${s.bits.join('')}`;
  if (!s.done) return `${head}, in progress: ${s.squarings + s.multiplies} multiplications so far.`;
  return `${head} = ${s.result}, in ${s.squarings + s.multiplies} multiplications.`;
}
