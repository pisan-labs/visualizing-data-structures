import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { corpusWords } from '../_lm/corpus';
import {
  bpePick,
  defaults,
  encodeWord,
  learn,
  loadState,
  pairName,
  rankPairs,
  score3,
  scorePairs,
  UNK,
  vocabulary,
  type WpExtra,
  type WpSettings,
  type WpState,
} from './model';

type Def = VizDef<WpState, WpSettings, WpExtra>;

const WORDS = [...new Set(corpusWords())];
/** Words to encode: the corpus's own, new ones made of its letters, and a few with odd letters. */
const POOL = [
  ...WORDS,
  ...'cats dogs mats rats hat bat sit tin bits tab dots rods sand band talks walks birds trees tan nod cot rot tar dab'.split(
    ' ',
  ),
  ...'rabbit jump zoo yes very quiz web cab tub ox'.split(' '),
];

function smallText(rng: Rng): string {
  const pool = [...WORDS];
  return Array.from({ length: rng.int(4, 6) }, () => {
    const w = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const c = rng.int(1, 6);
    return c > 1 ? `${w}*${c}` : w;
  }).join(' ');
}

function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * Practice for WordPiece with the default settings. The picture shows the training words and
 * the vocabulary after training on a small text; the questions ask about encoding and the next
 * merge. Every answer comes from running the model.
 */
export function wordpiecePractice(_def: () => Def): PracticeKind[] {
  const trained = (rng: Rng, merges: number) => {
    const text = smallText(rng);
    const settings = { ...defaults, merges };
    const s = learn(loadState(text) as WpState, merges);
    const ops: OpCall[] = [['load', text], ['train']];
    return { text, settings, s, ops };
  };

  return [
    {
      id: 'pieces',
      title: 'The pieces of a word',
      make(rng) {
        for (;;) {
          const { settings, s, ops } = trained(rng, rng.int(4, 8));
          const fresh = POOL.filter((w) => !s.rows.some((r) => r.word === w));
          const ok = fresh.filter((w) => {
            const p = encodeWord(s, settings, w);
            return p[0] !== UNK && p.length > 1 && p.length < w.length;
          });
          if (ok.length === 0) continue;
          const w = pick(rng, ok);
          const pieces = encodeWord(s, settings, w);
          return {
            prompt: `WordPiece built the vocabulary shown. Split **${w}** the way BERT does: from the start, take the longest piece in the vocabulary, then continue with ## pieces. Type the pieces separated by spaces, ## included.`,
            setup: ops,
            settings,
            answer: { kind: 'sequence', value: pieces },
            explain: `Longest match first: ${pieces.map((p, i) => (i === 0 ? `${p} is the longest piece that starts ${w}` : `${p} the longest ## piece after that`)).join('; ')}.`,
            watch: [['encode', w]],
          };
        }
      },
    },
    {
      id: 'unk',
      title: 'Which word becomes [UNK]?',
      make(rng) {
        for (;;) {
          const { settings, s, ops } = trained(rng, rng.int(3, 8));
          const fresh = POOL.filter((w) => !s.rows.some((r) => r.word === w));
          const bad = fresh.filter((w) => encodeWord(s, settings, w)[0] === UNK);
          const good = fresh.filter((w) => encodeWord(s, settings, w)[0] !== UNK);
          if (bad.length === 0 || good.length < 3) continue;
          const u = pick(rng, bad);
          const options = shuffled(rng, [u, ...shuffled(rng, good).slice(0, 3)]);
          const chars = [...u];
          const vocab = new Set(vocabulary(s));
          const missing = !vocab.has(chars[0]!)
            ? `no piece starts with ${chars[0]}`
            : `the vocabulary has no ##${chars.find((c, i) => i > 0 && !vocab.has(`##${c}`))} piece, so nothing can follow inside the word`;
          return {
            prompt: `WordPiece built the vocabulary shown. Which of these words becomes ${UNK}?`,
            setup: ops,
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(u) },
            explain: `In ${u}, ${missing}, and one missing piece makes the whole word ${UNK}. The others split into pieces: ${options
              .filter((w) => w !== u)
              .map((w) => `${w} → ${encodeWord(s, settings, w).join(' ')}`)
              .join('; ')}.`,
            watch: [['encode', u]],
          };
        }
      },
    },
    {
      id: 'next-merge',
      title: 'Score, not count',
      make(rng) {
        for (;;) {
          const { settings, s, ops } = trained(rng, rng.int(1, 4));
          if (s.merges.length < settings.merges) continue;
          const pairs = scorePairs(s.rows);
          const ranked = rankPairs(pairs);
          const best = ranked[0];
          const bpe = bpePick(pairs);
          if (!best || !bpe || bpe === best || ranked.length < 4) continue;
          if (ranked[1]!.score === best.score) continue;
          const others = ranked.filter((p) => p !== best && p !== bpe).slice(0, 2);
          const options = shuffled(rng, [best, bpe, ...others]);
          const f = (p: typeof best) => `${p.count} / (${p.ca} × ${p.cb}) = ${score3(p.score)}`;
          return {
            prompt: `WordPiece has learned ${s.merges.length} merge${s.merges.length === 1 ? '' : 's'} from these words. Which pair does it merge next? It scores a pair by count(ab) / (count(a) · count(b)), each word counted as often as it occurs.`,
            setup: ops,
            settings,
            answer: {
              kind: 'choice',
              options: options.map(pairName),
              correct: options.indexOf(best),
            },
            explain: `${pairName(best)} scores ${f(best)}, the best. ${pairName(bpe)} is the most frequent pair, the one BPE would take, but scores only ${f(bpe)}: its halves are common on their own.`,
            watch: [['merge']],
          };
        }
      },
    },
    {
      id: 'score',
      title: 'Score a pair',
      make(rng) {
        for (;;) {
          const { settings, s, ops } = trained(rng, rng.int(0, 3) || 1);
          const pairs = rankPairs(scorePairs(s.rows));
          if (pairs.length < 2) continue;
          const p = pick(rng, pairs.slice(0, 6));
          return {
            prompt: `What score does WordPiece give the pair **${pairName(p)}**? count(ab) / (count(a) · count(b)), each word counted as often as it occurs. Three decimals.`,
            setup: ops,
            settings,
            answer: { kind: 'number', value: p.score, tolerance: 0.0005 },
            explain: `${pairName(p)} occurs ${p.count} time${p.count === 1 ? '' : 's'}, ${p.a} ${p.ca} and ${p.b} ${p.cb}: ${p.count} / (${p.ca} × ${p.cb}) = ${score3(p.score).replace(/^\./, '0.')}.`,
            watch: [['merge']],
          };
        }
      },
    },
  ];
}
