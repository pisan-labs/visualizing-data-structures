/**
 * The toy vocabulary the AI and LLM pages share (PLAN.md 20.4): short words, each with a
 * hand-made embedding of four numbers, one per feature, so a learner can read what a vector
 * means. Words of six letters at most keep the tables readable on a phone.
 *
 *   animal  thing  action  small (a function word: the, a, on, and...)
 *
 * A word outside the vocabulary gets made-up numbers from a hash of its letters: the same word
 * always gets the same vector.
 */

export const FEATURES = ['animal', 'thing', 'action', 'small'] as const;
export const D_MODEL = FEATURES.length;

export const VOCAB: Readonly<Record<string, readonly number[]>> = {
  cat: [1, 0.1, 0, 0],
  dog: [0.9, 0.2, 0, 0],
  bird: [0.8, 0, 0.2, 0],
  fox: [1, 0, 0.1, 0],
  mat: [0, 1, 0, 0],
  ball: [0.1, 0.9, 0, 0],
  box: [0, 1, 0, 0.1],
  rug: [0, 0.9, 0, 0.1],
  tree: [0, 0.8, 0, 0],
  sat: [0, 0, 1, 0],
  ran: [0, 0, 1, 0.1],
  saw: [0.1, 0, 0.9, 0],
  ate: [0, 0.1, 1, 0],
  slept: [0, 0, 0.9, 0],
  chased: [0.2, 0, 1, 0],
  the: [0, 0, 0, 1],
  a: [0, 0, 0, 0.9],
  on: [0, 0.1, 0, 0.8],
  under: [0, 0.1, 0, 0.9],
  and: [0, 0, 0.1, 0.8],
  it: [0, 0, 0.5, 0.5],
};

export const ANIMALS = ['cat', 'dog', 'bird', 'fox'];
export const THINGS = ['mat', 'ball', 'box', 'rug', 'tree'];
export const ACTIONS = ['sat', 'ran', 'saw', 'ate', 'slept', 'chased'];

export const MAX_WORD = 6;

export const known = (w: string): boolean => Object.hasOwn(VOCAB, w);

/** A word's embedding: its row in VOCAB, or one decimal per feature from a hash of its letters. */
export function embed(w: string): number[] {
  const v = VOCAB[w];
  if (v) return [...v];
  let h = 2166136261;
  for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return FEATURES.map((_, i) => (((h >>> (i * 8)) & 0xff) % 11) / 10);
}
