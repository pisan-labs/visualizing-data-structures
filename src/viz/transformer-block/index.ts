import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import { parseSentence } from '../self-attention/model';
import cppSource from './code/cpp/block.hpp?raw';
import javaSource from './code/java/Block.java?raw';
import pythonSource from './code/python/block.py?raw';
import actionThenOn from './examples/action-then-on.json';
import animalThenAction from './examples/animal-then-action.json';
import articleAfterAnimal from './examples/article-after-animal.json';
import firstWord from './examples/first-word.json';
import llamaStyle from './examples/llama-style.json';
import postNorm from './examples/post-norm.json';
import thingThenAnd from './examples/thing-then-and.json';
import explain from './explain.md?raw';
import {
  B_1,
  B_2,
  defaults,
  describe,
  HEAD,
  init,
  initialSay,
  initialVars,
  ops,
  OUT_WORDS,
  pseudocode,
  U,
  W_1,
  W_2,
  W_DOWN,
  W_GATE,
  W_O,
  W_UP,
  type BlockExtra,
  type BlockResult,
  type BlockSettings,
  type BlockState,
} from './model';
import { blockPractice } from './practice';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** The start of a sentence, `size` words (1 to 7): "the cat sat on the mat and". */
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
  return words.slice(0, Math.max(1, Math.min(7, size))).join(' ');
}

const preset = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size) => [['load', make(rng, size)], ['run']],
});

export const transformerBlock: VizDef<BlockState, BlockSettings, BlockExtra> = {
  id: 'transformer-block',
  title: 'The transformer block',
  family: 'Inside the transformer',
  blurb:
    'Follow one word’s vector through a block: normalize, attend, add; normalize, feed forward, add. Then the unembedding scores every word, and the block guesses the next one.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Where the norm goes',
      options: [
        { value: 'pre', label: 'Pre-norm: before each sublayer (GPT-2 and later)' },
        { value: 'post', label: 'Post-norm: after each residual add (the original paper)' },
      ],
      help: 'Vaswani et al. (2017) normalize the stream after each add. GPT-2 moved the norm inside each branch and added a final norm, which trains more stably in deep models.',
    },
    {
      kind: 'choice',
      key: 'norm',
      label: 'Normalization',
      options: [
        { value: 'layer', label: 'LayerNorm: subtract the mean, divide by the spread' },
        { value: 'rms', label: 'RMSNorm: divide by the root mean square (Llama)' },
      ],
      help: 'Both rescale a vector to a standard size. RMSNorm skips the mean and the bias, so it has half the parameters.',
    },
    {
      kind: 'choice',
      key: 'act',
      label: 'Feed-forward network',
      options: [
        { value: 'relu', label: 'ReLU (the original paper)' },
        { value: 'gelu', label: 'GELU (GPT-2)' },
        { value: 'swiglu', label: 'SwiGLU: a gated unit, three matrices (Llama)' },
      ],
      help: 'The hidden layer’s nonlinearity. SwiGLU multiplies a SiLU gate by a second projection, so it needs a third matrix.',
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
      placeholder: 'e.g. the cat sat on the',
      maxLength: 60,
      sample: 'the cat sat on the',
      parse: (text) => {
        const words = parseSentence(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run the block', usesInput: false },
    ],
    random: {
      label: 'Random sentence',
      make: (rng) => [['load', randomSentence(rng, rng.int(1, 7))], ['run']],
    },
    presets: [
      preset('The start of a random sentence', randomSentence),
      preset(
        'An article after an animal',
        (rng) => `the ${pick(rng, ANIMALS)} ${pick(rng, ACTIONS)} the`,
      ),
      preset('An article with nothing before it', () => 'the'),
      preset('An animal', (rng) => `the ${pick(rng, ANIMALS)}`),
      preset('An action', (rng) => `the ${pick(rng, ANIMALS)} ${pick(rng, ACTIONS)}`),
      preset('A thing', (rng) => `the ${pick(rng, ANIMALS)} sat on the ${pick(rng, THINGS)}`),
      preset('Words it does not know', () => 'the zorp blip'),
    ],
    sizes: [3, 5, 7],
  },
  explain,
  complexity: [
    {
      op: 'Normalize one vector',
      best: {
        cost: 'Θ(d)',
        why: 'One pass for the mean (or the squares), one to divide.',
        example: 'first-word',
      },
      average: { cost: 'Θ(d)', why: 'The same for every word.', example: 'article-after-animal' },
      worst: {
        cost: 'Θ(d)',
        why: 'Done twice per block per word, plus the final norm.',
        example: 'post-norm',
      },
    },
    {
      op: 'Self-attention over n words',
      best: {
        cost: 'Θ(n · d · d_k)',
        why: 'One word: the projections dominate.',
        example: 'first-word',
      },
      average: {
        cost: 'Θ(n² · d_k + n · d · d_k)',
        why: 'Every word scores every word before it.',
        example: 'article-after-animal',
      },
      worst: {
        cost: 'Θ(n² · d_k + n · d · d_k)',
        why: 'Long sentences: the n² scores take over.',
        example: 'thing-then-and',
      },
    },
    {
      op: 'Feed-forward network',
      best: {
        cost: 'Θ(n · d · d_ff)',
        why: 'Two (or three) matrices per word.',
        example: 'first-word',
      },
      average: {
        cost: 'Θ(n · d · d_ff)',
        why: 'Each word on its own, no mixing between words.',
        example: 'article-after-animal',
      },
      worst: {
        cost: 'Θ(n · d · d_ff)',
        why: 'SwiGLU has three matrices instead of two.',
        example: 'llama-style',
      },
      note: 'With d_ff = 4d, the FFN holds about two thirds of a block’s weights.',
    },
    {
      op: 'Unembedding to logits',
      best: {
        cost: 'Θ(V · d)',
        why: 'One dot product per word in the vocabulary.',
        example: 'first-word',
      },
      average: {
        cost: 'Θ(V · d)',
        why: 'Only the last word’s vector is needed to guess the next.',
        example: 'animal-then-action',
      },
      worst: {
        cost: 'Θ(V · d)',
        why: 'With 50 257 tokens this is a large matrix.',
        example: 'action-then-on',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BlockSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    articleAfterAnimal,
    firstWord,
    animalThenAction,
    actionThenOn,
    thingThenAnd,
    postNorm,
    llamaStyle,
  ] as unknown as SavedExample[],
  practice: blockPractice(() => transformerBlock),
  preview: { example: 'article-after-animal', level: 2, hide: ['lg', 'p-', 'cut'] },
  opening: 'article-after-animal',
};

const matLine = (name: string, m: readonly (readonly number[])[]) =>
  `w ${name} ${m.length} ${m[0]!.length} ${m.flat().join(' ')}`;

/** Every weight, once, at the start of a script. */
export const weightLines = (): string[] => [
  matLine('q', HEAD.wq),
  matLine('k', HEAD.wk),
  matLine('v', HEAD.wv),
  matLine('o', W_O),
  matLine('w1', W_1),
  `b b1 ${B_1.join(' ')}`,
  matLine('w2', W_2),
  `b b2 ${B_2.join(' ')}`,
  matLine('wg', W_GATE),
  matLine('wu', W_UP),
  matLine('wd', W_DOWN),
  matLine('u', U),
  `vocab ${OUT_WORDS.join(' ')}`,
];

/**
 * The code tabs' line: the followed word's attention weights, the stream after each sublayer
 * (x₁, x₂), all the logits, three decimals each, and the guess.
 */
export const resultLine = (r: BlockResult): string =>
  [
    r.att.a[r.att.a.length - 1]!.map(round3).join(' '),
    r.rows.x1!.map(round3).join(' '),
    r.rows.x2!.map(round3).join(' '),
    r.logits.map(round3).join(' '),
    OUT_WORDS[r.guess]!,
  ].join(' | ');

/**
 * Driver protocol for the code tabs. "w <name> rows cols <values>" sets a weight matrix and
 * "b <name> <values>" a bias; "vocab <words>" names the unembedding's columns; "clear" starts
 * a sentence and "x <8 numbers>" adds a word's vector. None of these print.
 * "run <pre|post> <layer|rms> <relu|gelu|swiglu>" prints `resultLine`.
 */
function codeScript(calls: OpCall[], settings: BlockSettings) {
  const t = new Timeline(transformerBlock, settings, 1, calls);
  const input: string[] = weightLines();
  const expected: string[] = [];
  let x: number[][] | undefined;
  const sync = (s: BlockState) => {
    if (s.x !== x) input.push('clear', ...s.x.map((row) => `x ${row.join(' ')}`));
    x = s.x;
  };
  sync(t.initial.state);
  for (const e of t.entries) {
    sync(e.end);
    if (e.call[0] !== 'run' || !e.end.result) continue;
    input.push(`run ${settings.order} ${settings.norm} ${settings.act}`);
    expected.push(resultLine(e.end.result));
  }
  return { input, expected };
}

export default transformerBlock;
