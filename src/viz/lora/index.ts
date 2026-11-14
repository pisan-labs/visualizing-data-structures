import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/lora.hpp?raw';
import javaSource from './code/java/LoRA.java?raw';
import pythonSource from './code/python/lora.py?raw';
import alphaLarge from './examples/alpha-large.json';
import bothRandom from './examples/both-random.json';
import bothZero from './examples/both-zero.json';
import fullRank from './examples/full-rank-target.json';
import mergeServe from './examples/merge-for-serving.json';
import rankOneShort from './examples/rank-one-falls-short.json';
import rankOneTarget from './examples/rank-one-target.json';
import rankTwo from './examples/rank-two-reaches.json';
import explain from './explain.md?raw';
import {
  defaults,
  delta,
  describe,
  init,
  initialSay,
  initialVars,
  lossOf,
  MAX_RANK,
  ops,
  parseTarget,
  pseudocode,
  scaleOf,
  STEPS,
  type LoraSettings,
  type LoraState,
} from './model';
import { loraPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng) => OpCall[]): Preset => ({
  label,
  make: (rng) => make(rng),
});

export const lora: VizDef<LoraState, LoraSettings, unknown> = {
  id: 'lora',
  title: 'LoRA (low-rank adapters)',
  family: 'Training',
  blurb:
    'Freeze the big weight matrix and train two thin ones, B and A, whose product is the update: a fraction of the numbers, and merged into W for serving at no extra cost.',
  settings: [
    {
      kind: 'number',
      key: 'rank',
      label: 'Rank r of the adapter',
      min: 1,
      max: MAX_RANK,
      help: 'B is 4 × r and A is r × 4, so B·A has rank at most r. In the paper’s rank study on GPT-3 (two tasks), r = 1 did about as well as r = 64.',
    },
    {
      kind: 'choice',
      key: 'alpha',
      label: 'α (the update is scaled by α/r)',
      options: [
        { value: '1', label: 'α = 1' },
        { value: '2', label: 'α = 2' },
        { value: '4', label: 'α = 4' },
        { value: '8', label: 'α = 8' },
      ],
      help: 'Hu et al. set α to the first r they try and leave it. With Adam, changing α is about the same as changing the learning rate.',
    },
    {
      kind: 'choice',
      key: 'init',
      label: 'How B and A start',
      options: [
        { value: 'paper', label: 'A random, B zero (the paper): ΔW starts at 0' },
        { value: 'random', label: 'Both random: the layer starts changed' },
        { value: 'zero', label: 'Both zero: no gradient reaches either' },
      ],
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
      label: 'Target: a rank, or 16 numbers',
      placeholder: 'e.g. 2, or 1 0 1 0 …',
      maxLength: 120,
      sample: '2',
      parse: (text) => {
        const t = parseTarget(text);
        return t instanceof Error ? t : text.trim();
      },
    },
    buttons: [
      { op: 'target', label: 'Target', usesInput: true, primary: true },
      { op: 'train', label: `Train (${STEPS} steps)`, usesInput: false },
      { op: 'merge', label: 'Merge into W', usesInput: false },
    ],
    random: {
      label: 'Random target',
      make: (rng) => [['target', String(rng.int(1, 3))], ['train'], ['train']],
    },
    presets: [
      preset('A rank-1 update', () => [['target', '1'], ['train'], ['train']]),
      preset('A rank-2 update', () => [['target', '2'], ['train'], ['train'], ['train']]),
      preset('A full-rank update', () => [['target', '4'], ['train'], ['train'], ['train']]),
      preset('Train, then merge for serving', () => [
        ['target', '2'],
        ['train'],
        ['train'],
        ['merge'],
      ]),
      preset('The same row four times (rank 1)', (rng) => {
        const row = Array.from({ length: 4 }, () => rng.int(-2, 2));
        if (!row.some((x) => x !== 0)) row[rng.int(0, 3)] = 1;
        return [['target', [row, row, row, row].flat().join(' ')], ['train'], ['train']];
      }),
      preset('The identity (full rank)', () => [
        ['target', '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1'],
        ['train'],
        ['train'],
        ['train'],
      ]),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Trained numbers for a d × d layer',
      best: {
        cost: 'Θ(d·r)',
        why: 'B is d × r and A is r × d: 2dr numbers, against d² for full fine-tuning.',
        example: 'rank-one-target',
      },
      average: {
        cost: 'Θ(d·r)',
        why: 'With r = 8 and d = 4096, 65 536 numbers instead of 16.8 million.',
        example: 'rank-two-reaches',
      },
      worst: {
        cost: 'Θ(d²)',
        why: 'At r = d/2 the adapter is as big as W, and at r = d twice as big.',
        example: 'full-rank-target',
      },
      note: 'Adam keeps two more numbers per trained number, so its memory shrinks the same way.',
    },
    {
      op: 'One training step here (form ΔW, the gradients, Adam)',
      best: {
        cost: 'Θ(d²·r)',
        why: 'B·A, then 2E·Aᵀ and Bᵀ·2E: three products of d × r by r × d sizes.',
        example: 'rank-one-target',
      },
      average: {
        cost: 'Θ(d²·r)',
        why: 'Adam itself touches only the 2dr adapter numbers.',
        example: 'rank-two-reaches',
      },
      worst: {
        cost: 'Θ(d²·r)',
        why: 'The same for any target; W is never updated.',
        example: 'rank-one-falls-short',
      },
    },
    {
      op: 'Serving one input, unmerged: x·W + (x·B)·A',
      best: {
        cost: 'Θ(d² + 2dr)',
        why: 'x·B first (d·r), then times A (r·d), never forming B·A.',
        example: 'rank-two-reaches',
      },
      average: {
        cost: 'Θ(d² + 2dr)',
        why: 'Small next to x·W when r ≪ d, but a second pass through extra layers adds latency.',
        example: 'rank-two-reaches',
      },
      worst: {
        cost: 'Θ(d² + d²·r)',
        why: 'Computing x·(B·A) instead forms the d × d product for every input: order matters, as in matrix-chain multiplication.',
        example: 'full-rank-target',
      },
    },
    {
      op: 'Merge, then serve one input',
      best: {
        cost: 'Θ(d²·r) once, then Θ(d²)',
        why: 'Form B·A once and add it to W; after that the layer is plain W again.',
        example: 'merge-for-serving',
      },
      average: {
        cost: 'Θ(d²) per input',
        why: 'No extra latency at all: the same matrix size as before.',
        example: 'merge-for-serving',
      },
      worst: {
        cost: 'Θ(d²·r) per switch',
        why: 'Changing tasks means subtracting one adapter and adding another.',
        example: 'merge-for-serving',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LoraSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    rankTwo,
    rankOneShort,
    rankOneTarget,
    fullRank,
    bothZero,
    bothRandom,
    alphaLarge,
    mergeServe,
  ] as unknown as SavedExample[],
  practice: loraPractice(() => lora),
  preview: { example: 'rank-one-target', level: 2, hide: ['W', 'plus'] },
  opening: 'rank-one-target',
};

const nums = (m: number[][]) => m.flat().join(' ');
const rows = (m: number[][]) => m.map((row) => row.map(round3).join(' ')).join(' / ');

/** The code tabs' line after training: the loss, a bar, then the rows of ΔW. */
export const trainLine = (s: LoraState, settings: LoraSettings): string => {
  const dw = delta(s.b, s.a, scaleOf(settings));
  return `${round3(lossOf(dw, s.target))} | ${rows(dw)}`;
};

/**
 * Driver protocol for the code tabs. "w <16 numbers>" sets the frozen W and "target <16
 * numbers>" the target D; "adapter <r> <alpha> <B, row by row> <A, row by row>" starts a new
 * adapter (and a fresh Adam). None of them prints. "train <k>" takes k Adam steps and prints
 * `trainLine`; "merge" prints the rows of W + ΔW. Three decimals each.
 */
function codeScript(calls: OpCall[], settings: LoraSettings) {
  const t = new Timeline(lora, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let w: number[][] | undefined;
  let adapter = -1;
  const sync = (s: LoraState) => {
    if (s.w !== w) input.push(`w ${nums(s.w)}`);
    if (s.adapter !== adapter)
      input.push(
        `target ${nums(s.target)}`,
        `adapter ${settings.rank} ${settings.alpha} ${nums(s.b)} ${nums(s.a)}`,
      );
    w = s.w;
    adapter = s.adapter;
  };
  let prev = t.initial.state;
  sync(prev);
  for (const e of t.entries) {
    sync(prev);
    if (e.call[0] === 'train') {
      input.push(`train ${e.end.steps - prev.steps}`);
      expected.push(trainLine(e.end, settings));
    } else if (e.call[0] === 'merge' && e.end.merged) {
      input.push('merge');
      expected.push(rows(e.end.merged));
    }
    prev = e.end;
  }
  return { input, expected };
}

export default lora;
