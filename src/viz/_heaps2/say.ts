/**
 * Words shared by the heap pattern pages: one sentence per heap comparison, lists in prose, and
 * input parsing for lists of small whole numbers.
 */
import type { Value } from '../../engine/types';
import type { Order, SiftEvent } from './heap';

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export function and(xs: readonly (string | number)[]): string {
  const s = xs.map(String);
  return s.length <= 1 ? s.join('') : `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`;
}

/** 1st, 2nd, 3rd, 4th... */
export function ordinal(k: number): string {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return `${k}th`;
  return `${k}${['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
}

/** Comparison words for a heap order: what goes on top, and the signs. */
export function words(order: Order) {
  const min = order === 'min';
  return {
    lt: min ? '<' : '>',
    notLt: min ? '≥' : '≤',
    smaller: min ? 'smaller' : 'bigger',
    kind: min ? 'min-heap' : 'max-heap',
  };
}

/**
 * One sentence for a heap comparison. `tieWord` explains an equal key that still wins (k-way
 * merge: "an earlier list").
 */
export function siftSay(ev: SiftEvent, order: Order, tieWord = 'it came first'): string {
  const w = words(order);
  const c = ev.challenger.key;
  const h = ev.holder.key;
  const v = ev.moving.key;
  const sign =
    c === h ? (ev.wins ? `${c} = ${h}, but ${tieWord}` : `${c} = ${h}`) : `${c} ${ev.wins ? w.lt : w.notLt} ${h}`;
  if (ev.side === 'parent') {
    if (ev.wins)
      return `Compare ${v} with its parent ${h}: ${sign}, so they swap.${ev.settled ? ` ${v} is the root now.` : ''}`;
    return `Compare ${v} with its parent ${h}: ${sign}, so ${v} stays. The heap is in order again.`;
  }
  const lead =
    ev.side === 'left'
      ? `Compare ${v} with its left child ${c}: ${sign}`
      : `Then its right child ${c}: ${sign}`;
  if (ev.swap) {
    const winner = ev.wins ? c : h;
    return `${lead}, so ${v} swaps with the ${w.smaller} child, ${winner}.${ev.settled ? ` ${v} is a leaf now.` : ''}`;
  }
  if (ev.settled)
    return `${lead}, so ${v} is no ${w.smaller === 'smaller' ? 'bigger' : 'smaller'} than its children and stays. The heap is in order again.`;
  return `${lead}.`;
}

// ----- Input -----

const INT = /^-?\d+$/;

export interface ListRules {
  min: number;
  max: number;
  most: number;
}

/** A list of whole numbers ("5 3 8"), or why it cannot be read. */
export function readList(text: string, rules: ListRules): number[] | string {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return 'Type some values first, such as 5 3 8 1.';
  if (tokens.length > rules.most)
    return `That is ${tokens.length} values. Use at most ${rules.most}, so every value stays readable.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!INT.test(t)) return `"${t}" is not a whole number.`;
    const v = Number(t) === 0 ? 0 : Number(t);
    if (v < rules.min || v > rules.max)
      return `${t} is out of range. Use whole numbers from ${rules.min} to ${rules.max}.`;
    out.push(v);
  }
  return out;
}

/** An operation's whole number from lo to hi, or why it cannot be read. */
export function readInt(arg: Value | undefined, lo: number, hi: number, what: string): number | string {
  const t = String(arg ?? '').trim();
  if (!INT.test(t)) return `Type ${what} as one whole number, such as ${Math.min(hi, lo + 2)}.`;
  const v = Number(t);
  if (v < lo || v > hi) return `${what} must be from ${lo} to ${hi}, not ${v}.`;
  return v;
}
