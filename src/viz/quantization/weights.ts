import type { Rng } from '../../engine/rng';
import { COLS, ROWS } from './model';

const N = ROWS * COLS;

/** Weights near 0, bell-shaped like a trained layer's, to two decimals. */
export function randomWeights(rng: Rng, spread = 0.7): number[] {
  return Array.from({ length: N }, () => {
    const x = (rng.next() + rng.next() + rng.next() - 1.5) * spread;
    return Math.round(x * 100) / 100 || 0;
  });
}

/** An outlier at a random place: [row, column, value], 1-based. */
export function outlier(rng: Rng): [number, number, number] {
  const v = (rng.int(0, 1) ? 1 : -1) * (rng.int(40, 80) / 10);
  return [rng.int(1, ROWS), rng.int(1, COLS), v];
}

