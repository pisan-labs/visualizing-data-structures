/**
 * Drawing a token from a distribution, as the decoding pages do it (ngram-lm, sampling): put the
 * tokens in order, most likely first, lay their probabilities end to end so they tile 0 to 1,
 * and take the token whose stretch holds a uniform number u. The code tabs walk the same order
 * and add in the same order, so they pick the same token for the same u.
 */

/** Indices by probability, largest first; equal probabilities keep their index order. */
export function byProbability(p: readonly number[]): number[] {
  return p.map((_, i) => i).sort((a, b) => p[b]! - p[a]! || a - b);
}

export interface Pick {
  /** Position in `order` of the token drawn. */
  at: number;
  /** Where each token's stretch starts and ends, in `order`: [from, to). */
  from: number[];
  to: number[];
}

/**
 * Walk `order`, adding up `p`, and stop at the first token whose running total passes u. A u
 * that rounding leaves past the last total takes the last token with a probability above 0.
 */
export function pickByU(p: readonly number[], order: readonly number[], u: number): Pick {
  const from: number[] = [];
  const to: number[] = [];
  let cum = 0;
  let at = -1;
  order.forEach((i, k) => {
    from.push(cum);
    cum += p[i]!;
    to.push(cum);
    if (at < 0 && u < cum) at = k;
  });
  if (at < 0) {
    at = order.length - 1;
    while (at > 0 && p[order[at]!]! <= 0) at--;
  }
  return { at, from, to };
}
