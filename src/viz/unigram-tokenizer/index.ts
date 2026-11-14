import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { corpusWords } from '../_lm/corpus';
import { round3 } from '../_lm/numbers';
import { CORPUS_TEXT, parseInput } from '../_tokenize/text';
import cppSource from './code/cpp/unigram.hpp?raw';
import javaSource from './code/java/Unigram.java?raw';
import pythonSource from './code/python/unigram.py?raw';
import lattice from './examples/lattice.json';
import newWords from './examples/new-words.json';
import oneRound from './examples/one-round.json';
import oneLetter from './examples/one-letter.json';
import sampled from './examples/sampled.json';
import flatter from './examples/flatter.json';
import trainCorpus from './examples/train-corpus.json';
import unknownLetter from './examples/unknown-letter.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  multi,
  ops,
  pseudocode,
  readEncodeWord,
  type UniExtra,
  type UniSettings,
  type UniState,
} from './model';
import { unigramPractice } from './practice';
import { pruneRound, seedVocab, viterbi, type Vocab } from './unigram';
import { view } from './view';

/** Words of the toy corpus, each once. */
const CORPUS_WORDS = [...new Set(corpusWords())];

/** `size` different words from the toy corpus, each 1 to 6 times: "cat*3 walked*2 the". */
export function randomText(rng: Rng, size: number): string {
  const pool = [...CORPUS_WORDS];
  const n = Math.max(1, Math.min(size, pool.length));
  return Array.from({ length: n }, () => {
    const w = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const c = rng.int(1, 6);
    return c > 1 ? `${w}*${c}` : w;
  }).join(' ');
}

const trained = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size): OpCall[] => [['load', make(rng, size)], ['train']],
});

export const unigram: VizDef<UniState, UniSettings, UniExtra> = {
  id: 'unigram-tokenizer',
  title: 'Unigram tokenizer (Viterbi split)',
  family: 'Tokenization',
  blurb:
    'Give every piece a probability, find the most probable split of a word by dynamic programming over a lattice, and train by pruning the pieces the text misses least.',
  settings: [
    {
      kind: 'number',
      key: 'seed',
      label: 'Seed pieces of two or more letters',
      min: 6,
      max: 24,
      help: 'Training starts big and prunes. SentencePiece seeds up to a million substrings by default; this one keeps the most frequent few (Load text again after changing it).',
    },
    {
      kind: 'number',
      key: 'target',
      label: 'Train until this many are left',
      min: 2,
      max: 20,
      help: 'Each round removes the cheapest fifth of the longer pieces. Letters always stay.',
    },
    {
      kind: 'choice',
      key: 'split',
      label: 'Encode',
      options: [
        { value: 'best', label: 'The best split (Viterbi)' },
        { value: 'sample', label: 'Sample a split (subword regularization)' },
      ],
      help: 'Kudo (2018) trains translation models on sampled splits, so the model sees many ways to cut the same word.',
    },
    {
      kind: 'choice',
      key: 'alpha',
      label: 'α when sampling',
      options: ['1', '0.5', '0.2'].map((v) => ({ value: v, label: v })),
      help: 'A split is drawn with chance proportional to P(split)^α. α = 1 follows the model; a smaller α flattens it, so unusual splits come up more often.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Word or text',
      placeholder: 'e.g. talked, or a text to learn from',
      maxLength: 400,
      sample: 'the cat is walking',
      parse: parseInput,
    },
    buttons: [
      { op: 'encode', label: 'Encode', usesInput: true, primary: true, bulk: true },
      { op: 'load', label: 'Load text', usesInput: true },
      { op: 'train', label: 'Train', usesInput: false },
      { op: 'prune', label: 'Prune once', usesInput: false },
    ],
    random: {
      label: 'Random text',
      make: (rng) => [['load', randomText(rng, rng.int(4, 10))], ['train']],
    },
    presets: [
      trained('The toy corpus', () => CORPUS_TEXT),
      trained('Random words from the corpus', randomText),
      trained(
        'Shared suffixes (low, lower, newest...)',
        () => 'low*5 lowest*2 newer*6 wider*3 new*2',
      ),
      trained('One word, many times', () => 'banana*4'),
      trained('Words that share nothing', (rng, size) =>
        Array.from({ length: Math.max(2, Math.min(size, 12)) }, () =>
          Array.from(
            { length: rng.int(3, 6) },
            () => 'abcdefghijklmnopqrstuvwxyz'[rng.int(0, 25)],
          ).join(''),
        ).join(' '),
      ),
    ],
    sizes: [5, 10, 20],
  },
  explain,
  complexity: [
    {
      op: 'Viterbi: the best split of n letters',
      best: {
        cost: 'Θ(n)',
        why: 'Only letters are pieces: one arc into each position.',
        example: 'one-letter',
      },
      average: {
        cost: 'Θ(n · m)',
        why: 'Each position tries the pieces that end there, at most m long (the longest piece).',
        example: 'lattice',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'Every substring is a piece, so position j tries j of them.',
        example: 'lattice',
      },
      note: 'Looking the pieces up in a trie as you walk left to right keeps it to the pieces that exist.',
    },
    {
      op: 'Sample a split',
      best: { cost: 'Θ(n)', why: 'One arc into each position.', example: 'one-letter' },
      average: {
        cost: 'Θ(n · m)',
        why: 'The forward sums cost what Viterbi costs; the walk back draws once per piece.',
        example: 'sampled',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'The same lattice, summed instead of maximized.',
        example: 'flatter',
      },
    },
    {
      op: 'One pruning round',
      best: {
        cost: 'Θ(P · W)',
        why: 'No best split uses most pieces, so they cost nothing to price.',
        example: 'one-round',
      },
      average: {
        cost: 'Θ(P · U · n · m)',
        why: 'For each of P pieces, re-split the U words whose best split uses it.',
        example: 'one-round',
      },
      worst: {
        cost: 'Θ(P · W · n²)',
        why: 'Every piece is in every word: all W words are split again for each piece.',
        example: 'train-corpus',
      },
      note: 'SentencePiece prices a piece from the splits it already has, without re-running Viterbi on the whole text.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as UniSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lattice,
    trainCorpus,
    oneRound,
    newWords,
    unknownLetter,
    sampled,
    flatter,
    oneLetter,
  ] as unknown as SavedExample[],
  practice: unigramPractice(() => unigram),
  preview: {
    example: 'lattice',
    level: 2,
    hide: ['v-', 'vocab', 'encs', 'enc-', 'p-', 'wc-', 'words'],
  },
  opening: 'lattice',
};

const textLine = (s: UniState) => `text ${s.words.map((w) => `${w.word} ${w.count}`).join(' ')}`;
const longer = (v: Vocab) =>
  v.pieces
    .filter((p) => p.t.length > 1)
    .map((p) => p.t)
    .join(' ') || '-';

/**
 * Driver protocol for the code tabs. "text <word> <count> ..." sets the training words (no
 * output); "seed <size>" prints the seed's pieces of two or more letters; "encode <word>" prints
 * the best split and its log-probability as "pieces | score"; "prune <floor>" prints the pieces
 * a round removes (or "-"). Train is a seed and prune rounds with the target as the floor.
 * Sampled splits follow the RNG, so the tabs, which show Viterbi, skip them.
 */
function codeScript(calls: OpCall[], settings: UniSettings) {
  const t = new Timeline(unigram, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const seed = (s: UniState) => {
    input.push(textLine(s), `seed ${settings.seed}`);
    expected.push(longer(seedVocab(s.words, settings.seed)));
  };
  seed(t.initial.state);
  let prev = t.initial.state;
  for (const e of t.entries) {
    const [op, arg] = e.call;
    if (op === 'load' && e.end !== prev) seed(e.end);
    else if (op === 'train') {
      seed(e.end);
      let v = seedVocab(e.end.words, settings.seed);
      while (multi(v) > settings.target) {
        const r = pruneRound(e.end.words, v, settings.target);
        if (!r.removed.length) break;
        input.push(`prune ${settings.target}`);
        expected.push(r.removed.join(' '));
        v = r.after;
      }
    } else if (op === 'prune' && e.end !== prev) {
      input.push('prune 0');
      expected.push(e.end.round!.removed.join(' '));
    } else if (op === 'encode' && settings.split === 'best') {
      const word = readEncodeWord(arg);
      if (!(word instanceof Error)) {
        const b = viterbi(word, prev.vocab);
        input.push(`encode ${word}`);
        expected.push(`${b.split.map((a) => a.t).join(' ')} | ${round3(b.score)}`);
      }
    }
    prev = e.end;
  }
  return { input, expected };
}

export default unigram;
