import type { Rng } from '../../engine/rng';
import type { OpCall, PseudoBlock } from '../../engine/types';

/** Helpers shared by the practice sets of the linked list pages. */

/** An operation as inline code: `insertAt(2, 99)`. */
export const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
export const calls = (cs: OpCall[]) => cs.map(call).join(', ');

/** n different whole numbers from lo to hi. */
export function distinct(rng: Rng, n: number, lo = 1, hi = 99): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(lo, hi));
  return [...out];
}

export function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const pick = <T>(rng: Rng, xs: T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** A choice answer: the right option plus up to max - 1 different ones, in random order. */
export function choice(rng: Rng, right: string, others: string[], max = 4) {
  const wrong = shuffle(
    rng,
    [...new Set(others)].filter((o) => o !== right),
  ).slice(0, max - 1);
  const options = shuffle(rng, [right, ...wrong]);
  return { kind: 'choice' as const, options, correct: options.indexOf(right) };
}

/** The formal pseudocode text of a line, by id. */
export function lineText(blocks: PseudoBlock[], id: string): string {
  for (const b of blocks) for (const l of b.lines) if (l.id === id) return l.text;
  throw new Error(`no pseudocode line ${id}`);
}

export const ordinal = (k: number) =>
  ['first', 'second', 'third', 'fourth'][k] ?? `number ${k + 1}`;
