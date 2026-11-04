/**
 * Shared model code for the dynamic-programming pages: reading typed numbers and words from
 * operation arguments, a few text helpers, and the cell ids the table layout draws
 * (src/layouts/table.ts). This folder has no index.ts, so the registry does not treat it as a
 * page.
 */
import type { Mark, MarkRole, Value } from '../../engine/types';

export const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** Shape id of a table cell, for marks. */
export const cellId = (r: number, c: number): string => `cell-${r}-${c}`;

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** "a, b and c". */
export function andList(xs: readonly (string | number)[]): string {
  const s = xs.map(String);
  if (s.length <= 1) return s[0] ?? '';
  return `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`;
}

/**
 * An operation argument as one whole number in [lo, hi], or a message saying what is wrong.
 * `what` names the number in a sentence: "n", "the amount".
 */
export function wholeFromArg(
  arg: Value | undefined,
  lo: number,
  hi: number,
  what: string,
): number | string {
  const range = `a whole number from ${lo} to ${hi}`;
  const t = String(arg ?? '').trim();
  if (t === '') return `Type ${what} first: ${range}.`;
  if (/[\s,]/.test(t)) return `Type just one number for ${what}: ${range}.`;
  if (!/^-?\d+$/.test(t)) return `"${t}" is not ${range}.`;
  const v = Number(t);
  if (v < lo || v > hi) return `${v} is out of range. Use ${range}.`;
  return v;
}

/** A list of whole numbers ("1 3 4" or "1,3,4"), each in [lo, hi], at most `max` of them. */
export function wholesFromArg(
  arg: Value | undefined,
  lo: number,
  hi: number,
  max: number,
  what: string,
): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const range = `whole numbers from ${lo} to ${hi}`;
  if (tokens.length === 0) return `Type the ${what} first: ${range}.`;
  if (tokens.length > max) return `That is ${tokens.length} ${what}. Use at most ${max}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^-?\d+$/.test(t)) return `"${t}" is not a whole number. Use ${range}.`;
    const v = Number(t);
    if (v < lo || v > hi) return `${v} is out of range. Use ${range}.`;
    out.push(v);
  }
  return out;
}

/** Letters and digits only, 1 to `max` of them, kept as typed. */
export function wordFromArg(
  arg: Value | undefined,
  max: number,
  what: string,
): { word: string } | { error: string } {
  const t = String(arg ?? '').trim();
  if (t === '') return { error: `Type ${what} first.` };
  if (!/^[A-Za-z0-9]+$/.test(t))
    return { error: `"${t}" has characters other than letters and digits.` };
  if (t.length > max)
    return {
      error: `"${t}" has ${t.length} characters. Keep ${what} to ${max}, so the table stays readable.`,
    };
  return { word: t };
}

/** Parse one token of the input box as a word: letters and digits, kept as typed. */
export function parseWord(max: number) {
  return (token: string): Value | Error => {
    const t = token.trim();
    if (!t) return new Error('Type two words first, such as ABCBDAB BDCABA.');
    if (!/^[A-Za-z0-9]+$/.test(t)) return new Error(`Use only letters and digits in "${t}".`);
    if (t.length > max) return new Error(`Keep each word to ${max} characters.`);
    return t;
  };
}
