/**
 * Texts for presets and practice: sentences of the shared toy corpus (src/viz/_lm/corpus.ts)
 * whose words are all in the toy vocabulary, joined with "and" when one is too short.
 */
import type { Rng } from '../../engine/rng';
import { CORPUS } from '../_lm/corpus';
import { known } from '../_lm/vocab';
import { MAX_TOKENS } from './model';

export const SENTENCES: readonly string[] = CORPUS.filter((s) =>
  s.split(' ').every((w) => known(w)),
);

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** `size` words (1 to MAX_TOKENS) of corpus text. */
export function randomWords(rng: Rng, size: number): string[] {
  const n = Math.max(1, Math.min(MAX_TOKENS, size));
  const words = pick(rng, SENTENCES).split(' ');
  while (words.length < n) words.push('and', ...pick(rng, SENTENCES).split(' '));
  return words.slice(0, n);
}
