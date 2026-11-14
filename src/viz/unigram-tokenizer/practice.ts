import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { CORPUS_TEXT } from '../_tokenize/text';
import { defaults, type UniExtra, type UniSettings, type UniState } from './model';
import { cheapestFirst, countSplits, isLetter, pieceLosses, viterbi, type Vocab } from './unigram';

type Def = VizDef<UniState, UniSettings, UniExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Small training texts whose words share pieces, each word one to six times. */
const POOLS = [
  ['low', 'lower', 'lowest', 'newer', 'new', 'wider', 'wide'],
  ['walk', 'walked', 'walking', 'talk', 'talked', 'talking', 'tall'],
  ['cat', 'cats', 'sat', 'mat', 'mats', 'hat', 'chat'],
  ['run', 'runs', 'running', 'sun', 'sunny', 'fun', 'funny'],
  ['play', 'played', 'player', 'say', 'said', 'day', 'days'],
];

function smallText(rng: Rng): string {
  const pool = [...pick(rng, POOLS)];
  const n = rng.int(4, 6);
  return Array.from({ length: n }, () => {
    const w = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const c = rng.int(1, 6);
    return c > 1 ? `${w}*${c}` : w;
  }).join(' ');
}

/** Words to encode: new combinations of the pools' pieces, and corpus words. */
const PROBES = [
  'lowered',
  'newest',
  'widest',
  'talks',
  'walker',
  'chats',
  'hats',
  'suns',
  'runner',
  'plays',
  'days',
  'talked',
  'walking',
  'cats',
  'chased',
  'running',
];

/** The best split must win by a clear margin, so the answer does not hang on rounding. */
function clearBest(word: string, v: Vocab): boolean {
  const b = viterbi(word, v);
  // The best split without its longest piece (if it has one): the runner-up through another path.
  const longest = [...b.split].sort((x, y) => y.t.length - x.t.length)[0]!;
  if (longest.t.length < 2) return true;
  return b.score - viterbi(word, v, longest.t).score > 0.05;
}

/**
 * Practice on small texts (and the toy corpus) with the default settings: the best split of a
 * word, its log-probability, how many splits the lattice holds, and which piece a pruning round
 * removes first. The picture is the vocabulary after Load; the answers come from the model.
 */
export function unigramPractice(def: () => Def): PracticeKind[] {
  const loaded = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops).endState();

  function setup(rng: Rng, corpus = false) {
    for (;;) {
      const text = corpus ? CORPUS_TEXT : smallText(rng);
      const ops: OpCall[] = [['load', text]];
      const s = loaded(ops);
      if (s.vocab.pieces.filter((p) => !isLetter(p)).length < 3) continue;
      const known = new Set(s.vocab.pieces.map((p) => p.t));
      const word = pick(
        rng,
        PROBES.filter((w) => [...w].every((c) => known.has(c)) && w.length <= 8),
      );
      if (!word || !clearBest(word, s.vocab)) continue;
      return { ops, s, word };
    }
  }

  return [
    {
      id: 'best-split',
      title: 'The best split',
      make(rng) {
        const { ops, s, word } = setup(rng, rng.int(0, 2) === 0);
        const b = viterbi(word, s.vocab);
        const pieces = b.split.map((a) => a.t);
        return {
          prompt: `With this vocabulary, what is the most probable split of **${word}**? Type its pieces in order, separated by spaces.`,
          setup: ops,
          answer: { kind: 'sequence', value: pieces },
          explain: `Viterbi keeps, for each position, the best total log-probability of the letters before it. ${pieces.join(' + ')} adds up to ${two(b.score)}, more than any other path through the lattice. Fewer, longer pieces usually win: each extra piece multiplies in another probability below 1.`,
          watch: [['encode', word]],
        };
      },
    },
    {
      id: 'score',
      title: 'The score of the best split',
      make(rng) {
        const { ops, s, word } = setup(rng, rng.int(0, 2) === 0);
        const b = viterbi(word, s.vocab);
        const terms = b.split.map((a) => `${a.t} ${two(a.logp)}`).join(', ');
        return {
          prompt: `The best split of **${word}** is ${b.split.map((a) => a.t).join(' ')}. What is its log-probability, the sum of the pieces' log p? Two decimals.`,
          setup: ops,
          answer: { kind: 'number', value: b.score, tolerance: 0.005 },
          explain: `Add the log-probabilities from the vocabulary: ${terms}. The total is ${two(b.score)}; P = e^${two(b.score)}.`,
          watch: [['encode', word]],
        };
      },
    },
    {
      id: 'splits',
      title: 'How many splits?',
      make(rng) {
        const { ops, s, word } = setup(rng);
        const ways = countSplits(word, s.vocab);
        return {
          prompt: `How many different splits of **${word}** can this vocabulary make? Every letter is a piece, so there is always at least one.`,
          setup: ops,
          answer: { kind: 'number', value: ways },
          explain: `Count the paths through the lattice from left to right: the ways to reach position j add up the ways to reach the start of every piece that ends at j. That gives ${ways}. Viterbi does the same walk with max in place of +, so it never lists them all.`,
          watch: [['encode', word]],
        };
      },
    },
    {
      id: 'cheapest',
      title: 'Which piece costs least?',
      make(rng) {
        for (;;) {
          const ops: OpCall[] = [['load', smallText(rng)]];
          const s = loaded(ops);
          // Pieces some best split uses, so removing them costs something.
          const used = pieceLosses(s.words, s.vocab).filter((l) => l.loss > 0.001);
          if (used.length < 4) continue;
          const shown: typeof used = [];
          const pool = [...used];
          while (shown.length < 4) shown.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
          const order = cheapestFirst(shown);
          // A clear winner, so the answer does not hang on the second decimal.
          if (order[1]!.loss - order[0]!.loss < 0.1) continue;
          const first = order[0]!;
          const why = first.resplits
            .map(
              (r) =>
                `${s.words[r.row]!.word} goes from ${r.before.join(' ')} to ${r.after.join(' ')}`,
            )
            .join('; ');
          return {
            prompt: `A pruning round removes the pieces whose loss is smallest: how much less likely the text becomes without them. Of these four, which costs least to remove?`,
            setup: ops,
            answer: {
              kind: 'choice',
              options: shown.map((l) => l.t),
              correct: shown.indexOf(first),
            },
            explain: `Without ${first.t}, ${why}: a loss of ${two(first.loss)}. ${order
              .slice(1)
              .map((l) => `${l.t} costs ${two(l.loss)}`)
              .join(', ')}.`,
            watch: [['prune']],
          };
        }
      },
    },
  ];
}
