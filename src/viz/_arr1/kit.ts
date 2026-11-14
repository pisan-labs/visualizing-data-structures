/**
 * Shared text and input helpers for three "Array and string tricks" pages: kadane,
 * difference-array and frequency-counting. This folder has no index.ts, so the registry does not
 * treat it as a page.
 *
 * - Numbers in narration use a true minus sign: fmt(−3) is "−3".
 * - readInts reads an operation's list of whole numbers with limits, or says what is wrong.
 * - parseIntsOrInt is the input box of a page whose operations take a list (Load) or one whole
 *   number (an index, an amount): one token stays a number, a list is joined with spaces.
 * - readWords reads a list of lowercase words, letters a to z only.
 */
import type { Value } from '../../engine/types';

// ----- Text -----

/** A number for narration, with a true minus sign: "−3". */
export const fmt = (v: number): string => (v < 0 ? `−${-v}` : String(v));

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** "5 + 3", "5 − 1" for a negative right side. */
export const plus = (a: number, b: number): string =>
  b < 0 ? `${fmt(a)} − ${-b}` : `${fmt(a)} + ${b}`;

/** "A[2..4]", or "A[2]" for one value. */
export const span = (lo: number, hi: number, name = 'A'): string =>
  lo === hi ? `${name}[${lo}]` : `${name}[${lo}..${hi}]`;

// ----- Whole numbers -----

const INT = /^[-−]?\d+$/;
const num = (t: string) => {
  const v = Number(t.replace('−', '-'));
  return v === 0 ? 0 : v;
};

export interface IntLimits {
  /** Most values in the list. */
  max: number;
  lo: number;
  hi: number;
  /** What the refusal suggests typing, such as "3 -4 5 -2". */
  example: string;
}

/** An operation's list of whole numbers, or why it cannot be read. */
export function readInts(arg: Value | undefined, o: IntLimits): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (tokens.length === 0) return `Type some values first, such as ${o.example}.`;
  if (tokens.length > o.max)
    return `That is ${tokens.length} values. Use at most ${o.max}, so every one stays readable.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!INT.test(t)) return `"${t}" is not a whole number.`;
    const v = num(t);
    if (v < o.lo || v > o.hi)
      return `${t} is out of range. Use whole numbers from ${fmt(o.lo)} to ${o.hi}.`;
    out.push(v);
  }
  return out;
}

/** An operation's single whole number from lo to hi, or why it cannot be read. */
export function readInt(
  arg: Value | undefined,
  lo: number,
  hi: number,
  what: string,
): number | string {
  const t = String(arg ?? '').trim();
  if (!INT.test(t)) return `Type ${what} as one whole number, such as ${lo === 0 ? 1 : lo}.`;
  const v = num(t);
  if (v < lo || v > hi) return `${what} must be from ${fmt(lo)} to ${hi}, not ${fmt(v)}.`;
  return v;
}

/**
 * For the input box: one whole number stays a number (an argument such as an index), a list
 * becomes "v1 v2 ..." for Load. Values are checked against `o` when there are several.
 */
export function parseIntsOrInt(o: IntLimits, single: { lo: number; hi: number }) {
  return (token: string): Value | Error => {
    const tokens = token.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length === 0) return new Error(`Type a number, or a list such as ${o.example}.`);
    if (tokens.length === 1) {
      const t = tokens[0]!;
      if (!INT.test(t)) return new Error(`"${t}" is not a whole number.`);
      const v = num(t);
      const lo = Math.min(single.lo, o.lo);
      const hi = Math.max(single.hi, o.hi);
      if (v < lo || v > hi) return new Error(`${t} is out of range. Use ${fmt(lo)} to ${hi}.`);
      return v;
    }
    const vs = readInts(tokens.join(' '), o);
    return typeof vs === 'string' ? new Error(vs) : vs.join(' ');
  };
}

// ----- Words -----

export interface WordLimits {
  /** Most words in the list. */
  max: number;
  /** Most letters in a word. */
  letters: number;
}

/** An operation's list of words (letters a to z, made lowercase), or why it cannot be read. */
export function readWords(arg: Value | undefined, o: WordLimits): string[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (tokens.length === 0) return 'Type some words first, such as tops spot pots.';
  if (tokens.length > o.max)
    return `That is ${tokens.length} words. Use at most ${o.max}, so every one stays readable.`;
  const out: string[] = [];
  for (const t of tokens) {
    const w = t.toLowerCase();
    if (!/^[a-z]+$/.test(w)) return `"${t}" is not a word of the letters a to z.`;
    if (w.length > o.letters)
      return `"${t}" has ${w.length} letters. Use words of at most ${o.letters}.`;
    out.push(w);
  }
  return out;
}

/** The 26 letters, a to z. */
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
