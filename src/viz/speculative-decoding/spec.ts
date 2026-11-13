/**
 * Speculative decoding (Leviathan et al. 2023; Chen et al. 2023), without the steps. Two toy
 * language models from the shared corpus (src/viz/_lm/corpus.ts, counted by the n-gram page):
 *
 *   draft q   the bigram model: P(w | the last word)
 *   target p  the trigram model: P(w | the last two words), or the bigram when those two words
 *             never occur together in the corpus (so p is defined after any prefix)
 *
 * One round, with k drafts:
 *   1. the draft proposes x_1 … x_k, one at a time, each drawn from q_i (or its top word)
 *   2. one pass of the target scores every position at once: p_1 … p_(k+1)
 *   3. accept x_i when u_i < p_i(x_i) / q_i(x_i), that is with probability min(1, p/q); stop at
 *      the first rejection and draw a word from norm(max(0, p_i − q_i)) instead
 *   4. if every draft is accepted, draw one more word from p_(k+1), free with the same pass
 *
 * Greedy acceptance: the draft proposes its top word, a draft is accepted when it is also the
 * target's top word, and the target's top word replaces the first one that is not.
 *
 * Every probability is a count over a total, so the four implementations (this one and the code
 * tabs) agree to the last bit: no exp, no log. Words are drawn the way the other decoding pages
 * draw (src/viz/_decode/draw.ts): most likely first, ties alphabetical, the first word whose
 * running total passes u.
 */
import { countsFor, dist, EOS } from '../ngram-lm/model';

export { EOS };

/** A distribution over next words: the words most likely first (ties alphabetical). */
export interface Dist {
  words: string[];
  p: Map<string, number>;
}

const byChance = (p: Map<string, number>) =>
  [...p.keys()].sort((a, b) => p.get(b)! - p.get(a)! || (a < b ? -1 : a > b ? 1 : 0));

export const makeDist = (p: Map<string, number>): Dist => ({ words: byChance(p), p });

export const chance = (d: Dist, w: string): number => d.p.get(w) ?? 0;

function ngram(n: number, prefix: readonly string[]): Dist | null {
  const c = countsFor(n);
  const ctx = [...Array<string>(n - 1).fill('<s>'), ...prefix].slice(-(n - 1));
  if (!c.totals.get(ctx.join(' '))) return null;
  const d = dist(c, ctx, 0);
  return makeDist(new Map(d.order.map((w, i) => [w, d.p[i]!])));
}

/** The draft model: the bigram. Every word of the corpus has been followed by something. */
export const draftDist = (prefix: readonly string[]): Dist => ngram(2, prefix)!;

/** The target model: the trigram, or the bigram where the trigram has never seen the context. */
export const targetDist = (prefix: readonly string[]): Dist =>
  ngram(3, prefix) ?? draftDist(prefix);

/** Does the trigram know this context (else the target backs off to the bigram)? */
export const trigramKnows = (prefix: readonly string[]): boolean => ngram(3, prefix) !== null;

/** Where each word's stretch of [0, 1) starts and ends, in d.words order. */
export function stretches(d: Dist): { from: number[]; to: number[] } {
  const from: number[] = [];
  const to: number[] = [];
  let cum = 0;
  for (const w of d.words) {
    from.push(cum);
    cum += d.p.get(w)!;
    to.push(cum);
  }
  return { from, to };
}

/** The word whose stretch holds u (the last one, if rounding leaves u past the total). */
export function drawFrom(d: Dist, u: number): string {
  let cum = 0;
  for (const w of d.words) {
    cum += d.p.get(w)!;
    if (u < cum) return w;
  }
  return d.words.at(-1)!;
}

export const top = (d: Dist): string => d.words[0]!;

/** norm(max(0, p − q)): what the target wanted more than the draft gave, scaled to add up to 1. */
export function leftover(p: Dist, q: Dist): Dist {
  const raw = new Map<string, number>();
  let total = 0;
  for (const w of p.words) {
    const r = p.p.get(w)! - chance(q, w);
    if (r > 0) {
      raw.set(w, r);
      total += r;
    }
  }
  return makeDist(new Map([...raw].map(([w, r]) => [w, r / total])));
}

/** The raw differences max(0, p − q), before scaling, for the picture and narration. */
export function excess(p: Dist, q: Dist): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of p.words) out.set(w, Math.max(0, p.p.get(w)! - chance(q, w)));
  return out;
}

export interface Round {
  /** Prompt and words generated before the round. */
  prefix: string[];
  greedy: boolean;
  /** Drafts allowed (the draft stops early after </s>). */
  k: number;
  drafts: string[];
  /** q_i, the draft model's distribution at each draft. */
  qs: Dist[];
  /** The u each draft was drawn with (null: greedy). */
  qu: (number | null)[];
  /** p_1 … p_(n+1): the target at each draft, and after the last unless it ended the text. */
  ps: Dist[];
  /** The u each acceptance test used (null: greedy), as far as the tests went. */
  au: (number | null)[];
  /** Drafts accepted, in order from the first. */
  accepted: number;
  /** The word the target adds: a resample after a rejection, or the bonus after all are taken. */
  extra: string | null;
  kind: 'resample' | 'bonus' | 'none';
  /** The distribution the extra word was drawn from, and its u. */
  extraDist: Dist | null;
  eu: number | null;
}

/** What drafting leaves for the target to check. */
export type Drafted = Pick<Round, 'k' | 'drafts' | 'qs' | 'qu'>;

/** Step 1: the draft proposes up to k words, stopping after </s>. */
export function draftWords(
  prefix: readonly string[],
  k: number,
  greedy: boolean,
  next: () => number,
): Drafted {
  const drafts: string[] = [];
  const qs: Dist[] = [];
  const qu: (number | null)[] = [];
  for (let i = 0; i < k; i++) {
    const q = draftDist([...prefix, ...drafts]);
    const u = greedy ? null : next();
    const x = u === null ? top(q) : drawFrom(q, u);
    drafts.push(x);
    qs.push(q);
    qu.push(u);
    if (x === EOS) break;
  }
  return { k, drafts, qs, qu };
}

/** Steps 2 to 4: one target pass over the drafts, the tests, and the word the target adds. */
export function verifyDrafts(
  prefix: readonly string[],
  d: Drafted,
  greedy: boolean,
  next: () => number,
  extraU: () => number = next,
): Round {
  const n = d.drafts.length;
  const ended = d.drafts.at(-1) === EOS;
  const ps: Dist[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === n && ended) break;
    ps.push(targetDist([...prefix, ...d.drafts.slice(0, i)]));
  }
  const au: (number | null)[] = [];
  let accepted = 0;
  for (let i = 0; i < n; i++) {
    const x = d.drafts[i]!;
    let ok: boolean;
    if (greedy) {
      au.push(null);
      ok = top(ps[i]!) === x;
    } else {
      const u = next();
      au.push(u);
      ok = u < chance(ps[i]!, x) / chance(d.qs[i]!, x);
    }
    if (!ok) break;
    accepted++;
  }
  const base = { prefix: [...prefix], greedy, ...d, ps, au, accepted };
  if (accepted < n) {
    const left = greedy ? null : leftover(ps[accepted]!, d.qs[accepted]!);
    const eu = greedy ? null : extraU();
    const extra = greedy ? top(ps[accepted]!) : drawFrom(left!, eu!);
    return { ...base, extra, kind: 'resample', extraDist: left, eu };
  }
  if (ended) return { ...base, extra: null, kind: 'none', extraDist: null, eu: null };
  const p = ps[n]!;
  const eu = greedy ? null : extraU();
  return {
    ...base,
    extra: greedy ? top(p) : drawFrom(p, eu!),
    kind: 'bonus',
    extraDist: p,
    eu,
  };
}

/** The words a round adds: the drafts accepted, then the target's word. */
export const added = (r: Round): string[] => [
  ...r.drafts.slice(0, r.accepted),
  ...(r.extra === null ? [] : [r.extra]),
];

/** Every u a round used, in the order it used them (what the code tabs are given). */
export const usedUs = (r: Round): number[] =>
  [...r.qu, ...r.au, r.eu].filter((u): u is number => u !== null);
