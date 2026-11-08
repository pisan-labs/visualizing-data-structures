import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { binary, mix16 } from '../_hashing/family';
import { readNumber } from '../_hashing/hashing';

/** Hash width in bits. */
export const HASH_BITS = 16;

export interface HllState {
  /** Index bits: m = 2^b registers. */
  b: number;
  M: number[];
  /** The distinct items added so far. A real HyperLogLog keeps none; we do, to compare. */
  seen: number[];
  /** Number of add calls. */
  adds: number;
}

export interface HllSettings {
  [key: string]: Scalar;
  b: number;
  small: boolean;
}

export interface HllExtra {
  arg?: { text: string; error?: boolean };
  formula?: string;
  /** The hash being read: its bits, and how many lead (the index) and how far ρ reaches. */
  hash?: { value: number; rho?: number; show: 'bits' | 'index' | 'rho' };
  /** Lines of the estimate computation, under the registers. */
  calc?: string[];
}

type S = HllState;
type X = HllExtra;
type Op = OpSpec<S, HllSettings, X>;
type HllStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: HllSettings = { b: 4, small: true };

export const regs = (s: { b: number }) => 2 ** s.b;

export function init(settings: HllSettings): S {
  return { b: settings.b, M: Array(regs(settings)).fill(0), seen: [], adds: 0 };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const regId = (j: number) => `reg-${j}`;

/** The register an item goes to and its ρ: the position of the first 1 in the other bits. */
export function split(x: number, b: number) {
  const h = mix16(x);
  const rest = HASH_BITS - b;
  const j = h >>> rest;
  const w = h & ((1 << rest) - 1);
  let rho = 1;
  for (let bit = rest - 1; bit >= 0 && !((w >>> bit) & 1); bit--) rho++;
  return { h, j, w, rho, rest };
}

/** The bias constant of Flajolet et al. for m registers. */
export function alpha(m: number): number {
  if (m === 16) return 0.673;
  if (m === 32) return 0.697;
  if (m === 64) return 0.709;
  return 0.7213 / (1 + 1.079 / m);
}

export interface Estimate {
  m: number;
  /** Σ 2^−M[j]. */
  Z: number;
  raw: number;
  /** Registers still 0. */
  V: number;
  /** Linear counting was used. */
  corrected: boolean;
  value: number;
}

export function estimate(s: S, small: boolean): Estimate {
  const m = regs(s);
  let Z = 0;
  for (const v of s.M) Z += 2 ** -v;
  const raw = (alpha(m) * m * m) / Z;
  const V = s.M.filter((v) => v === 0).length;
  const corrected = small && raw <= 2.5 * m && V > 0;
  return { m, Z, raw, V, corrected, value: corrected ? m * Math.log(m / V) : raw };
}

/** The estimate rounded to a whole number, as the code tabs print it. */
export const rounded = (e: Estimate) => Math.floor(e.value + 0.5);

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const f3 = (x: number) => String(Math.round(x * 1000) / 1000);

function readouts(s: S, small: boolean): Record<string, Scalar> {
  const e = estimate(s, small);
  const n = s.seen.length;
  return {
    adds: s.adds,
    'true distinct': n,
    m: e.m,
    'zeros V': e.V,
    Z: f3(e.Z),
    'raw E': f1(e.raw),
    estimate: f1(e.value),
    error: n ? `${Math.round(((e.value - n) / n) * 100)}%` : '–',
    'std error': `${Math.round((104 / Math.sqrt(e.m)) * 10) / 10}%`,
  };
}

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
}

function* badArg(s: S, small: boolean, raw: Value, err: Error) {
  yield {
    state: s,
    marks: [mark('arg-box', 'error')],
    say: `add(${String(raw)}): ${err.message} Nothing changes.`,
    lines: ['add.sig'],
    vars: readouts(s, small),
    level: 1,
    extra: { arg: { text: String(raw), error: true } },
  } satisfies HllStep;
  return s;
}

/** "M[3] = 2, M[7] = 1" style text for the estimate's sum. */
function sumText(s: S): string {
  const counts = new Map<number, number>();
  for (const v of s.M) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([v, c]) => `${c}·2^−${v}`)
    .join(' + ');
}

// ---------------------------------------------------------------------------------------------
// add

const add: Op = {
  label: 'Add',
  arity: 1,
  *run(s0, [raw], { settings }) {
    const small = settings.small;
    const x = readNumber(raw!);
    if (x instanceof Error) return yield* badArg(s0, small, raw!, x);
    const { h, j, rho, rest } = split(x, s0.b);
    const bits = binary(h, HASH_BITS);
    const head = bits.slice(0, s0.b);
    const tail = bits.slice(s0.b);
    const c: Ctx = { s: s0, extra: { arg: { text: String(x) } }, vars: { x } };
    const step = (
      say: string,
      lines: string[],
      level: Level,
      marks: Mark[],
      more: Partial<X>,
    ): HllStep => ({
      state: c.s,
      marks,
      say,
      lines,
      vars: { ...c.vars, ...readouts(c.s, small) },
      level,
      extra: { ...c.extra, ...more },
    });
    yield step(
      `add(${x}): hash it to ${HASH_BITS} bits. h(${x}) = ${h}, which is ${bits} in binary.`,
      ['add.sig', 'add.hash'],
      2,
      [mark('arg-box', 'active')],
      { hash: { value: h, show: 'bits' }, formula: `h(${x}) = ${h}` },
    );
    c.vars.j = j;
    yield step(
      `The first b = ${s0.b} bits, ${head}, pick the register: ${head} in binary is ${j}, so register ${j}.`,
      ['add.index'],
      2,
      [mark(regId(j), 'active')],
      { hash: { value: h, show: 'index' }, formula: `j = ${head}₂ = ${j}` },
    );
    c.vars.ρ = rho;
    const zeros = rho - 1;
    yield step(
      zeros === rest
        ? `The other ${rest} bits are all 0, so ρ = ${rest + 1}, the largest possible.`
        : `The other ${rest} bits, ${tail}, start with ${zeros} ${zeros === 1 ? 'zero' : 'zeros'} before the first 1, so ρ = ${rho}. A run of ${zeros} leading zeros turns up about once in every ${2 ** rho} items.`,
      ['add.rho'],
      2,
      [mark(regId(j), 'active')],
      { hash: { value: h, rho, show: 'rho' }, formula: `ρ(${tail}) = ${rho}` },
    );
    const before = s0.M[j]!;
    const isNew = !s0.seen.includes(x);
    const s: S = {
      ...s0,
      M: before < rho ? s0.M.map((v, q) => (q === j ? rho : v)) : s0.M,
      seen: isNew ? [...s0.seen, x] : s0.seen,
      adds: s0.adds + 1,
    };
    c.s = s;
    const e = estimate(s, small);
    yield step(
      `M[${j}] = max(${before}, ${rho}) = ${Math.max(before, rho)}${before < rho ? '' : ', unchanged'}.${
        isNew
          ? ''
          : ` ${x} was added before: the same item always hashes the same way, so a repeat never changes anything.`
      } The estimate is now ${f1(e.value)}; the true number of distinct items is ${s.seen.length}.`,
      ['add.max'],
      1,
      [mark(regId(j), before < rho ? 'new' : 'compare')],
      { hash: { value: h, rho, show: 'rho' }, formula: `M[${j}] = max(${before}, ${rho})` },
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// estimate

const count: Op = {
  label: 'Estimate',
  arity: 0,
  *run(s, _args, { settings }) {
    const small = settings.small;
    const e = estimate(s, small);
    const a = alpha(e.m);
    const calc: string[] = [];
    const c: Ctx = { s, extra: { calc }, vars: {} };
    const step = (say: string, lines: string[], level: Level): HllStep => ({
      state: s,
      marks: [],
      say,
      lines,
      vars: { ...c.vars, ...readouts(s, small) },
      level,
      extra: { calc: [...calc] },
    });
    calc.push(`Z = Σ 2^−M[j] = ${f3(e.Z)}`);
    yield step(
      `estimate(): add up 2^−M[j] over the ${e.m} registers: Z = ${sumText(s)} = ${f3(e.Z)}. A register that saw a long run of zeros adds very little.`,
      ['est.sig', 'est.sum'],
      2,
    );
    calc.push(`E = α·m²/Z = ${a}·${e.m}²/${f3(e.Z)} = ${f1(e.raw)}`);
    yield step(
      `E = α·m²/Z = ${a} · ${e.m}² / ${f3(e.Z)} = ${f1(e.raw)}. m/Z is the harmonic mean of the 2^M[j], times m for the m registers, and α corrects a known bias.`,
      ['est.raw'],
      2,
    );
    const n = s.seen.length;
    const truth = `The true number of distinct items is ${n}.`;
    if (e.corrected) {
      calc.push(`E ≤ 2.5m, V = ${e.V}: m·ln(m/V) = ${f1(e.value)}`);
      yield step(
        `E = ${f1(e.raw)} is at most 2.5m = ${2.5 * e.m}, and ${e.V} ${e.V === 1 ? 'register is' : 'registers are'} still 0, so the raw formula is unreliable. Use linear counting instead: m·ln(m/V) = ${e.m}·ln(${e.m}/${e.V}) = ${f1(e.value)}. ${truth}`,
        ['est.small', 'est.lc'],
        1,
      );
    } else {
      calc.push(`estimate = ${f1(e.value)}`);
      const why = !small
        ? 'Small-range correction is off, so this is the answer.'
        : e.V === 0
          ? 'No register is 0, so no correction is needed.'
          : `E is above 2.5m = ${2.5 * e.m}, so no correction is needed.`;
      yield step(`${why} The estimate is ${f1(e.value)}. ${truth}`, ['est.small', 'est.ret'], 1);
    }
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s0, _args, { settings }) {
    const s = init({ ...settings, b: s0.b });
    yield {
      state: s,
      marks: [],
      say: 'clear(): every register is 0 again.',
      lines: ['clr.sig'],
      vars: readouts(s, settings.small),
      level: 1,
    } satisfies HllStep;
    return s;
  },
};

export const ops: Record<string, Op> = { add, estimate: count, clear };

// ---------------------------------------------------------------------------------------------
// pseudocode and text

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: HllSettings): PseudoBlock[] {
  const b = settings.b;
  const est = settings.small
    ? [
        L(
          'est.small',
          1,
          'if E ≤ 2.5m and V > 0  // V: registers that are 0',
          'If E is small and some registers are still 0,',
        ),
        L('est.lc', 2, 'return m·ln(m/V)', 'count the empty registers instead (linear counting).'),
        L('est.ret', 1, 'return E', 'Otherwise E is the estimate.'),
      ]
    : [
        L(
          'est.small',
          1,
          '// no small-range correction',
          'There is no correction for small counts,',
        ),
        L('est.ret', 1, 'return E', 'so E is the estimate.'),
      ];
  return [
    {
      op: 'add',
      lines: [
        L('add.sig', 0, 'add(x)', 'To add x:'),
        L('add.hash', 1, `h = hash(x)  // ${HASH_BITS} bits`, `hash it to ${HASH_BITS} bits;`),
        L('add.index', 1, `j = first ${b} bits of h`, `the first ${b} bits pick a register j;`),
        L(
          'add.rho',
          1,
          'ρ = leading zeros of the rest + 1',
          'ρ is the position of the first 1 in the other bits;',
        ),
        L('add.max', 1, 'M[j] = max(M[j], ρ)', 'keep the largest ρ the register has seen.'),
      ],
    },
    {
      op: 'estimate',
      lines: [
        L('est.sig', 0, 'estimate()', 'To estimate the number of distinct items:'),
        L('est.sum', 1, 'Z = Σⱼ 2^−M[j]', 'add up 2 to the power −M[j] over the registers,'),
        L('est.raw', 1, 'E = α·m² / Z', 'scale m² by α and divide by that sum.'),
        ...est,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear(): M[0 … m − 1] = 0', 'To start again, set every register to 0.'),
      ],
    },
  ];
}

export function initialSay(state: S, settings: HllSettings): string {
  return `An empty HyperLogLog with m = 2^${state.b} = ${regs(state)} registers, all 0. Each item is hashed to ${HASH_BITS} bits (MurmurHash3's finalizer, top ${HASH_BITS} bits): the first ${state.b} pick a register, and the rest give ρ.${
    settings.small ? '' : ' Small-range correction is off.'
  }`;
}

export function initialVars(state: S, settings: HllSettings) {
  return readouts(state, settings.small);
}

export function describe(state: S): string {
  return `HyperLogLog with ${regs(state)} registers: ${state.M.map((v, j) => `M[${j}] = ${v}`).join(', ')}. ${state.seen.length} distinct items added.`;
}
