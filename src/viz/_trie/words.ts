/**
 * Words for the trie pages (trie, compressed-trie): reading them, and word lists for presets
 * and practice questions.
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Value } from '../../engine/types';

export const MAX_WORD = 10;

/**
 * Read a word: lowercase letters only, 1 to MAX_WORD of them. Capitals are lowered, so "Cat"
 * is "cat". Returns the word, or an Error whose message a learner can act on.
 */
export function readWord(raw: Value | undefined): string | Error {
  if (typeof raw !== 'string') return new Error('A word is made of the letters a to z.');
  const w = raw.trim().toLowerCase();
  if (!w) return new Error('Type a word first.');
  if (!/^[a-z]+$/.test(w)) return new Error('Use only the letters a to z, with no spaces.');
  if (w.length > MAX_WORD) return new Error(`Keep words to ${MAX_WORD} letters.`);
  return w;
}

/** The input box: one word, or several separated by spaces for the bulk buttons. */
export function parseWordInput(token: string): Value | Error {
  return readWord(token);
}

/** Words in families that share prefixes, for presets and practice. */
export const FAMILIES: string[][] = [
  ['car', 'card', 'care', 'cart', 'cat', 'cats'],
  ['do', 'dog', 'dot', 'done', 'door'],
  ['an', 'and', 'ant', 'any', 'ante'],
  ['tea', 'team', 'ten', 'tend', 'the', 'then', 'to', 'toe', 'ton'],
  ['be', 'bee', 'beer', 'bet', 'bat', 'bath'],
  ['in', 'inn', 'ink', 'into', 'is', 'it'],
  ['sea', 'seat', 'see', 'seed', 'set', 'sit'],
  ['pan', 'pen', 'pin', 'pine', 'pit', 'pot'],
];

/** One word for each first letter, so no two words share a prefix. */
export const LONERS = [
  'apple',
  'bird',
  'cloud',
  'drum',
  'eagle',
  'frog',
  'grape',
  'house',
  'igloo',
  'jelly',
  'kite',
  'lemon',
  'moon',
  'nest',
];

export function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** n distinct words that share prefixes: whole families first, in a random order. */
export function sharedWords(rng: Rng, n: number): string[] {
  const out: string[] = [];
  for (const family of shuffle(rng, FAMILIES)) {
    for (const w of shuffle(rng, family)) if (out.length < n) out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

/** n words with no prefix in common. */
export function lonerWords(rng: Rng, n: number): string[] {
  return shuffle(rng, LONERS).slice(0, Math.min(n, LONERS.length));
}

/** The prefixes of one long word, shortest first: each word is a prefix of the next. */
export function chainWords(n: number, word = 'algorithms'): string[] {
  return Array.from({ length: Math.min(n, word.length) }, (_, i) => word.slice(0, i + 1));
}

/** n distinct random strings over a small alphabet, so they share a lot. */
export function randomWords(rng: Rng, n: number, letters = 'abc', lo = 1, hi = 4): string[] {
  const out = new Set<string>();
  // Over 'abc' there are 120 strings of 1 to 4 letters; never ask for more than exist.
  const most = Array.from({ length: hi - lo + 1 }, (_, i) => letters.length ** (lo + i)).reduce(
    (a, b) => a + b,
    0,
  );
  while (out.size < Math.min(n, most)) {
    const len = rng.int(lo, hi);
    let w = '';
    for (let i = 0; i < len; i++) w += letters[rng.int(0, letters.length - 1)];
    out.add(w);
  }
  return [...out];
}

export const inserts = (words: string[]): OpCall[] => words.map((w) => ['insert', w] as OpCall);

/** "a", "a and b", "a, b and c". */
export const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
