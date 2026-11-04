/**
 * Small helpers shared by the recursion pages (factorial, reverse-string, fibonacci-calls,
 * recursion-dag, n-queens, backtracking). Drawing lives in src/layouts/calls.ts.
 */
import type { Rng } from '../../engine/rng';
import type { Mark, PracticeAnswer, PseudoLine, Value } from '../../engine/types';

export const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

/** Read a whole number in [min, max], with an error a learner can act on. */
export function parseWhole(token: string, min: number, max: number, what = 'n'): number | Error {
  const t = token.trim();
  if (!t) return new Error(`Type ${what} first.`);
  if (!/^[+-]?\d+$/.test(t)) return new Error(`${what} must be a whole number, such as 5.`);
  const v = Number(t);
  if (v < min || v > max) return new Error(`Pick ${what} from ${min} to ${max}.`);
  return v;
}

/** A value from an operation call as a whole number in [min, max], or null. */
export function wholeArg(v: Value | undefined, min: number, max: number): number | null {
  const text = typeof v === 'string' ? v.trim() : '';
  const n = typeof v === 'number' ? v : /^[+-]?\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** "1st", "2nd", "3rd", "4th"... */
export function ordinal(k: number): string {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return `${k}th`;
  return `${k}${['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
}

/** "a", "a and b", "a, b and c". */
export const and = (xs: readonly string[]): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** "1 call", "3 calls". */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

// ----- Practice -----

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A multiple-choice answer: the right option and up to three distinct wrong ones, shuffled. */
export function choice(rng: Rng, right: string, wrong: readonly string[]): PracticeAnswer {
  const others = [...new Set(wrong.filter((w) => w !== right))].slice(0, 3);
  const options = shuffle(rng, [right, ...others]);
  return { kind: 'choice', options, correct: options.indexOf(right) };
}

/** A multiple-choice answer whose options keep their order (Yes before No). */
export function ordered(options: string[], right: string): PracticeAnswer {
  return { kind: 'choice', options, correct: options.indexOf(right) };
}
