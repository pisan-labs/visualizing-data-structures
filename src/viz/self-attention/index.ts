import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import cppSource from './code/cpp/attention.hpp?raw';
import javaSource from './code/java/Attention.java?raw';
import pythonSource from './code/python/attention.py?raw';
import catSat from './examples/cat-sat.json';
import itDogOrBall from './examples/it-dog-or-ball.json';
import noMask from './examples/no-mask.json';
import noScaling from './examples/no-scaling.json';
import oneWord from './examples/one-word.json';
import randomHead from './examples/random-head.json';
import sameWordTwice from './examples/same-word-twice.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseSentence,
  pseudocode,
  type AttnExtra,
  type AttnResult,
  type AttnSettings,
  type AttnState,
  type Head,
} from './model';
import { attentionPractice } from './practice';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** A sentence of `size` words (1 to 7) from the toy vocabulary: "the cat sat on the mat and". */
export function randomSentence(rng: Rng, size: number): string {
  const words = [
    'the',
    pick(rng, ANIMALS),
    pick(rng, ACTIONS),
    pick(rng, ['on', 'under']),
    'the',
    pick(rng, THINGS),
    'and',
  ];
  const n = Math.max(1, Math.min(7, size));
  return n === 1 ? words[1]! : words.slice(0, n).join(' ');
}

const preset = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size) => [['load', make(rng, size)], ['attend']],
});

export const selfAttention: VizDef<AttnState, AttnSettings, AttnExtra> = {
  id: 'self-attention',
  title: 'Self-attention',
  family: 'Inside the transformer',
  blurb:
    'Every word scores every word it may see, turns the scores into weights with softmax, and takes a weighted blend of their values: the heart of a transformer.',
  settings: [
    {
      kind: 'boolean',
      key: 'causal',
      label: 'Causal mask (a word sees only the words before it)',
      help: 'On in GPT-style models, which predict the next word. Off in BERT-style encoders, where every word sees the whole sentence.',
    },
    {
      kind: 'boolean',
      key: 'scale',
      label: 'Divide the scores by √d_k',
      help: 'Vaswani et al. divide by the square root of the key width, so softmax does not saturate as keys get wider.',
    },
    {
      kind: 'choice',
      key: 'weights',
      label: 'The head',
      options: [
        { value: 'designed', label: 'Made by hand: actions look for animals' },
        { value: 'random', label: 'Random weights (untrained), new at each load' },
      ],
      help: 'A real model learns its weights. The hand-made head has a pattern you can read; a random one shows what attention looks like before training.',
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
      sample: 'the dog saw the ball and it',
      parse: (text) => {
        const words = parseSentence(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'project', label: 'Project (Q, K, V)', usesInput: false },
      { op: 'attend', label: 'Attend', usesInput: false },
    ],
    random: {
      label: 'Random sentence',
      make: (rng) => [['load', randomSentence(rng, rng.int(3, 7))], ['attend']],
    },
    presets: [
      preset('Random sentence', randomSentence),
      preset(
        'Who is "it"? (a pronoun)',
        (rng) => `the ${pick(rng, ANIMALS)} saw the ${pick(rng, THINGS)} and it`,
      ),
      preset('The same word twice', (rng) => {
        const a = pick(rng, ANIMALS);
        return `the ${a} saw the ${a}`;
      }),
      preset('One word', (rng) => pick(rng, ANIMALS)),
      preset('Only small words', () => 'the a on and the'),
      preset('Words it does not know', (rng) => `the zorp ${pick(rng, ACTIONS)} a blip`),
    ],
    sizes: [3, 5, 7],
  },
  explain,
  complexity: [
    {
      op: 'Project: Q, K and V',
      best: {
        cost: 'Θ(n · d · d_k)',
        why: 'Each of n words times a d × d_k matrix, three times.',
        example: 'one-word',
      },
      average: {
        cost: 'Θ(n · d · d_k)',
        why: 'The same for every sentence of n words.',
        example: 'cat-sat',
      },
      worst: {
        cost: 'Θ(n · d · d_k)',
        why: 'Linear in the number of words.',
        example: 'it-dog-or-ball',
      },
    },
    {
      op: 'Scores: every query against every key',
      best: {
        cost: 'Θ(n² · d_k)',
        why: 'One dot product for each of the n² pairs.',
        example: 'one-word',
      },
      average: {
        cost: 'Θ(n² · d_k)',
        why: 'Double the words and the table has four times the cells.',
        example: 'cat-sat',
      },
      worst: {
        cost: 'Θ(n² · d_k)',
        why: 'The mask hides half the pairs, but a plain version still computes them.',
        example: 'it-dog-or-ball',
      },
      note: 'This n² is why long contexts are expensive.',
    },
    {
      op: 'Softmax and the weighted sum',
      best: {
        cost: 'Θ(n² · d_v)',
        why: 'Each row of n weights blends n values.',
        example: 'one-word',
      },
      average: {
        cost: 'Θ(n² · d_v)',
        why: 'Every word blends every value it sees.',
        example: 'cat-sat',
      },
      worst: {
        cost: 'Θ(n² · d_v)',
        why: 'Without the mask, every word sees all n.',
        example: 'no-mask',
      },
    },
    {
      op: 'Memory for the weights',
      best: { cost: 'Θ(n²)', why: 'An n × n table per head.', example: 'one-word' },
      average: { cost: 'Θ(n²)', why: 'Kept for every head of every layer.', example: 'cat-sat' },
      worst: {
        cost: 'Θ(n²)',
        why: 'At 100 000 tokens, ten billion weights per head: FlashAttention avoids storing them.',
        example: 'it-dog-or-ball',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as AttnSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    catSat,
    itDogOrBall,
    noScaling,
    noMask,
    sameWordTwice,
    randomHead,
    oneWord,
  ] as unknown as SavedExample[],
  practice: attentionPractice(() => selfAttention),
  preview: { example: 'cat-sat', level: 2 },
  opening: 'cat-sat',
};

const headLines = (h: Head) =>
  (['q', 'k', 'v'] as const).map((m) => {
    const w = m === 'q' ? h.wq : m === 'k' ? h.wk : h.wv;
    return `w ${m} ${w.length} ${w[0]!.length} ${w.flat().join(' ')}`;
  });

/** The code tabs' line: the rows of A, then a bar, then the rows of Z, three decimals each. */
export const resultLine = (r: AttnResult): string =>
  `${r.a.map((row) => row.map(round3).join(' ')).join(' / ')} | ${r.z
    .map((row) => row.map(round3).join(' '))
    .join(' / ')}`;

/**
 * Driver protocol for the code tabs. "w q|k|v rows cols <values row by row>" sets a weight
 * matrix; "clear" starts a new sentence and "x <four numbers>" adds a word's embedding; neither
 * prints. "attend <causal 1|0> <scale 1|0>" prints `resultLine`.
 */
function codeScript(calls: OpCall[], settings: AttnSettings) {
  const t = new Timeline(selfAttention, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let head: Head | undefined;
  let x: number[][] | undefined;
  const sync = (s: AttnState) => {
    if (s.head !== head) input.push(...headLines(s.head));
    if (s.x !== x) input.push('clear', ...s.x.map((row) => `x ${row.join(' ')}`));
    head = s.head;
    x = s.x;
  };
  sync(t.initial.state);
  for (const e of t.entries) {
    sync(e.end);
    if (e.call[0] !== 'attend' || !e.end.result) continue;
    input.push(`attend ${settings.causal ? 1 : 0} ${settings.scale ? 1 : 0}`);
    expected.push(resultLine(e.end.result));
  }
  return { input, expected };
}

export default selfAttention;
