/**
 * Shared code for the range-query pages (range-queries, fenwick-tree, segment-tree): reading
 * values and indices, the input box, presets and small text helpers. This folder has no
 * index.ts, so the registry does not treat it as a page.
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset, Value } from '../../engine/types';

/** At most this many values, so 16 columns and their tree stay readable on a phone. */
export const MAX_N = 16;
export const MIN_VALUE = -99;
export const MAX_VALUE = 99;

const RANGE = `whole numbers from ${MIN_VALUE} to ${MAX_VALUE}`;
const INT = /^-?\d+$/;

/** One whole number in range, or an error a learner can act on. */
export function parseNumber(raw: Value): number | Error {
  const t = String(raw).trim();
  if (!INT.test(t)) return new Error(`"${t}" is not a whole number. Use ${RANGE}.`);
  const v = Number(t);
  if (v < MIN_VALUE || v > MAX_VALUE) return new Error(`${t} is out of range. Use ${RANGE}.`);
  return v === 0 ? 0 : v;
}

/** "5 3 8 1" or "5,3,8,1": up to MAX_N whole numbers in range. */
export function parseValueList(raw: Value): number[] | Error {
  const tokens = String(raw)
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (tokens.length === 0) return new Error('Type some numbers first, such as 5 3 8 1.');
  if (tokens.length > MAX_N)
    return new Error(
      `That is ${tokens.length} values. Use at most ${MAX_N}, so every value stays readable.`,
    );
  const out: number[] = [];
  for (const t of tokens) {
    const v = parseNumber(t);
    if (v instanceof Error) return v;
    out.push(v);
  }
  return out;
}

/** For the input box: a list becomes "5 3 8 1"; a single number stays a number. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a number first.');
  if (/[\s,;]/.test(t)) {
    const vs = parseValueList(t);
    return vs instanceof Error ? vs : vs.join(' ');
  }
  return parseNumber(t);
}

/** An operation's list argument (one number is a list of one), or why it cannot be read. */
export function readList(arg: Value | undefined): number[] | string {
  if (arg === undefined) return 'Type some numbers first, such as 5 3 8 1.';
  const vs = parseValueList(arg);
  return vs instanceof Error ? vs.message : vs;
}

/** An operation's number argument, or why it cannot be read. */
export function readNumber(arg: Value | undefined): number | string {
  if (arg === undefined) return 'A number is missing.';
  const v = parseNumber(arg);
  return v instanceof Error ? v.message : v;
}

/** An index argument: any whole number (range checks belong to the operation). */
export function readIndex(arg: Value | undefined): number | string {
  const t = String(arg ?? '').trim();
  if (!INT.test(t) || Math.abs(Number(t)) > 999) return `"${t}" is not an index.`;
  return Number(t) === 0 ? 0 : Number(t);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A[2..5]", or "A[2]" for one index. */
export const span = (lo: number, hi: number, name = 'A'): string =>
  lo === hi ? `${name}[${lo}]` : `${name}[${lo}..${hi}]`;

/** "a", "a and b", "a, b and c". */
export const and = (xs: (string | number)[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** "28 − 8", with a negative right side in parentheses: "28 − (-8)". */
export const minus = (a: number, b: number) => `${a} − ${b < 0 ? `(${b})` : b}`;

/** "16 + 9", "16 − 9" for a negative right side. */
export const plus = (a: number, b: number) => (b < 0 ? `${a} − ${-b}` : `${a} + ${b}`);

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The right option plus distinct wrong ones, shuffled: a choice answer. */
export function choice(rng: Rng, right: string, wrong: string[], count = 4) {
  const others = [...new Set(wrong.filter((w) => w !== right))].slice(0, count - 1);
  const options = shuffle(rng, [right, ...others]);
  return { kind: 'choice' as const, options, correct: options.indexOf(right) };
}

// ----- Presets -----

/** n random values from lo to hi. */
export function randomValues(rng: Rng, n: number, lo = 1, hi = 30): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

export const buildCall = (values: number[]): OpCall => ['build', values.join(' ')];

/** Presets that load a list with `build`, for every page in the family. */
export function valuePresets(): Preset[] {
  const asc = (rng: Rng, n: number) => randomValues(rng, n).sort((x, y) => x - y);
  return [
    { label: 'Random values', make: (rng, n) => [buildCall(randomValues(rng, n))] },
    { label: 'Ascending', make: (rng, n) => [buildCall(asc(rng, n))] },
    { label: 'Descending', make: (rng, n) => [buildCall(asc(rng, n).reverse())] },
    {
      label: 'Small values (0 to 9)',
      make: (rng, n) => [buildCall(randomValues(rng, n, 0, 9))],
    },
    {
      label: 'Negative and positive',
      make: (rng, n) => [buildCall(randomValues(rng, n, -20, 20))],
    },
    { label: 'All the same', make: (rng, n) => [buildCall(Array(n).fill(rng.int(1, 9)))] },
  ];
}
