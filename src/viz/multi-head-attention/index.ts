import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import { parseSentence } from '../self-attention/model';
import cppSource from './code/cpp/multihead.hpp?raw';
import javaSource from './code/java/MultiHead.java?raw';
import pythonSource from './code/python/mha.py?raw';
import catSat from './examples/cat-sat.json';
import gqa from './examples/gqa.json';
import mqa from './examples/mqa.json';
import oneHead from './examples/one-head.json';
import oneWord from './examples/one-word.json';
import pronoun from './examples/pronoun.json';
import twoHeads from './examples/two-heads.json';
import explain from './explain.md?raw';
import {
  config,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  weights,
  type MhaExtra,
  type MhaResult,
  type MhaSettings,
  type MhaState,
} from './model';
import { mhaPractice } from './practice';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** A sentence of `size` words (1 to 7) from the toy vocabulary. */
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

export const multiHeadAttention: VizDef<MhaState, MhaSettings, MhaExtra> = {
  id: 'multi-head-attention',
  title: 'Multi-head attention (and GQA)',
  family: 'Inside the transformer',
  blurb:
    'Several attention heads side by side, each with its own pattern, then concatenated and mixed. Grouped-query and multi-query attention share keys and values among heads, and the KV cache shrinks.',
  settings: [
    {
      kind: 'choice',
      key: 'heads',
      label: 'Query heads (d_model = 4)',
      options: [
        { value: '4', label: '4 heads of width 1' },
        { value: '2', label: '2 heads of width 2' },
        { value: '1', label: '1 head of width 4' },
      ],
      help: 'The heads split the four numbers of each word between them. Vaswani et al. use 8 heads of 64 for a width of 512.',
    },
    {
      kind: 'choice',
      key: 'kv',
      label: 'Key and value heads',
      options: [
        { value: 'mha', label: 'Multi-head: one per query head' },
        { value: 'gqa', label: 'Grouped-query: one per two query heads' },
        { value: 'mqa', label: 'Multi-query: one for all' },
      ],
      help: 'Fewer key and value heads make the KV cache smaller. A shared head here averages the weights of the heads that share it.',
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
      preset(
        'A thing, then what happened to it',
        (rng) => `the ${pick(rng, THINGS)} ${pick(rng, ACTIONS)}`,
      ),
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
        cost: 'Θ(n · d_model²)',
        why: 'Q is n × d_model; K and V shrink with fewer key heads.',
        example: 'mqa',
      },
      average: {
        cost: 'Θ(n · d_model²)',
        why: 'The same multiplications however the heads split them.',
        example: 'cat-sat',
      },
      worst: {
        cost: 'Θ(n · d_model²)',
        why: 'Multi-head: K and V as wide as Q.',
        example: 'pronoun',
      },
    },
    {
      op: 'Scores and weights, all heads',
      best: {
        cost: 'Θ(n² · d_model)',
        why: 'h heads × n² pairs × d = d_model / h each: the same as one wide head.',
        example: 'one-head',
      },
      average: {
        cost: 'Θ(n² · d_model)',
        why: 'More heads, but each is narrower.',
        example: 'cat-sat',
      },
      worst: {
        cost: 'Θ(n² · d_model)',
        why: 'Sharing keys saves memory, not this work.',
        example: 'gqa',
      },
      note: 'Plus Θ(h · n²) for the softmaxes and Θ(n · d_model²) for W_O.',
    },
    {
      op: 'KV cache, per layer',
      best: {
        cost: 'Θ(n · d)',
        why: 'Multi-query: one key and one value head of width d per word.',
        example: 'mqa',
      },
      average: {
        cost: 'Θ(n · h_kv · d)',
        why: 'Grouped-query: h_kv heads in between.',
        example: 'gqa',
      },
      worst: {
        cost: 'Θ(n · d_model)',
        why: 'Multi-head: h_kv = h, so 2 · d_model numbers per word.',
        example: 'cat-sat',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MhaSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [catSat, pronoun, gqa, mqa, twoHeads, oneHead, oneWord] as unknown as SavedExample[],
  practice: mhaPractice(() => multiHeadAttention),
  preview: { example: 'cat-sat', level: 2, hide: ['q-', 'k-', 'v-'] },
  opening: 'cat-sat',
};

const rows = (m: number[][]) => m.map((row) => row.map(round3).join(' ')).join(' / ');

/** The code tabs' line: each head's weights, then O. */
export const resultLine = (r: MhaResult): string =>
  [...r.heads.map((hd) => rows(hd.a)), rows(r.o)].join(' | ');

/**
 * Driver protocol for the code tabs. "w q|k|v|o rows cols <values row by row>" sets a weight
 * matrix and "heads h h_kv" the heads (both from the settings); "clear" starts a new sentence
 * and "x <four numbers>" adds a word's embedding. "attend" prints `resultLine`.
 */
function codeScript(calls: OpCall[], settings: MhaSettings) {
  const cfg = config(settings);
  const w = weights(cfg);
  const t = new Timeline(multiHeadAttention, settings, 1, calls);
  const input: string[] = (['q', 'k', 'v', 'o'] as const).map((m) => {
    const mat = m === 'q' ? w.wq : m === 'k' ? w.wk : m === 'v' ? w.wv : w.wo;
    return `w ${m} ${mat.length} ${mat[0]!.length} ${mat.flat().join(' ')}`;
  });
  input.push(`heads ${cfg.h} ${cfg.hkv}`);
  const expected: string[] = [];
  let x: number[][] | undefined;
  const sync = (s: MhaState) => {
    if (s.x !== x) input.push('clear', ...s.x.map((row) => `x ${row.join(' ')}`));
    x = s.x;
  };
  sync(t.initial.state);
  for (const e of t.entries) {
    sync(e.end);
    if (e.call[0] !== 'attend' || !e.end.result) continue;
    input.push('attend');
    expected.push(resultLine(e.end.result));
  }
  return { input, expected };
}

export default multiHeadAttention;
