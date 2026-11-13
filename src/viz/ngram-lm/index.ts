import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { CORPUS } from '../_lm/corpus';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/ngram.hpp?raw';
import javaSource from './code/java/NgramModel.java?raw';
import pythonSource from './code/python/ngram.py?raw';
import afterThe from './examples/after-the.json';
import countBigrams from './examples/count-bigrams.json';
import generate from './examples/generate.json';
import laplace from './examples/laplace.json';
import newSentence from './examples/new-sentence.json';
import noMemory from './examples/no-memory.json';
import seenSentence from './examples/seen-sentence.json';
import trigrams from './examples/trigrams.json';
import zero from './examples/zero.json';
import explain from './explain.md?raw';
import {
  countsFor,
  defaults,
  describe,
  dist,
  init,
  initialSay,
  initialVars,
  kOf,
  ops,
  orderOf,
  parseWords,
  pseudocode,
  type LmExtra,
  type LmSettings,
  type LmState,
} from './model';
import { ngramPractice } from './practice';
import { view } from './view';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** New sentences whose every pair of words is in the corpus, though the sentence is not. */
export const NEW_SENTENCES = [
  'the dog sat on the mat',
  'the cat sat on the rug',
  'the bird saw the dog',
  'the fox ran under the tree',
  'a dog saw the cat',
  'the cat chased the dog',
];

/** Sentences with a pair of words the corpus never has. */
export const ODD_SENTENCES = [
  'the cat ate the mat',
  'the mat sat on the cat',
  'a fox slept under the box',
  'the dog is running',
];

const preset = (label: string, make: (rng: Rng) => OpCall[]): Preset => ({
  label,
  make: (rng) => make(rng),
});

export const ngramLm: VizDef<LmState, LmSettings, LmExtra> = {
  id: 'ngram-lm',
  title: 'N-gram language model',
  family: 'Language models and decoding',
  blurb:
    'Count which words follow which in a small corpus, turn the counts into probabilities, write sentences by drawing from them, and measure surprise with perplexity.',
  settings: [
    {
      kind: 'choice',
      key: 'n',
      label: 'n',
      options: [
        { value: '2', label: 'Bigrams: one word of context' },
        { value: '3', label: 'Trigrams: two words of context' },
      ],
      help: 'SLP3 starts with bigrams. Trigrams remember more, but see each context fewer times.',
    },
    {
      kind: 'choice',
      key: 'smoothing',
      label: 'Smoothing',
      options: [
        { value: 'none', label: 'None: an n-gram never seen gets probability 0' },
        { value: 'laplace', label: 'Add-one (Laplace): add 1 to every count' },
        { value: 'add-k', label: 'Add-k with k = 0.1' },
      ],
      help: 'Adding to every count gives unseen n-grams a little probability, taken from the seen ones.',
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
      label: 'Words',
      placeholder: 'e.g. the cat sat',
      maxLength: 80,
      sample: 'the cat sat on the mat',
      parse: (text) => {
        const words = parseWords(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'next', label: 'Next word', usesInput: true, primary: true },
      { op: 'score', label: 'Perplexity', usesInput: true },
      { op: 'generate', label: 'Generate', usesInput: false },
      { op: 'count', label: 'Count the corpus', usesInput: false },
      { op: 'counts', label: 'Counts only', usesInput: true, more: true },
    ],
    random: {
      label: 'Random sentence',
      make: (rng) => [['score', pick(rng, [...CORPUS, ...NEW_SENTENCES, ...ODD_SENTENCES])]],
    },
    presets: [
      preset('A sentence from the corpus', (rng) => [['score', pick(rng, CORPUS)]]),
      preset('A new sentence made of seen pairs', (rng) => [['score', pick(rng, NEW_SENTENCES)]]),
      preset('A sentence with an unseen pair', (rng) => [['score', pick(rng, ODD_SENTENCES)]]),
      preset('Word salad (the corpus words shuffled)', (rng) => {
        const words = pick(rng, CORPUS).split(' ');
        for (let i = words.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          [words[i], words[j]] = [words[j]!, words[i]!];
        }
        return [['score', words.join(' ')]];
      }),
      preset('Generate a sentence', () => [['generate']]),
      preset('What follows a common word', (rng) => [
        ['next', pick(rng, ['the', 'a', 'sat', 'dog', 'cat'])],
      ]),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Count the corpus (train)',
      best: {
        cost: 'Θ(N)',
        why: 'One hash-table update per token of the corpus.',
        example: 'count-bigrams',
      },
      average: {
        cost: 'Θ(N)',
        why: 'Each n-gram is looked up and incremented once.',
        example: 'count-bigrams',
      },
      worst: {
        cost: 'Θ(N)',
        why: 'Trigrams cost the same per token; they just make more keys.',
        example: 'trigrams',
      },
    },
    {
      op: 'P(w | context)',
      best: {
        cost: 'Θ(1)',
        why: 'Two hash lookups: C(context w) and C(context).',
        example: 'after-the',
      },
      average: {
        cost: 'Θ(1)',
        why: 'Keep each context’s total beside its counts.',
        example: 'after-the',
      },
      worst: { cost: 'Θ(1)', why: 'Smoothing only adds k and k·V.', example: 'laplace' },
    },
    {
      op: 'The next-word distribution',
      best: {
        cost: 'Θ(seen)',
        why: 'Without smoothing only the words seen after the context count.',
        example: 'after-the',
      },
      average: {
        cost: 'Θ(V)',
        why: 'With smoothing every word of the vocabulary gets a share.',
        example: 'laplace',
      },
      worst: { cost: 'Θ(V)', why: 'V is the whole vocabulary, 30 here.', example: 'laplace' },
    },
    {
      op: 'Generate a sentence of L words',
      best: { cost: 'Θ(L)', why: 'u lands in the first word every time.', example: 'generate' },
      average: {
        cost: 'Θ(L · V)',
        why: 'Walk the distribution until the total passes u, for each word.',
        example: 'generate',
      },
      worst: {
        cost: 'Θ(L · V)',
        why: 'Prefix sums and binary search cut each draw to Θ(log V).',
        example: 'generate',
      },
    },
    {
      op: 'Perplexity of N tokens',
      best: {
        cost: 'Θ(N)',
        why: 'One probability and one log per token.',
        example: 'seen-sentence',
      },
      average: {
        cost: 'Θ(N)',
        why: 'Add the logs, then one exp at the end.',
        example: 'new-sentence',
      },
      worst: { cost: 'Θ(N)', why: 'A zero ends it early: the answer is ∞.', example: 'zero' },
    },
    {
      op: 'Memory for the counts',
      best: {
        cost: 'Θ(distinct n-grams)',
        why: 'Only n-grams that occur are stored.',
        example: 'count-bigrams',
      },
      average: {
        cost: 'Θ(distinct n-grams)',
        why: 'Never more than N, the tokens counted.',
        example: 'count-bigrams',
      },
      worst: {
        cost: 'Θ(min(N, Vⁿ))',
        why: 'A table of every possible n-gram would be Vⁿ, mostly zeros.',
        example: 'trigrams',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    countBigrams,
    afterThe,
    generate,
    seenSentence,
    newSentence,
    zero,
    laplace,
    trigrams,
    noMemory,
  ] as unknown as SavedExample[],
  practice: ngramPractice(() => ngramLm),
  preview: { example: 'count-bigrams', level: 2, hide: ['s-', 'sp-'] },
  opening: 'after-the',
};

const fmtK = (k: number) => String(k);

/**
 * Driver protocol for the code tabs. "model n k" starts a model and "train <words>" adds a
 * sentence (no output). "count" prints the n-grams counted and how many differ; "counts <context>"
 * the words seen after it with their counts ("none" if none); "next <context>" every word with
 * a probability above 0, most likely first; "generate u1 … u10" the words drawn, with </s> when
 * it came; "score <words>" the perplexity to three decimals, or inf.
 */
function codeScript(calls: OpCall[], settings: LmSettings) {
  const n = orderOf(settings);
  const k = kOf(settings);
  const c = countsFor(n);
  const t = new Timeline(ngramLm, settings, 1, calls);
  const input: string[] = [`model ${n} ${fmtK(k)}`, ...CORPUS.map((s) => `train ${s}`)];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const v = e.end.view;
    const op = e.call[0];
    // A refused input leaves the state as it was.
    const refused = e.end === prev;
    prev = e.end;
    if (refused) continue;
    if (op === 'count') {
      input.push('count');
      expected.push(`${c.tokens} ${c.ngrams.length}`);
    } else if (op === 'counts' && v.kind === 'counts') {
      const d = dist(c, v.context, k);
      input.push(`counts ${v.context.join(' ')}`);
      expected.push(d.seen.length ? d.seen.map((r) => `${r.word} ${r.count}`).join(' ') : 'none');
    } else if (op === 'next' && v.kind === 'next') {
      const d = dist(c, v.context, k);
      input.push(`next ${v.context.join(' ')}`);
      expected.push(
        d.order.length ? d.order.map((w, i) => `${w} ${round3(d.p[i]!)}`).join(' ') : 'none',
      );
    } else if (op === 'generate' && v.kind === 'generate') {
      input.push(`generate ${v.us.join(' ')}`);
      expected.push([...v.words, ...(v.ended ? ['</s>'] : [])].join(' '));
    } else if (op === 'score' && v.kind === 'score') {
      input.push(`score ${v.words.join(' ')}`);
      expected.push(Number.isFinite(v.pp) ? round3(v.pp) : 'inf');
    }
  }
  return { input, expected };
}

export default ngramLm;
