import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/word2vec.hpp?raw';
import javaSource from './code/java/Word2Vec.java?raw';
import pythonSource from './code/python/word2vec.py?raw';
import bigSteps from './examples/big-steps.json';
import noNegatives from './examples/no-negatives.json';
import onePair from './examples/one-pair.json';
import oneSentence from './examples/one-sentence.json';
import onePass from './examples/one-pass.json';
import oneWord from './examples/one-word.json';
import twentyPasses from './examples/twenty-passes.json';
import wideWindow from './examples/wide-window.json';
import windowOne from './examples/window-one.json';
import explain from './explain.md?raw';
import {
  COUNTS,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  LEARNING_RATES,
  MAX_NEGATIVES,
  MAX_WINDOW,
  MAX_WORDS,
  ops,
  parseSentence,
  pseudocode,
  SENTENCES,
  VOCAB,
  windowPairs,
  type PairRec,
  type W2vExtra,
  type W2vSettings,
  type W2vState,
} from './model';
import { word2vecPractice } from './practice';
import { view } from './view';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** A sentence of `size` words (1 to 8) from the eight corpus words, in a sensible order. */
export function randomSentence(rng: Rng, size: number): string {
  const words = [
    'the',
    pick(rng, ['cat', 'dog']),
    pick(rng, ['sat', 'saw']),
    'on',
    'the',
    pick(rng, ['mat', 'rug']),
    'the',
    pick(rng, ['cat', 'dog']),
  ];
  const n = Math.max(1, Math.min(MAX_WORDS, size));
  return n === 1 ? words[1]! : words.slice(0, n).join(' ');
}

const train = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size) => [['train', make(rng, size)]],
});

export const word2vec: VizDef<W2vState, W2vSettings, W2vExtra> = {
  id: 'word2vec',
  title: 'word2vec (skip-gram)',
  family: 'Training',
  blurb:
    'Words that keep the same company end up close: a window slides over each sentence, every pair of neighbours pulls its vectors together, and a few random noise words are pushed away.',
  settings: [
    {
      kind: 'number',
      key: 'window',
      label: 'Window (words on each side)',
      min: 1,
      max: MAX_WINDOW,
      help: 'Mikolov et al. used windows of about 5. A wider window makes more pairs, and pairs further apart.',
    },
    {
      kind: 'number',
      key: 'negatives',
      label: 'Noise words per pair (k)',
      min: 0,
      max: MAX_NEGATIVES,
      help: 'The paper suggests 5 to 20 for small corpora and 2 to 5 for large ones. With 0, nothing pushes the vectors apart.',
    },
    {
      kind: 'choice',
      key: 'lr',
      label: 'Learning rate η',
      options: LEARNING_RATES.map((v) => ({ value: v, label: v })),
      help: 'How far each update moves a vector. Large steps learn fast and jitter.',
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
      label: 'Sentence',
      placeholder: 'e.g. the cat sat on the mat',
      maxLength: 60,
      sample: 'cat sat',
      parse: (text) => {
        const words = parseSentence(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'train', label: 'Train', usesInput: true, primary: true },
      { op: 'pairs', label: 'Pairs only', usesInput: true },
      { op: 'epoch', label: 'One pass', usesInput: false },
      { op: 'run', label: 'Train 10 passes', usesInput: false },
      { op: 'pair', label: 'Update one pair (center context)', usesInput: true, more: true },
      { op: 'reset', label: 'New random vectors', usesInput: false, more: true },
    ],
    random: {
      label: 'Random sentence',
      make: (rng) => [['train', randomSentence(rng, rng.int(3, MAX_WORDS))]],
    },
    presets: [
      train('A corpus sentence', (rng) => pick(rng, SENTENCES)),
      train('Random words', randomSentence),
      train('Two words: one pair each way', (rng) =>
        `${pick(rng, ['cat', 'dog'])} ${pick(rng, ['sat', 'saw'])}`,
      ),
      train('One word: no pairs', (rng) => pick(rng, VOCAB)),
      train('A word used twice', (rng) => `the ${pick(rng, ['cat', 'dog'])} saw the ${pick(rng, ['cat', 'dog'])}`),
      { label: 'The whole corpus, ten passes', make: () => [['run']] },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'Pairs from a sentence of n words, window L',
      best: {
        cost: 'Θ(n)',
        why: 'L = 1: about 2 pairs per word.',
        example: 'window-one',
      },
      average: {
        cost: 'Θ(n · L)',
        why: 'Each word pairs with up to 2L neighbours; the ends get fewer.',
        example: 'one-sentence',
      },
      worst: {
        cost: 'Θ(n · L)',
        why: 'With L ≥ n − 1 every word pairs with every other: n(n − 1).',
        example: 'wide-window',
      },
    },
    {
      op: 'One update, k noise words, d dimensions',
      best: {
        cost: 'Θ(d)',
        why: 'k = 0: one dot product and two moves. But nothing pushes apart.',
        example: 'no-negatives',
      },
      average: {
        cost: 'Θ(k · d)',
        why: 'k + 1 dot products, k + 1 context vectors and the word vector move.',
        example: 'one-pair',
      },
      worst: {
        cost: 'Θ(k · d)',
        why: 'Still linear in k: this is the point of negative sampling.',
        example: 'one-pair',
      },
      note: 'A full softmax over the vocabulary would cost Θ(V · d) per pair: millions of words instead of k + 1.',
    },
    {
      op: 'One pass over a corpus of T words',
      best: { cost: 'Θ(T · L · k · d)', why: 'Every pair gets one update.', example: 'one-pass' },
      average: {
        cost: 'Θ(T · L · k · d)',
        why: 'The same, whatever the words are.',
        example: 'one-pass',
      },
      worst: {
        cost: 'Θ(T · L · k · d)',
        why: 'Linear in the corpus: why word2vec could train on billions of words.',
        example: 'twenty-passes',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as W2vSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    oneSentence,
    onePair,
    windowOne,
    wideWindow,
    onePass,
    twentyPasses,
    noNegatives,
    bigSteps,
    oneWord,
  ] as unknown as SavedExample[],
  practice: word2vecPractice(() => word2vec),
  preview: { example: 'twenty-passes', level: 2, hide: ['s-', 'dot-', 'sig-', 'coef-', 'cap-', 'lg-', 'w-', 'g-t'] },
  opening: 'one-sentence',
};

const vecLine = (v: readonly number[]) => v.map(round3).join(' ');

/** What the drivers print for one update. */
export const updateLine = (r: PairRec, end: W2vState): string =>
  `${r.negs.length ? r.negs.map((n) => VOCAB[n]).join(' ') : '-'} | ${r.sigs.map(round3).join(' ')} | ${vecLine(end.w[r.center]!)} | ${vecLine(end.c[r.context]!)}`;

/**
 * Driver protocol for the code tabs. "count <word> <n>" adds a word and its count, in order;
 * "noise" prints the noise distribution, three decimals each. "w <word> <x> <y>" and "c ..."
 * set a word's vectors; neither prints. "pairs <L> <words>" prints the pairs as center:context.
 * "update <η> <k> <center> <context> <u...>" draws k noise words with the u's (drawing again
 * when a word is one of the pair's or drawn already), updates, and prints the noise words, the
 * σ's before, the new w of the center and the new c of the context.
 */
function codeScript(calls: OpCall[], settings: W2vSettings) {
  const t = new Timeline(word2vec, settings, 1, calls);
  const input = VOCAB.map((w, i) => `count ${w} ${COUNTS[i]}`);
  input.push('noise');
  const expected = [
    noiseLine(),
  ];
  const setAll = (s: W2vState) =>
    VOCAB.flatMap((w, i) => [`w ${w} ${s.w[i]![0]} ${s.w[i]![1]}`, `c ${w} ${s.c[i]![0]} ${s.c[i]![1]}`]);
  input.push(...setAll(t.initial.state));
  for (const e of t.entries) {
    const last = e.steps.at(-1)!;
    if (e.call[0] === 'reset') {
      input.push(...setAll(e.end));
      continue;
    }
    if (e.call[0] === 'pairs') {
      const words = parseSentence(String(e.call[1]));
      if (words instanceof Error) continue;
      input.push(`pairs ${settings.window} ${words.join(' ')}`);
      const ps = windowPairs(words.length, settings.window);
      expected.push(ps.length ? ps.map(([i, j]) => `${words[i]}:${words[j]}`).join(' ') : '-');
      continue;
    }
    for (const r of last.extra?.log ?? []) {
      input.push(
        `update ${settings.lr} ${settings.negatives} ${VOCAB[r.center]} ${VOCAB[r.context]} ${r.draws.map((d) => String(d.u)).join(' ')}`.trimEnd(),
      );
      expected.push(updateLine(r, r.states.at(-1)!));
    }
  }
  return { input, expected };
}

/** The noise distribution as the drivers print it. */
export function noiseLine(): string {
  let total = 0;
  const ws = COUNTS.map((c) => Math.pow(c, 0.75));
  for (const x of ws) total += x;
  return ws.map((x) => round3(x / total)).join(' ');
}

export default word2vec;
