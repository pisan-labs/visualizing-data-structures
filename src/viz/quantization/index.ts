import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/quantize.hpp?raw';
import javaSource from './code/java/Quantize.java?raw';
import pythonSource from './code/python/quantize.py?raw';
import int4Rough from './examples/int4-rough.json';
import int8RoundTrip from './examples/int8-round-trip.json';
import outlierBlocks from './examples/outlier-blocks.json';
import outlierInt8 from './examples/outlier-int8.json';
import outlierRows from './examples/outlier-rows.json';
import outlierTensor from './examples/outlier-tensor.json';
import positiveAbsmax from './examples/positive-absmax.json';
import positiveZeropoint from './examples/positive-zeropoint.json';
import explain from './explain.md?raw';
import {
  COLS,
  defaults,
  describe,
  errorStats,
  init,
  initialSay,
  initialVars,
  MAX_W,
  ops,
  parseWeight,
  pseudocode,
  ROWS,
  type QuantSettings,
  type QuantState,
} from './model';
import { quantPractice } from './practice';
import { outlier, randomWeights } from './weights';
import { view } from './view';

const N = ROWS * COLS;

const text = (xs: readonly number[]) => xs.map(String).join(' ');

const preset = (label: string, make: (rng: Rng) => OpCall[]): Preset => ({
  label,
  make: (rng) => [...make(rng), ['quantize']],
});

/** What the shared input holds: one weight, or several (for Load). */
function parseInput(token: string): Value | Error {
  const parts = token.split(/[\s,;]+/).filter(Boolean);
  const xs = parts.map(parseWeight);
  if (!parts.length || xs.some((x) => x === null))
    return new Error(`Type numbers between −${MAX_W} and ${MAX_W}, separated by spaces.`);
  return parts.length === 1 ? xs[0]! : xs.join(' ');
}

export const quantization: VizDef<QuantState, QuantSettings, unknown> = {
  id: 'quantization',
  title: 'Quantization (int8, int4)',
  family: 'Serving LLMs',
  blurb:
    'Store each weight as an 8-bit or 4-bit integer code plus a scale per group, decode it back, and see the error: why one outlier ruins a scale shared by the whole matrix.',
  settings: [
    {
      kind: 'choice',
      key: 'bits',
      label: 'Bits per code',
      options: [
        { value: '8', label: 'int8' },
        { value: '4', label: 'int4' },
      ],
    },
    {
      kind: 'choice',
      key: 'scheme',
      label: 'Codes',
      options: [
        { value: 'absmax', label: 'Absmax (symmetric): −127 to 127, 0 is code 0' },
        { value: 'zeropoint', label: 'Zero-point (asymmetric): 0 to 255, a zero point z' },
      ],
      help: 'Absmax wastes the codes on one side when the weights are all positive; zero-point stretches the codes over the weights’ own range.',
    },
    {
      kind: 'choice',
      key: 'group',
      label: 'One scale for',
      options: [
        { value: 'tensor', label: 'The whole matrix (per-tensor)' },
        { value: 'row', label: 'Each row' },
        { value: '3', label: 'Each block of 3 in a row' },
      ],
      help: 'More scales cost more memory (32 bits each here) but keep one large weight from spoiling the rest. QLoRA uses blocks of 64.',
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
      label: 'Weights, or row column weight',
      placeholder: 'e.g. .5 −.3 1.2, or 2 3 6.5',
      maxLength: 200,
      sample: '1',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'quantize', label: 'Quantize', usesInput: false },
      {
        op: 'set',
        label: 'Set one weight',
        usesInput: true,
        args: ['a row', 'a column', 'a weight'],
      },
    ],
    random: {
      label: 'Random matrix',
      make: (rng) => [['load', text(randomWeights(rng))], ['quantize']],
    },
    presets: [
      preset('Random weights', (rng) => [['load', text(randomWeights(rng))]]),
      preset('Random weights and one outlier', (rng) => [
        ['load', text(randomWeights(rng))],
        ['set', ...outlier(rng)],
      ]),
      preset('All positive (like ReLU outputs)', (rng) => [
        ['load', text(randomWeights(rng).map((x) => Math.abs(x)))],
      ]),
      preset('One row much larger than the rest', (rng) => {
        const w = randomWeights(rng, 0.3);
        const r = rng.int(0, ROWS - 1);
        for (let c = 0; c < COLS; c++) w[r * COLS + c] = Math.round(w[r * COLS + c]! * 1000) / 100;
        return [['load', text(w)]];
      }),
      preset('Every weight the same', (rng) => [
        ['load', text(Array<number>(N).fill(rng.int(1, 9) / 10))],
      ]),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Quantize n weights in groups of g',
      best: {
        cost: 'Θ(n)',
        why: 'One pass for each group’s largest weight, one for the codes.',
        example: 'int8-round-trip',
      },
      average: {
        cost: 'Θ(n)',
        why: 'The group size changes how many scales, not the work per weight.',
        example: 'outlier-blocks',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Zero-point needs the min and the max: still one pass.',
        example: 'positive-zeropoint',
      },
    },
    {
      op: 'Memory for n weights at b bits',
      best: {
        cost: 'n · b + 32 bits',
        why: 'One scale for the whole tensor.',
        example: 'outlier-tensor',
      },
      average: {
        cost: 'n · b + 32 · n / g bits',
        why: 'One 32-bit scale per group of g; QLoRA’s g = 64 adds half a bit per weight.',
        example: 'outlier-rows',
      },
      worst: {
        cost: 'n · (b + 32 / g + b / g) bits',
        why: 'Zero-point stores a zero point per group as well.',
        example: 'positive-zeropoint',
      },
    },
    {
      op: 'Error of one weight',
      best: {
        cost: '0',
        why: 'The group’s largest weight maps to the top code exactly.',
        example: 'int8-round-trip',
      },
      average: {
        cost: 'about a quarter of a step',
        why: 'Rounding misses by anything up to half a step, 1 / (2s).',
        example: 'int4-rough',
      },
      worst: {
        cost: '1 / (2s)',
        why: 'Half a step; an outlier makes the step large for its whole group.',
        example: 'outlier-tensor',
      },
    },
    {
      op: 'Decode for a matrix product',
      best: {
        cost: 'Θ(n)',
        why: 'One multiply per weight: ŵ = q / s.',
        example: 'int8-round-trip',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Zero-point adds a subtraction: ŵ = (q − z) / s.',
        example: 'positive-zeropoint',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Cheap next to the product itself, and the codes read from memory are 2 to 4 times smaller.',
        example: 'int4-rough',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (c: OpCall[], settings: Settings) => codeScript(c, settings as QuantSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    int8RoundTrip,
    int4Rough,
    outlierTensor,
    outlierInt8,
    outlierRows,
    outlierBlocks,
    positiveAbsmax,
    positiveZeropoint,
  ] as unknown as SavedExample[],
  practice: quantPractice(() => quantization),
  preview: { example: 'outlier-blocks', level: 2, hide: ['s-', 'z-', 'w-'] },
  opening: 'outlier-tensor',
};

/** The code tabs' line: the codes row by row, the decoded weights, the total |error|. */
export function resultLine(s: QuantState): string {
  const codes = s.q.flat().map(String).join(' ');
  const decoded = s.deq!.flat().map(round3).join(' ');
  return `${codes} | ${decoded} | ${round3(errorStats(s)!.total)}`;
}

/**
 * Driver protocol for the code tabs. "settings <bits> <absmax|zeropoint> <tensor|row|3>" sets the
 * options and "load <24 numbers>" the weights, row by row; neither prints. "quantize" prints
 * `resultLine`. A refused operation is not sent.
 */
function codeScript(c: OpCall[], settings: QuantSettings) {
  const t = new Timeline(quantization, settings, 1, c);
  const input = [`settings ${settings.bits} ${settings.scheme} ${settings.group}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    if (s !== before) {
      if (e.call[0] === 'quantize') {
        input.push('quantize');
        expected.push(resultLine(s));
      } else input.push(`load ${s.w!.flat().join(' ')}`);
    }
    before = s;
  }
  return { input, expected };
}

export default quantization;
