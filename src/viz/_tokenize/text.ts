/**
 * Training texts and words for the tokenizer pages (bpe-tokenizer, wordpiece): reading what a
 * learner types, and the toy corpus (src/viz/_lm/corpus.ts) as the default text.
 *
 * A training text is words separated by spaces or punctuation, in any case (it is lowered). A
 * word may end in *n for n copies, so "low*5 lowest*2" is five lows and two lowests. Letters
 * only: a to z and accented letters (é, ü, ñ...), which the byte setting splits into two bytes.
 */
import type { Value } from '../../engine/types';
import { CORPUS } from '../_lm/corpus';

/** Different words in a training text, so the table of words fits a screen. */
export const MAX_WORDS = 30;
/** Letters in a word. */
export const MAX_LEN = 12;
/** Copies of a word written with *n. */
export const MAX_COUNT = 99;

/** The toy corpus as one text, sentences separated by commas. */
export const CORPUS_TEXT = CORPUS.join(', ');

export interface WordCount {
  word: string;
  count: number;
}

const LETTERS = /^\p{L}+$/u;

/** Letters only, in the Basic Multilingual Plane (so every tab reads one letter as one char). */
const isWord = (w: string) => LETTERS.test(w) && [...w].every((c) => c.codePointAt(0)! <= 0xffff);

/** Lower case, composed accents (e + ´ is é), and every separator turned into a space. */
function clean(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,;:!?"'()[\]{}‘’“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The words of a training text with their counts, in order of first appearance, or an Error a
 * learner can act on.
 */
export function parseText(raw: Value | undefined): WordCount[] | Error {
  if (typeof raw !== 'string' || !clean(raw))
    return new Error('Type some words to learn from, such as "low low lower newest".');
  const counts = new Map<string, number>();
  for (const token of clean(raw).split(' ')) {
    const m = /^(.*?)(?:\*(\d+))?$/u.exec(token)!;
    const word = m[1]!;
    const n = m[2] === undefined ? 1 : Number(m[2]);
    if (!isWord(word)) return new Error(`Use letters only ("${token}" is not a word).`);
    if ([...word].length > MAX_LEN)
      return new Error(`Keep words to ${MAX_LEN} letters ("${word}" has ${[...word].length}).`);
    if (n < 1 || n > MAX_COUNT) return new Error(`A count after * goes from 1 to ${MAX_COUNT}.`);
    counts.set(word, Math.min(999, (counts.get(word) ?? 0) + n));
  }
  if (counts.size > MAX_WORDS)
    return new Error(`At most ${MAX_WORDS} different words, so every word fits on the screen.`);
  return [...counts].map(([word, count]) => ({ word, count }));
}

/** The text as the model keeps it: lower case, words separated by single spaces. */
export function normalText(raw: string): string {
  return clean(raw);
}

/** One word to encode, or an Error a learner can act on. */
export function readWord(raw: Value | undefined): string | Error {
  if (typeof raw !== 'string' || !clean(raw)) return new Error('Type a word to encode first.');
  const w = clean(raw);
  if (w.includes(' ')) return new Error('Encode one word at a time.');
  if (!isWord(w)) return new Error(`Use letters only ("${w}" is not a word).`);
  if ([...w].length > MAX_LEN) return new Error(`Keep words to ${MAX_LEN} letters.`);
  return w;
}

/**
 * The input box: a word to encode, or a text to learn from. Both pages share it, so compare mode
 * can send the same input to both.
 */
export function parseInput(token: string): Value | Error {
  const r = parseText(token);
  return r instanceof Error ? r : clean(token);
}

/** "the ×29" style: a word with how often it occurs. */
export const times = (n: number): string => `×${n}`;

/** "a", "a and b", "a, b and c". */
export function andList(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
}
