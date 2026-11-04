/**
 * Input helpers shared by the B-tree, 2-4 tree and B+ tree pages: key lists for presets.
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset } from '../../engine/types';

/** n distinct keys from 1 to 99 (or more when n is large), in random order. */
export function distinctKeys(rng: Rng, n: number): number[] {
  const hi = Math.max(99, 3 * n);
  const keys = new Set<number>();
  while (keys.size < n) keys.add(rng.int(1, hi));
  return [...keys];
}

export function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);
export const deletes = (keys: number[]): OpCall[] => keys.map((k) => ['delete', k] as OpCall);
export const ascending = (keys: number[]) => [...keys].sort((a, b) => a - b);

/** Presets every multiway tree page offers. */
export function treePresets(): Preset[] {
  return [
    { label: 'Random order', make: (rng, n) => inserts(distinctKeys(rng, n)) },
    { label: 'Ascending', make: (rng, n) => inserts(ascending(distinctKeys(rng, n))) },
    {
      label: 'Descending',
      make: (rng, n) => inserts(ascending(distinctKeys(rng, n)).reverse()),
    },
    {
      label: 'Ascending, 10, 20, 30...',
      make: (_rng, n) => inserts(Array.from({ length: n }, (_, i) => 10 * (i + 1))),
    },
    {
      label: 'Insert, then delete half',
      make: (rng, n) => {
        const keys = distinctKeys(rng, n);
        const gone = shuffle(rng, keys).slice(0, Math.floor(n / 2));
        return [...inserts(keys), ...deletes(gone)];
      },
    },
  ];
}
