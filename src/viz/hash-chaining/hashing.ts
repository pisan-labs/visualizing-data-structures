/**
 * Shared by the hashing pages (hash-chaining, hash-open, hash-buckets, hash-rehash): reading
 * keys, the hash functions with their arithmetic spelled out for narration, and small numeric
 * helpers.
 */
import type { Value } from '../../engine/types';

/** A key: a whole number, or a short word when a string hash is chosen. */
export type Key = number | string;

/** division: k mod m (CLRS). multiplication: ⌊m · frac(k·A)⌋. sum and poly hash strings. */
export type HashFn = 'division' | 'multiplication' | 'sum' | 'poly';

export const MAX_KEY = 999;
/** Longest word key or value, so it fits in a node. */
export const MAX_TEXT = 5;
/** Knuth's suggestion for the multiplication method, (√5 − 1) / 2. */
export const A = (Math.sqrt(5) - 1) / 2;
export const POLY_BASE = 31;

const DIGITS = /^\d+$/;
const WORD = /^[A-Za-z0-9]+$/;

export const isStringHash = (fn: HashFn) => fn === 'sum' || fn === 'poly';

/**
 * The input box's parser, the same for every setting: "42" is a number, "cat" a word, and
 * "cat=3" a key with a value (kept as one string for insert to split).
 */
export function parseKeyInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a key first.');
  const parts = t.split('=');
  if (parts.length > 2) return new Error('Type one key, or a key and a value such as cat=3.');
  const k = parts[0]!.trim();
  const err = keyError(k);
  if (err) return err;
  if (parts.length === 1) return DIGITS.test(k) ? Number(k) : k;
  const v = parts[1]!.trim();
  const verr = valueError(v);
  if (verr) return verr;
  return `${DIGITS.test(k) ? Number(k) : k}=${v}`;
}

function keyError(k: string): Error | null {
  if (DIGITS.test(k)) {
    return Number(k) > MAX_KEY ? new Error(`Keep number keys between 0 and ${MAX_KEY}.`) : null;
  }
  if (!WORD.test(k))
    return new Error(`Keys are whole numbers from 0 to ${MAX_KEY}, or short words such as cat.`);
  if (k.length > MAX_TEXT) return new Error(`Keep word keys to ${MAX_TEXT} letters or digits.`);
  return null;
}

function valueError(v: string): Error | null {
  if (!WORD.test(v)) return new Error('A value is a short word or number, such as cat=3.');
  if (v.length > MAX_TEXT) return new Error(`Keep values to ${MAX_TEXT} characters.`);
  return null;
}

export interface KeyArg {
  key: Key;
  /** The value typed after "=", or null for a bare key. */
  value: string | null;
}

const FN_NAME: Record<HashFn, string> = {
  division: 'The division method',
  multiplication: 'The multiplication method',
  sum: 'The character-sum hash',
  poly: 'The polynomial hash',
};

/**
 * Read an operation's argument under the chosen hash function. Number hashes need whole
 * numbers; string hashes take any key as text, so 42 becomes the word "42".
 */
export function readKey(raw: Value, fn: HashFn): KeyArg | Error {
  const text = String(raw).trim();
  const parts = text.split('=');
  if (parts.length > 2) return new Error('Type one key, or a key and a value such as cat=3.');
  const k = parts[0]!.trim();
  const err = keyError(k);
  if (err) return err;
  let value: string | null = null;
  if (parts.length === 2) {
    const v = parts[1]!.trim();
    const verr = valueError(v);
    if (verr) return verr;
    value = v;
  }
  if (isStringHash(fn)) return { key: DIGITS.test(k) ? String(Number(k)) : k, value };
  if (!DIGITS.test(k)) {
    return new Error(
      `${fmtKey(k)} is not a whole number. ${FN_NAME[fn]} hashes numbers; choose a string hash in Options to use words.`,
    );
  }
  return { key: Number(k), value };
}

/** Whole-number keys only (open addressing, buckets, rehashing). */
export function readNumber(raw: Value): number | Error {
  const a = readKey(raw, 'division');
  if (a instanceof Error) return a;
  if (a.value !== null) return new Error('This table stores keys only. Type a number such as 42.');
  return a.key as number;
}

/** A key in narration: words in quotes, numbers as they are. */
export const fmtKey = (k: Key) => (typeof k === 'string' ? `"${k}"` : String(k));

const SUPER = ['', '', '²', '³', '⁴', '⁵', '⁶'];

/** Cut (not round) to d decimals, so the shown digits agree with the floor taken next. */
export function trunc(x: number, d: number): string {
  const f = 10 ** d;
  return (Math.floor(x * f + 1e-9) / f).toFixed(d);
}

export interface Hashed {
  index: number;
  /** The computation with real numbers, for narration. */
  say: string;
  /** A one-line version for the drawing. */
  short: string;
}

export function hashOf(key: Key, m: number, fn: HashFn): Hashed {
  const k = fmtKey(key);
  if (fn === 'sum' || fn === 'poly') {
    const s = String(key);
    const codes = [...s].map((c) => c.charCodeAt(0));
    const letters = [...s].map((c, j) => `${c} = ${codes[j]}`).join(', ');
    if (fn === 'sum') {
      const total = codes.reduce((a, b) => a + b, 0);
      const index = total % m;
      const sum = codes.length > 1 ? `(${codes.join(' + ')}) mod ${m} = ` : '';
      return {
        index,
        say: `h(${k}) adds the character codes (${letters}): h(${k}) = ${sum}${total} mod ${m} = ${index}`,
        short: `h(${k}) = ${total} mod ${m} = ${index}`,
      };
    }
    const L = codes.length;
    let total = 0;
    for (const c of codes) total = total * POLY_BASE + c;
    const index = total % m;
    const terms = codes
      .map((c, j) => {
        const p = L - 1 - j;
        return p === 0 ? String(c) : p === 1 ? `${c}·${POLY_BASE}` : `${c}·${POLY_BASE}${SUPER[p]}`;
      })
      .join(' + ');
    const poly = L > 1 ? `(${terms}) mod ${m} = ` : '';
    return {
      index,
      say: `h(${k}) treats the character codes (${letters}) as digits in base ${POLY_BASE}: h(${k}) = ${poly}${total} mod ${m} = ${index}`,
      short: `h(${k}) = ${total} mod ${m} = ${index}`,
    };
  }
  const n = key as number;
  if (fn === 'multiplication') {
    const prod = n * A;
    const frac = prod - Math.floor(prod);
    const index = Math.min(m - 1, Math.floor(m * frac));
    return {
      index,
      say: `h(${k}) = ⌊m · frac(k · A)⌋ with A ≈ 0.618034: ${k} × 0.618034 = ${trunc(prod, 4)}, keep the fraction ${trunc(frac, 4)}, times ${m} is ${trunc(m * frac, 2)}, and the floor is ${index}`,
      short: `h(${k}) = ⌊${m} · ${trunc(frac, 4)}⌋ = ${index}`,
    };
  }
  const index = n % m;
  return {
    index,
    say: `h(${k}) = ${k} mod ${m} = ${index}`,
    short: `h(${k}) = ${k} mod ${m} = ${index}`,
  };
}

/** Load factor n/m, to two decimals. */
export const loadFactor = (n: number, m: number) => Math.round((n / m) * 100) / 100;

/** A number with at most two decimals and no trailing zeros: 1.14, 0.5, 2. */
export const fmtNum = (x: number) => String(Math.round(x * 100) / 100);

/** "α = 8/7 ≈ 1.14", or "α = 7/7 = 1" when it is exact. */
export function fmtAlpha(n: number, m: number): string {
  const exact = Number.isInteger((n * 100) / m);
  return `α = ${n}/${m} ${exact ? '=' : '≈'} ${fmtNum(n / m)}`;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/** The smallest prime that is at least n. */
export function nextPrime(n: number): number {
  let p = Math.max(2, n);
  while (!isPrime(p)) p++;
  return p;
}

/** The largest prime below n (2 if there is none), for double hashing's R − (k mod R). */
export function primeBelow(n: number): number {
  for (let p = n - 1; p >= 2; p--) if (isPrime(p)) return p;
  return 2;
}

export function shuffle<T>(next: () => number, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
