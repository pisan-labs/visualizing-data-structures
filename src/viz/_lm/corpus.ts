/**
 * The toy corpus the AI and LLM pages share (PLAN.md 20.4): short sentences we wrote ourselves,
 * in lower case, from the toy vocabulary (vocab.ts) plus a few words that share pieces (walk,
 * walked, walking...) so a tokenizer has something to merge. The tokenizers, the n-gram model,
 * word2vec and speculative decoding train on it, so a learner meets the same words across pages.
 *
 * Keep it small: every count on a page should fit on a phone.
 */

export const CORPUS: readonly string[] = [
  'the cat sat on the mat',
  'the dog sat on the rug',
  'the cat saw the dog',
  'the dog saw the cat',
  'the dog chased the cat',
  'the cat ran under the tree',
  'the bird sat on the tree',
  'a dog ate the ball',
  'the fox ran and the dog chased it',
  'the cat slept on the mat',
  'the dog walked and the cat walked',
  'the cat is walking',
  'the dog is talking',
  'the bird talked and talked',
  'the fox is running',
  'the dog ran to the box',
  'the cat sat in the box',
  'a bird saw a cat',
];

/** Every word of the corpus, in order. */
export const corpusWords = (): string[] => CORPUS.flatMap((s) => s.split(' '));

/** How often each word occurs, in order of first appearance. */
export function wordCounts(sentences: readonly string[] = CORPUS): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sentences)
    for (const w of s.split(/\s+/).filter(Boolean)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return counts;
}
