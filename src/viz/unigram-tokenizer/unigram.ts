/**
 * The unigram language model tokenizer (Kudo 2018), the algorithms without the steps: a seed
 * vocabulary from the training words, the best split of a word by Viterbi, a sampled split
 * (subword regularization), the cost of removing a piece, and one pruning round.
 *
 *   p(x)        = count(x) / Σ_y count(y)       count: occurrences in the training text
 *   P(split)    = Π p(x_i)                       pieces are independent (a unigram model)
 *   best[j]     = max over pieces x = w[i..j) of best[i] + log p(x)    best[0] = 0
 *   loss(x)     = L(V − x) − L(V),  L(V) = −Σ_w count(w) · best_V(w)
 *
 * Every score is a natural log. Two scores within EPS count as equal, and the first candidate
 * met wins: the longest last piece at a position, so the code tabs (whose logs may differ in the
 * last bit) pick the same split. Letters are always kept, so every word the text spelled has a
 * split; a letter the text never had becomes [UNK], UNK_PENALTY below the rarest piece.
 *
 * The code tabs (code/) do the same arithmetic in the same order.
 */
import type { WordCount } from '../_tokenize/text';

export const UNK = '[UNK]';
export const UNK_PENALTY = 10;
export const EPS = 1e-9;
/** Pruning keeps the best 80% of the pieces of two or more letters (Kudo's η). */
export const KEEP = 0.8;

export interface Piece {
  t: string;
  /** Occurrences in the training text, each word as often as it occurs. */
  count: number;
  /** Place in the seed vocabulary: letters first (alphabetical), then by count. */
  rank: number;
  /** log(count / total) over the current vocabulary. */
  logp: number;
}

export interface Vocab {
  pieces: Piece[];
  /** Σ count over the vocabulary. */
  total: number;
}

export const isLetter = (p: { t: string }) => [...p.t].length === 1;

/** Probabilities from the counts of the pieces kept. */
export function withProbabilities(pieces: readonly Omit<Piece, 'logp'>[]): Vocab {
  let total = 0;
  for (const p of pieces) total += p.count;
  return { pieces: pieces.map((p) => ({ ...p, logp: Math.log(p.count / total) })), total };
}

/**
 * The seed vocabulary: every letter of the text, and the `size` most frequent substrings of two
 * or more letters that occur at least twice (most frequent first, then longer, then met first).
 */
export function seedVocab(words: readonly WordCount[], size: number): Vocab {
  const letters = new Map<string, number>();
  const subs = new Map<string, { count: number; first: number }>();
  for (const { word, count } of words) {
    const w = [...word];
    for (let i = 0; i < w.length; i++) {
      letters.set(w[i]!, (letters.get(w[i]!) ?? 0) + count);
      for (let j = i + 2; j <= w.length; j++) {
        const s = w.slice(i, j).join('');
        const e = subs.get(s);
        if (e) e.count += count;
        else subs.set(s, { count, first: subs.size });
      }
    }
  }
  const chars = [...letters].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const top = [...subs]
    .filter(([, e]) => e.count >= 2)
    .sort(([a, x], [b, y]) => y.count - x.count || b.length - a.length || x.first - y.first)
    .slice(0, size);
  return withProbabilities([
    ...chars.map(([t, count], rank) => ({ t, count, rank })),
    ...top.map(([t, e], k) => ({ t, count: e.count, rank: chars.length + k })),
  ]);
}

/** The log-probability an unknown letter gets: UNK_PENALTY below the rarest piece. */
export function unkLogp(v: Vocab): number {
  let min = 0;
  for (const p of v.pieces) min = Math.min(min, p.logp);
  return min - UNK_PENALTY;
}

/** A candidate piece in the lattice of a word: letters [from, to). */
export interface Arc {
  from: number;
  to: number;
  t: string;
  logp: number;
  unk: boolean;
}

/**
 * Every arc of the lattice of `word`: each vocabulary piece where it occurs, and [UNK] for a
 * letter the vocabulary lacks. Sorted by end, then by start (the longest piece first).
 */
export function lattice(word: string, v: Vocab, skip?: string): Arc[] {
  const w = [...word];
  const lp = new Map(v.pieces.filter((p) => p.t !== skip).map((p) => [p.t, p.logp]));
  const unk = unkLogp(v);
  const arcs: Arc[] = [];
  for (let j = 1; j <= w.length; j++)
    for (let i = 0; i < j; i++) {
      const t = w.slice(i, j).join('');
      const l = lp.get(t);
      if (l !== undefined) arcs.push({ from: i, to: j, t, logp: l, unk: false });
      else if (j === i + 1 && !v.pieces.some((p) => p.t === t))
        arcs.push({ from: i, to: j, t: UNK, logp: unk, unk: true });
    }
  return arcs;
}

export interface Best {
  /** best[j]: the highest log-probability of a split of the first j letters (−∞: none). */
  best: number[];
  /** The arc each best[j] came in on (index into `arcs`), or −1. */
  back: number[];
  arcs: Arc[];
  /** The best split, left to right. */
  split: Arc[];
  score: number;
}

/** Viterbi: best[j] = max over arcs into j of best[from] + log p, the first of equals kept. */
export function viterbi(word: string, v: Vocab, skip?: string): Best {
  const n = [...word].length;
  const arcs = lattice(word, v, skip);
  const best = [0, ...Array<number>(n).fill(-Infinity)];
  const back = Array<number>(n + 1).fill(-1);
  arcs.forEach((a, k) => {
    if (best[a.from] === -Infinity) return;
    const s = best[a.from]! + a.logp;
    if (s > best[a.to]! + EPS) {
      best[a.to] = s;
      back[a.to] = k;
    }
  });
  const split: Arc[] = [];
  for (let j = n; j > 0 && back[j]! >= 0; j = arcs[back[j]!]!.from) split.unshift(arcs[back[j]!]!);
  return { best, back, arcs, split, score: best[n]! };
}

/** log(e^a + e^b + ...) without overflow. */
export function logSumExp(xs: readonly number[]): number {
  const m = Math.max(...xs);
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

export interface Forward {
  /** A[j] = log Σ over splits of the first j letters of P(split)^α. */
  a: number[];
  arcs: Arc[];
}

/** The forward algorithm: Viterbi with the max replaced by a sum (in logs), pieces to the α. */
export function forward(word: string, v: Vocab, alpha: number): Forward {
  const n = [...word].length;
  const arcs = lattice(word, v);
  const a = [0];
  for (let j = 1; j <= n; j++)
    a.push(logSumExp(arcs.filter((x) => x.to === j).map((x) => a[x.from]! + alpha * x.logp)));
  return { a, arcs };
}

/** One draw of the backward walk: the arcs into `to`, their chances, and the one u picked. */
export interface Draw {
  to: number;
  /** Indices into `arcs`, longest piece first. */
  options: number[];
  chance: number[];
  u: number;
  /** Position in `options` of the arc taken. */
  at: number;
}

/**
 * Sample a split with probability P(split)^α / Σ P^α (forward-filtering, backward-sampling):
 * from the end, take an arc into j with chance e^(A[from] + α·log p − A[j]); one u per draw.
 */
export function sampleSplit(
  word: string,
  v: Vocab,
  alpha: number,
  next: () => number,
): { fwd: Forward; draws: Draw[]; split: Arc[]; score: number } {
  const fwd = forward(word, v, alpha);
  const draws: Draw[] = [];
  const split: Arc[] = [];
  for (let j = [...word].length; j > 0;) {
    const options = fwd.arcs.flatMap((x, k) => (x.to === j ? [k] : []));
    const chance = options.map((k) => {
      const x = fwd.arcs[k]!;
      return Math.exp(fwd.a[x.from]! + alpha * x.logp - fwd.a[j]!);
    });
    const u = next();
    let at = -1;
    let cum = 0;
    chance.forEach((c, i) => {
      cum += c;
      if (at < 0 && u < cum) at = i;
    });
    if (at < 0) at = chance.length - 1;
    draws.push({ to: j, options, chance, u, at });
    const arc = fwd.arcs[options[at]!]!;
    split.unshift(arc);
    j = arc.from;
  }
  let score = 0;
  for (const x of split) score += x.logp;
  return { fwd, draws, split, score };
}

/** L(V): minus the log-likelihood of the text under the best splits. */
export function corpusLoss(words: readonly WordCount[], v: Vocab, skip?: string): number {
  let l = 0;
  for (const { word, count } of words) l -= count * viterbi(word, v, skip).score;
  return l;
}

/** What removing a piece does to one word. */
export interface Resplit {
  row: number;
  before: string[];
  after: string[];
  /** count · (best before − best after) ≥ 0. */
  cost: number;
}

export interface PieceLoss {
  t: string;
  rank: number;
  count: number;
  logp: number;
  loss: number;
  /** The words whose best split changes. */
  resplits: Resplit[];
}

/** The loss of every piece of two or more letters, in vocabulary order; probabilities fixed. */
export function pieceLosses(words: readonly WordCount[], v: Vocab): PieceLoss[] {
  const now = words.map(({ word }) => viterbi(word, v));
  return v.pieces
    .filter((p) => !isLetter(p))
    .map((p) => {
      let loss = 0;
      const resplits: Resplit[] = [];
      words.forEach(({ word, count }, row) => {
        const b = now[row]!;
        if (!b.split.some((x) => x.t === p.t)) return;
        const a = viterbi(word, v, p.t);
        const cost = count * (b.score - a.score);
        loss += cost;
        resplits.push({
          row,
          before: b.split.map((x) => x.t),
          after: a.split.map((x) => x.t),
          cost,
        });
      });
      return { t: p.t, rank: p.rank, count: p.count, logp: p.logp, loss, resplits };
    });
}

/** a costs less than b: a smaller loss, or (within EPS) the later piece in the seed order. */
export const cheaper = (a: PieceLoss, b: PieceLoss): boolean =>
  a.loss < b.loss - EPS || (Math.abs(a.loss - b.loss) <= EPS && a.rank > b.rank);

/** The losses cheapest first, by picking the cheapest left each time (as the code tabs do). */
export function cheapestFirst(losses: readonly PieceLoss[]): PieceLoss[] {
  const left = [...losses];
  const out: PieceLoss[] = [];
  while (left.length) {
    let k = 0;
    for (let i = 1; i < left.length; i++) if (cheaper(left[i]!, left[k]!)) k = i;
    out.push(left.splice(k, 1)[0]!);
  }
  return out;
}

/** How many pieces one round removes from n: all but the best 80%, at least one. */
export const toRemove = (n: number, floor = 0): number =>
  Math.max(0, Math.min(n - Math.floor(n * KEEP), n - floor));

export interface Round {
  losses: PieceLoss[];
  /** Cheapest first. */
  order: PieceLoss[];
  removed: string[];
  before: Vocab;
  after: Vocab;
}

/** One pruning round: the losses, the cheapest removed, probabilities from the counts left. */
export function pruneRound(words: readonly WordCount[], v: Vocab, floor = 0): Round {
  const losses = pieceLosses(words, v);
  const order = cheapestFirst(losses);
  const removed = order.slice(0, toRemove(losses.length, floor)).map((l) => l.t);
  const gone = new Set(removed);
  const after = withProbabilities(v.pieces.filter((p) => !gone.has(p.t)));
  return { losses, order, removed, before: v, after };
}

/** The number of different splits of a word: the lattice's paths, counted left to right. */
export function countSplits(word: string, v: Vocab): number {
  const arcs = lattice(word, v);
  const ways = [1, ...Array<number>([...word].length).fill(0)];
  for (const a of arcs) ways[a.to]! += ways[a.from]!;
  return ways.at(-1)!;
}
