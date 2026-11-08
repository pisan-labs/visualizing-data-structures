/**
 * Small helpers for the balanced-tree pages' practice questions (avl, treap, splay, red-black):
 * how a call reads in a prompt, and random keys.
 */
import type { Rng } from '../../engine/rng';
import type { OpCall } from '../../engine/types';

/** A call as it reads in a prompt: `insert(5)`. */
export const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
export const calls = (cs: OpCall[]) => cs.map(call).join(', ');

/** n different whole numbers from lo to hi. */
export function distinct(rng: Rng, n: number, lo = 1, hi = 99): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(lo, hi));
  return [...out];
}

export function pick<T>(rng: Rng, xs: T[]): T {
  return xs[rng.int(0, xs.length - 1)]!;
}
