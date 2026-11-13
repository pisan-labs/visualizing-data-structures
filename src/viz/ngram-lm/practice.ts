import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind } from '../../engine/types';
import { CORPUS } from '../_lm/corpus';
import { two } from '../_lm/numbers';
import { countsFor, defaults, dist, padded, prob, type LmSettings } from './model';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Contexts with at least two different words after them. */
function contexts(n: number): string[][] {
  const c = countsFor(n);
  return [...c.table]
    .filter(([, row]) => row.size >= 2)
    .map(([ctx]) => ctx.split(' '))
    .sort((a, b) => (a.join(' ') < b.join(' ') ? -1 : 1));
}

/** Sentences to compare: the corpus, new ones from seen pairs, and odd ones. */
const POOL = [
  ...CORPUS,
  'the dog sat on the mat',
  'the cat sat on the rug',
  'the bird saw the dog',
  'a dog saw the cat',
  'the cat chased the dog',
  'the dog ran under the tree',
  'the cat ate the ball',
  'the mat sat on the cat',
  'the dog is walking',
  'a cat sat on a mat',
];

function perplexity(words: string[], s: LmSettings): number {
  const n = s.n === '3' ? 3 : 2;
  const k = s.smoothing === 'laplace' ? 1 : s.smoothing === 'add-k' ? 0.1 : 0;
  const c = countsFor(n);
  const t = padded(words, n);
  let log = 0;
  for (let i = n - 1; i < t.length; i++) log += Math.log(prob(c, t.slice(i - n + 1, i), t[i]!, k));
  return Math.exp(-log / (t.length - (n - 1)));
}

const ctxText = (ctx: string[]) => ctx.join(' ');

/**
 * Practice for the n-gram model. Counts questions show the counts after a context (Counts only)
 * and ask for probabilities; the others start from the corpus. Every answer comes from the model.
 */
export function ngramPractice(_def?: unknown): PracticeKind[] {
  const V = countsFor(2).vocab.length;
  return [
    {
      id: 'prob',
      title: 'A probability from the counts',
      make(rng) {
        const settings: LmSettings = {
          ...defaults,
          smoothing: pick(rng, ['none', 'laplace'] as const),
        };
        const ctx = pick(rng, contexts(2));
        const d = dist(countsFor(2), ctx, settings.smoothing === 'laplace' ? 1 : 0);
        const seen = d.seen.map((r) => r.word);
        const useUnseen = settings.smoothing === 'laplace' && rng.int(0, 3) === 0;
        const w = useUnseen ? pick(rng, d.unseen) : pick(rng, seen);
        const count = d.seen.find((r) => r.word === w)?.count ?? 0;
        const p = prob(countsFor(2), ctx, w, settings.smoothing === 'laplace' ? 1 : 0);
        const smooth = settings.smoothing === 'laplace';
        return {
          prompt: `The bars show how often each word followed **${ctxText(ctx)}** in the corpus.${smooth ? ` With add-one smoothing, and V = ${V} words that can come next (${V - 1} words and </s>),` : ' With no smoothing,'} what is P(${w} | ${ctxText(ctx)})? Two decimals.`,
          setup: [['counts', ctxText(ctx)]],
          settings,
          answer: { kind: 'number', value: p, tolerance: 0.005 },
          explain: smooth
            ? `(C(${ctxText(ctx)} ${w}) + 1) / (C(${ctxText(ctx)}) + V) = (${count} + 1) / (${d.total} + ${V}) = ${two(p)}.`
            : `C(${ctxText(ctx)} ${w}) / C(${ctxText(ctx)}) = ${count}/${d.total} = ${two(p)}.`,
          watch: [['next', ctxText(ctx)]],
        };
      },
    },
    {
      id: 'unseen',
      title: 'How much does smoothing give away?',
      make(rng) {
        const settings: LmSettings = { ...defaults, smoothing: 'laplace' };
        const ctx = pick(rng, contexts(2));
        const d = dist(countsFor(2), ctx, 1);
        const mass = d.pUnseen * d.unseen.length;
        return {
          prompt: `The bars show how often each word followed **${ctxText(ctx)}**. With add-one smoothing (V = ${V}), how much probability do the words that never followed ${ctxText(ctx)} get **in all**? Two decimals.`,
          setup: [['counts', ctxText(ctx)]],
          settings,
          answer: { kind: 'number', value: mass, tolerance: 0.005 },
          explain: `${d.seen.length} words followed ${ctxText(ctx)}, so ${d.unseen.length} of the ${V} never did. Each gets 1 / (${d.total} + ${V}) = ${two(d.pUnseen)}, and together ${d.unseen.length}/${d.total + V} = ${two(mass)}. Add-one takes that much from the words that were seen.`,
          watch: [['next', ctxText(ctx)]],
        };
      },
    },
    {
      id: 'likely',
      title: 'The most likely next word',
      make(rng) {
        for (;;) {
          const n = rng.int(0, 1) ? 3 : 2;
          const settings: LmSettings = { ...defaults, n: String(n) };
          const ctx = pick(rng, contexts(n)).filter((w) => w !== '<s>');
          if (ctx.length !== n - 1) continue;
          const d = dist(countsFor(n), ctx, 0);
          if (d.seen.length < 2 || d.seen[0]!.count === d.seen[1]!.count) continue;
          const top = d.seen[0]!.word;
          const others = shuffle(
            rng,
            [
              ...new Set([...d.seen.slice(1).map((r) => r.word), 'mat', 'dog', 'ran', '</s>']),
            ].filter((w) => w !== top),
          ).slice(0, 3);
          const options = shuffle(rng, [top, ...others]);
          return {
            prompt: `With ${n === 2 ? 'bigrams' : 'trigrams'} and no smoothing, which word is most likely to come right after **${ctxText(ctx)}**? Read the corpus in the picture and count.`,
            setup: [] as OpCall[],
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(top) },
            explain: `In the corpus ${ctxText(ctx)} is followed by ${d.seen.map((r) => `${r.word} ${r.count} ${r.count === 1 ? 'time' : 'times'}`).join(', ')}. ${top} wins: P = ${d.seen[0]!.count}/${d.total} = ${two(d.seen[0]!.p)}.`,
            watch: [['next', ctxText(ctx)]],
          };
        }
      },
    },
    {
      id: 'perplexity',
      title: 'Which sentence surprises the model less?',
      make(rng) {
        for (;;) {
          const settings: LmSettings = {
            ...defaults,
            smoothing: pick(rng, ['none', 'laplace', 'laplace'] as const),
          };
          const [a, b] = shuffle(rng, POOL);
          const pa = perplexity(a!.split(' '), settings);
          const pb = perplexity(b!.split(' '), settings);
          if (!Number.isFinite(pa) && !Number.isFinite(pb)) continue;
          if (
            Number.isFinite(pa) &&
            Number.isFinite(pb) &&
            Math.abs(pa - pb) / Math.min(pa, pb) < 0.1
          )
            continue;
          const options = [a!, b!];
          const correct = pa < pb ? 0 : 1;
          const show = (x: number) => (Number.isFinite(x) ? two(x) : '∞');
          return {
            prompt: `With bigrams and ${settings.smoothing === 'none' ? 'no smoothing' : 'add-one smoothing'}, which sentence has the lower perplexity?`,
            setup: [] as OpCall[],
            settings,
            answer: { kind: 'choice', options, correct },
            explain: `"${a}" scores ${show(pa)} and "${b}" scores ${show(pb)}. ${!Number.isFinite(pa) || !Number.isFinite(pb) ? 'A pair of words the corpus never has gives probability 0 without smoothing, and perplexity ∞.' : 'Lower perplexity means each word was less of a surprise given the one before it.'}`,
            watch: [
              ['score', a!],
              ['score', b!],
            ],
          };
        }
      },
    },
  ];
}
