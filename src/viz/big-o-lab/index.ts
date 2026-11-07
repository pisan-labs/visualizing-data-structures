import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/growth.hpp?raw';
import javaSource from './code/java/Growth.java?raw';
import pythonSource from './code/python/growth.py?raw';
import constantAndLog from './examples/constant-and-log.json';
import doublingN from './examples/doubling-n.json';
import exponentialExplodes from './examples/exponential-explodes.json';
import factorial from './examples/factorial.json';
import logScale from './examples/log-scale.json';
import quadraticWall from './examples/quadratic-wall.json';
import smallNCrossover from './examples/small-n-crossover.json';
import explain from './explain.md?raw';
import {
  FNS,
  FN_CODE,
  FN_LABEL,
  MAX_N,
  count,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type LabSettings,
  type LabState,
} from './model';
import { bigOPractice } from './practice';
import { view } from './view';

export const parseN = (token: string): Value | Error =>
  parseWhole(token.replace(/[,_]/g, ''), 1, MAX_N, 'n');

export const bigOLab: VizDef<LabState, LabSettings, undefined> = {
  id: 'big-o-lab',
  title: 'Big-O growth lab',
  family: 'Foundations',
  blurb:
    'Count the steps of 1, log n, n, n log n, n², 2ⁿ and n! side by side, then double n and watch who runs away.',
  settings: [
    {
      kind: 'choice',
      key: 'scale',
      label: 'Bar height',
      options: [
        { value: 'linear', label: 'Linear: the tallest bar fills the chart' },
        { value: 'log', label: 'Logarithmic: each step up is ×10' },
      ],
      help: 'On a linear scale the fast-growing curves flatten everything else. A log scale keeps them all in view.',
    },
    {
      kind: 'choice',
      key: 'speed',
      label: 'Computer speed',
      options: [
        { value: '1e9', label: 'A billion steps a second' },
        { value: '1e6', label: 'A million steps a second' },
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
      label: 'n',
      placeholder: `1 to ${MAX_N.toLocaleString('en-US')}`,
      maxLength: 9,
      sample: '16',
      parse: parseN,
    },
    buttons: [
      { op: 'setn', label: 'Set n', usesInput: true, primary: true },
      { op: 'double', label: 'Double n', usesInput: false },
      { op: 'inc', label: 'n + 1', usesInput: false },
      { op: 'halve', label: 'Halve n', usesInput: false },
      ...FNS.map((f) => ({
        op: `show-${f}`,
        label: `Show or hide ${FN_LABEL[f]}`,
        usesInput: false,
        more: true,
      })),
    ],
    presets: [
      { label: 'Small n', make: (_rng, size) => [['setn', size]] },
      { label: 'n in the thousands', make: (_rng, size) => [['setn', size * 1000]] },
      { label: 'Random n up to 100', make: (rng) => [['setn', rng.int(1, 100)]] },
      {
        label: 'Every curve, small n',
        make: (_rng, size) => [['show-1'], ['show-2n'], ['show-fact'], ['setn', size]],
      },
    ],
    sizes: [4, 8, 16],
  },
  explain,
  complexity: [
    {
      op: 'binary search in a sorted array',
      best: { cost: 'O(1)', why: 'The middle item is the one you want.' },
      average: {
        cost: 'O(log n)',
        why: 'Each probe halves what is left: a million items take about 20.',
        example: 'constant-and-log',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Halve until one item is left.',
        example: 'constant-and-log',
      },
    },
    {
      op: 'linear search',
      best: { cost: 'O(1)', why: 'The first item matches.' },
      average: {
        cost: 'O(n)',
        why: 'About half the items, and half of n is still O(n).',
        example: 'doubling-n',
      },
      worst: { cost: 'O(n)', why: 'Every item, when the value is missing.', example: 'doubling-n' },
    },
    {
      op: 'merge sort',
      best: {
        cost: 'O(n log n)',
        why: 'log n levels of merging, n items per level.',
        example: 'doubling-n',
      },
      average: { cost: 'O(n log n)', why: 'It does the same splits whatever the order.' },
      worst: {
        cost: 'O(n log n)',
        why: 'Doubling n a bit more than doubles the time.',
        example: 'doubling-n',
      },
    },
    {
      op: 'insertion sort',
      best: { cost: 'O(n)', why: 'Already sorted: one comparison per item.' },
      average: {
        cost: 'O(n²)',
        why: 'Each item moves past about half of the others.',
        example: 'quadratic-wall',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Reverse order: a million items take minutes, not milliseconds.',
        example: 'quadratic-wall',
      },
    },
    {
      op: 'trying every subset of n items',
      best: {
        cost: 'Θ(2ⁿ)',
        why: 'There are 2ⁿ subsets to look at.',
        example: 'exponential-explodes',
      },
      average: {
        cost: 'Θ(2ⁿ)',
        why: 'One more item doubles the work.',
        example: 'exponential-explodes',
      },
      worst: {
        cost: 'Θ(2ⁿ)',
        why: 'n = 60 already takes decades.',
        example: 'exponential-explodes',
      },
    },
    {
      op: 'trying every order of n items',
      best: { cost: 'Θ(n!)', why: 'There are n! orders.', example: 'factorial' },
      average: {
        cost: 'Θ(n!)',
        why: 'Going from n to n + 1 multiplies the work by n + 1.',
        example: 'factorial',
      },
      worst: { cost: 'Θ(n!)', why: 'n = 20 is 2.4 × 10^18 orders.', example: 'factorial' },
      note: 'Small n can hide all of this: n² beats 2ⁿ at n = 3 (example: small-n-crossover).',
    },
  ],
  practice: bigOPractice(() => bigOLab),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LabSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    doublingN,
    constantAndLog,
    quadraticWall,
    exponentialExplodes,
    smallNCrossover,
    factorial,
    logScale,
  ] as unknown as SavedExample[],
  preview: { example: 'small-n-crossover', level: 2 },
};

/** Counts the drivers can reach by looping without taking long. */
const DRIVER_LIMIT = 20_000n;

/**
 * Driver protocol for the code tabs: "count quadratic 16" runs that loop and prints its step
 * count. After every operation, each curve shown whose count is small enough to loop through
 * is counted and must match the bar.
 */
function codeScript(calls: OpCall[], settings: LabSettings) {
  const t = new Timeline(bigOLab, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    for (const f of e.end.shown) {
      const c = count(f, e.end.n).exact;
      if (c === null || c > DRIVER_LIMIT) continue;
      input.push(`count ${FN_CODE[f]} ${e.end.n}`);
      expected.push(c.toString());
    }
  }
  return { input, expected };
}

export default bigOLab;
