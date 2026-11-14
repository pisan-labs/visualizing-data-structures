/** Lists that suit each goal, for presets, the random button and practice. */
import type { Rng } from '../../engine/rng';
import type { Goal } from './model';

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** k different values from lo..hi. */
function distinct(rng: Rng, k: number, lo: number, hi: number): number[] {
  return shuffle(
    rng,
    Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
  ).slice(0, k);
}

export interface ListOptions {
  /** Values from 32 to 63 instead of 0 to 15. */
  big?: boolean;
  /** Put the answer first ('first') or last ('last') instead of anywhere. */
  at?: 'first' | 'last';
  /** One single appears three times instead of once. */
  triple?: boolean;
}

/** About n values that suit the goal: pairs and singles, or 0..n with one missing. */
export function listFor(rng: Rng, goal: Goal, n: number, o: ListOptions = {}): number[] {
  const [lo, hi] = o.big ? [32, 63] : [0, 15];
  if (goal === 'missing') {
    const size = Math.max(3, Math.min(n, 10));
    const gone = o.at === 'first' ? 0 : o.at === 'last' ? size : rng.int(0, size);
    return shuffle(
      rng,
      Array.from({ length: size + 1 }, (_, i) => i).filter((v) => v !== gone),
    );
  }
  const singles = goal === 'two' ? 2 : 1;
  const extra = o.triple ? 2 : 0;
  const pairs = Math.max(1, Math.floor((Math.min(n, 10) - singles - extra) / 2));
  const vs = distinct(rng, pairs + singles, lo, hi);
  const alone = vs.slice(0, singles);
  const paired = vs.slice(singles).flatMap((v) => [v, v]);
  const triple = o.triple ? [alone[0]!, alone[0]!] : [];
  const rest = shuffle(rng, [...paired, ...triple]);
  if (o.at === 'first') return [...alone, ...rest];
  if (o.at === 'last') return [...rest, ...alone];
  return shuffle(rng, [...alone, ...rest]);
}
