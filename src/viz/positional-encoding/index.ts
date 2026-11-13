import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import { parseSentence } from '../self-attention/model';
import cppSource from './code/cpp/positions.hpp?raw';
import javaSource from './code/java/Positions.java?raw';
import pythonSource from './code/python/positions.py?raw';
import alibiRecency from './examples/alibi-recency.json';
import distance from './examples/distance.json';
import oneWord from './examples/one-word.json';
import ropeDistance from './examples/rope-distance.json';
import ropeTurns from './examples/rope-turns.json';
import sameWordTwice from './examples/same-word-twice.json';
import table from './examples/table.json';
import explain from './explain.md?raw';
import {
  content,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type PosExtra,
  type PosSettings,
  type PosState,
} from './model';
import { positionPractice } from './practice';
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
  make: (rng, size) => [['load', make(rng, size)], ['encode'], ['score']],
});

export const positionalEncoding: VizDef<PosState, PosSettings, PosExtra> = {
  id: 'positional-encoding',
  title: 'Positional encoding (sinusoidal, RoPE)',
  family: 'Inside the transformer',
  blurb:
    'Attention cannot tell word order on its own. Sinusoidal encodings add a vector of sines and cosines, RoPE turns queries and keys by an angle that grows with position, and ALiBi pushes down distant scores.',
  settings: [
    {
      kind: 'choice',
      key: 'scheme',
      label: 'Scheme',
      options: [
        { value: 'sinusoidal', label: 'Sinusoidal: add sines and cosines (Vaswani et al.)' },
        { value: 'rope', label: 'RoPE: turn queries and keys (Su et al.)' },
        { value: 'alibi', label: 'ALiBi: a linear penalty on scores (Press et al.)' },
      ],
      help: 'The original transformer adds sinusoids to the embeddings. Many recent models turn queries and keys instead (RoPE); ALiBi adds nothing to the words.',
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
      { op: 'encode', label: 'Encode positions', usesInput: false },
      { op: 'score', label: 'Score pairs', usesInput: false },
    ],
    random: {
      label: 'Random sentence',
      make: (rng) => [['load', randomSentence(rng, rng.int(3, 7))], ['encode'], ['score']],
    },
    presets: [
      preset('Random sentence', randomSentence),
      preset('The same word twice', (rng) => {
        const a = pick(rng, ANIMALS);
        return `the ${a} saw the ${a}`;
      }),
      preset(
        'Who is "it"? (a pronoun)',
        (rng) => `the ${pick(rng, ANIMALS)} saw the ${pick(rng, THINGS)} and it`,
      ),
      preset('One word', (rng) => pick(rng, ANIMALS)),
      preset('Seven words', (rng) => randomSentence(rng, 7)),
    ],
    sizes: [3, 5, 7],
  },
  explain,
  complexity: [
    {
      op: 'Encode n positions',
      best: {
        cost: 'Θ(n · d)',
        why: 'One sine and one cosine per pair per position, made once.',
        example: 'one-word',
      },
      average: {
        cost: 'Θ(n · d)',
        why: 'The table can be computed ahead for the longest context.',
        example: 'table',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'ALiBi: one bias per pair of positions (but no numbers added to the words).',
        example: 'alibi-recency',
      },
    },
    {
      op: 'RoPE: turn q and k',
      best: { cost: 'Θ(n · d)', why: 'Four multiplications per pair.', example: 'rope-turns' },
      average: {
        cost: 'Θ(n · d)',
        why: 'Done in every layer and head, before the scores.',
        example: 'rope-distance',
      },
      worst: {
        cost: 'Θ(n · d)',
        why: 'Small next to the Θ(n² · d) scores.',
        example: 'same-word-twice',
      },
    },
    {
      op: 'Scores between positions',
      best: { cost: 'Θ(n² · d)', why: 'Every pair of positions.', example: 'one-word' },
      average: { cost: 'Θ(n² · d)', why: 'As in any attention.', example: 'distance' },
      worst: { cost: 'Θ(n² · d)', why: 'n² dot products of width d.', example: 'rope-distance' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PosSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    table,
    distance,
    ropeTurns,
    ropeDistance,
    sameWordTwice,
    alibiRecency,
    oneWord,
  ] as unknown as SavedExample[],
  practice: positionPractice(() => positionalEncoding),
  preview: { example: 'distance', level: 2 },
  opening: 'table',
};

const rows = (m: number[][]) => m.map((row) => row.map(round3).join(' ')).join(' / ');

/**
 * Driver protocol for the code tabs. "clear" starts a sentence and "x q1 q2 k1 k2" adds a
 * word's query and key (from the self-attention page's head); "encode <scheme>" prints the
 * scheme's table (ALiBi's up to the diagonal) and "score <scheme>" its score table.
 */
function codeScript(calls: OpCall[], settings: PosSettings) {
  const t = new Timeline(positionalEncoding, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const { scheme } = settings;
  let x: number[][] | undefined;
  const sync = (s: PosState) => {
    if (s.x !== x) {
      const c = content(s.x);
      input.push('clear', ...c.q.map((q, i) => `x ${q.join(' ')} ${c.k[i]!.join(' ')}`));
    }
    x = s.x;
  };
  sync(t.initial.state);
  for (const e of t.entries) {
    sync(e.end);
    const op = e.call[0];
    if (op === 'encode' && e.end.table) {
      input.push(`encode ${scheme}`);
      const tab =
        scheme === 'alibi' ? e.end.table.map((row, i) => row.slice(0, i + 1)) : e.end.table;
      expected.push(rows(tab));
    } else if (op === 'score' && e.end.scores) {
      input.push(`score ${scheme}`);
      expected.push(rows(e.end.scores));
    }
  }
  return { input, expected };
}

export default positionalEncoding;
