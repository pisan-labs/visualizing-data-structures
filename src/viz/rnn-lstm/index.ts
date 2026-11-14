import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import cppSource from './code/cpp/recurrent.hpp?raw';
import javaSource from './code/java/Recurrent.java?raw';
import pythonSource from './code/python/recurrent.py?raw';
import latch from './examples/latch.json';
import lstmKeeps from './examples/lstm-keeps.json';
import newAnimal from './examples/new-animal.json';
import noForgetGate from './examples/no-forget-gate.json';
import rnnFades from './examples/rnn-fades.json';
import smallWeight from './examples/small-weight.json';
import stepByStep from './examples/step-by-step.json';
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
  type RnnExtra,
  type RnnSettings,
  type RnnState,
  type Row,
} from './model';
import { rnnPractice } from './practice';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** An animal first, then words that are not animals: the memory has to carry it. */
export function animalFirst(rng: Rng): string {
  const t = pick(rng, THINGS);
  return pick(rng, [
    `${pick(rng, ANIMALS)} sat on the ${t} and it slept`,
    `${pick(rng, ANIMALS)} ran under the ${t} and it sat`,
    `${pick(rng, ANIMALS)} slept on a ${t} and it ate`,
    `${pick(rng, ANIMALS)} ate the ${t} and it ran`,
  ]);
}

/** Two animals: the second should replace the first. */
export function twoAnimals(rng: Rng): string {
  const [a, b] = [pick(rng, ANIMALS), pick(rng, ANIMALS)];
  return `${a} ${pick(rng, ACTIONS)} and the ${b} ${pick(rng, ['ate', 'saw', 'chased'])} it`;
}

const readAll = (text: string): OpCall[] => [['load', text], ['run']];

const preset = (label: string, make: (rng: Rng) => string): Preset => ({
  label,
  make: (rng) => readAll(make(rng)),
});

const MODEL_HELP =
  'A plain RNN keeps one memory and rewrites it at every word. An LSTM keeps a cell that gates guard: the forget gate decides what to keep, the input gate what to write, the output gate what to show. The 1997 LSTM had no forget gate; Gers et al. added it in 2000.';

export const rnnLstm: VizDef<RnnState, RnnSettings, RnnExtra> = {
  id: 'rnn-lstm',
  title: 'Recurrent networks (RNN and LSTM)',
  family: 'Language models and decoding',
  blurb:
    'Read a sentence one word at a time, carrying a memory from each word to the next. A plain RNN’s memory of the first word fades; an LSTM’s gated cell carries it, and the product of factors shows why.',
  settings: [
    {
      kind: 'choice',
      key: 'model',
      label: 'Model',
      options: [
        { value: 'rnn', label: 'Plain RNN: h = tanh(w·h + x·U)' },
        { value: 'lstm', label: 'LSTM with a forget gate (Gers et al. 2000)' },
        { value: 'lstm97', label: 'LSTM without a forget gate (1997)' },
      ],
      help: MODEL_HELP,
    },
    {
      kind: 'choice',
      key: 'w',
      label: 'Plain RNN: the recurrent weight w',
      options: [
        { value: '0.5', label: '0.5' },
        { value: '0.8', label: '0.8' },
        { value: '1.5', label: '1.5' },
      ],
      help: 'How much of the old memory goes into the next step. Each step multiplies the pull of word 1 by w · (1 − h²). That is below 1 when w ≤ 1; with w = 1.5 it is above 1 only while h stays near 0.',
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
      placeholder: 'e.g. cat sat on the mat and it slept',
      maxLength: 60,
      sample: 'cat sat on the mat and it slept',
      parse: (text) => {
        const words = parseSentence(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'step', label: 'Read next word', usesInput: false },
      { op: 'run', label: 'Read all', usesInput: false },
    ],
    random: { label: 'Random sentence', make: (rng) => readAll(animalFirst(rng)) },
    presets: [
      preset('An animal, then other words', animalFirst),
      preset('Two animals', twoAnimals),
      preset(
        'No animal at all',
        (rng) => `the ${pick(rng, THINGS)} sat on the ${pick(rng, THINGS)}`,
      ),
      preset('One word', (rng) => pick(rng, ANIMALS)),
      preset(
        'The animal comes last',
        (rng) => `on the ${pick(rng, THINGS)} slept a ${pick(rng, ANIMALS)}`,
      ),
      preset('Words it does not know', (rng) => `zorp ${pick(rng, ACTIONS)} on a blip`),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Read one word',
      best: {
        cost: 'Θ(d · (d + m))',
        why: 'A d × d recurrent matrix times h, and an m × d input matrix times x (d = 1, m = 4 here).',
        example: 'step-by-step',
      },
      average: {
        cost: 'Θ(d · (d + m))',
        why: 'The same for every word, whatever came before.',
        example: 'rnn-fades',
      },
      worst: {
        cost: 'Θ(d · (d + m))',
        why: 'An LSTM does it four times (three gates and the candidate): a constant factor.',
        example: 'lstm-keeps',
      },
    },
    {
      op: 'Read n words',
      best: {
        cost: 'Θ(n · d²)',
        why: 'n steps of the one above.',
        example: 'rnn-fades',
      },
      average: {
        cost: 'Θ(n · d²)',
        why: 'Linear in the length, against Θ(n² · d) for self-attention.',
        example: 'lstm-keeps',
      },
      worst: {
        cost: 'Θ(n) steps in a row',
        why: 'Each step needs the one before, so the n steps cannot run at the same time.',
        example: 'new-animal',
      },
      note: 'That chain of n steps is what transformers removed: attention computes every position at once.',
    },
    {
      op: 'Memory',
      best: {
        cost: 'Θ(d)',
        why: 'Reading needs only the current h (and c): it never grows.',
        example: 'lstm-keeps',
      },
      average: {
        cost: 'Θ(d)',
        why: 'A transformer’s KV cache grows by a row per token instead.',
        example: 'rnn-fades',
      },
      worst: {
        cost: 'Θ(n · d)',
        why: 'Training keeps every step’s values for backpropagation through time.',
        example: 'latch',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RnnSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    rnnFades,
    lstmKeeps,
    newAnimal,
    latch,
    noForgetGate,
    smallWeight,
    stepByStep,
  ] as unknown as SavedExample[],
  practice: rnnPractice(() => rnnLstm),
  preview: { example: 'lstm-keeps', level: 2 },
  opening: 'rnn-fades',
};

/** The code tabs' line for a row: "h pull" (RNN) or "f i g c o h pull" (LSTM), three decimals. */
export const rowLine = (r: Row): string =>
  (r.kind === 'rnn' ? [r.h, r.pull] : [r.f, r.i, r.g, r.c, r.o, r.h, r.pull]).map(round3).join(' ');

/**
 * Driver protocol for the code tabs. "model rnn <w>", "model lstm" or "model lstm97" starts a
 * new sentence with that model (memory 0); "x <four numbers>" reads one word and prints
 * `rowLine`.
 */
function codeScript(calls: OpCall[], settings: RnnSettings) {
  const t = new Timeline(rnnLstm, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const start = () =>
    input.push(settings.model === 'rnn' ? `model rnn ${settings.w}` : `model ${settings.model}`);
  let prev = t.initial.state;
  start();
  for (const e of t.entries) {
    const s = e.end;
    if (s.x !== prev.x) start();
    for (let k = s.x === prev.x ? prev.rows.length : 0; k < s.rows.length; k++) {
      input.push(`x ${s.x[k]!.join(' ')}`);
      expected.push(rowLine(s.rows[k]!));
    }
    prev = s;
  }
  return { input, expected };
}

export default rnnLstm;
