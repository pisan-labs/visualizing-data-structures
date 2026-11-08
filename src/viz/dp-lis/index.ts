import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/lis.hpp?raw';
import javaSource from './code/java/Lis.java?raw';
import pythonSource from './code/python/lis.py?raw';
import decreasing from './examples/decreasing.json';
import duplicates from './examples/duplicates.json';
import increasing from './examples/increasing.json';
import lengthFour from './examples/length-four.json';
import patience from './examples/patience.json';
import tailsNotLis from './examples/tails-not-lis.json';
import twelve from './examples/twelve.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pseudocode,
  valuesFromArg,
  type LisExtra,
  type LisSettings,
  type LisState,
} from './model';
import { lisPractice, randomSequence } from './practice';
import { view } from './view';

export function parseSequence(text: string): Value | Error {
  const a = valuesFromArg(text);
  if (typeof a === 'string') return new Error(a);
  return a.join(' ');
}

const solve = (a: number[]): OpCall[] => [['values', a.join(' ')], ['fill'], ['trace']];

export const dpLis: VizDef<LisState, LisSettings, LisExtra> = {
  id: 'dp-lis',
  title: 'Longest increasing subsequence',
  family: 'Dynamic programming',
  blurb:
    'The longest run of values that keep rising, from an O(n²) table of run lengths or from binary search over the smallest tails.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'quadratic', label: 'O(n²) table: compare every earlier value' },
        { value: 'tails', label: 'O(n log n): binary search over tails (patience sorting)' },
      ],
      help: 'Both find the same length. The walk back can find a different subsequence.',
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
      label: 'Sequence',
      placeholder: 'e.g. 5 2 8 6 3 6 9 7',
      maxLength: 48,
      sample: '5 2 8 6 3 6 9 7',
      parse: parseSequence,
    },
    buttons: [
      { op: 'values', label: 'Set sequence', usesInput: true, primary: true },
      { op: 'fill', label: 'Fill the table', usesInput: false },
      { op: 'trace', label: 'Trace back', usesInput: false },
    ],
    random: { label: 'Random sequence', make: (rng) => solve(randomSequence(rng, rng.int(6, 10))) },
    presets: [
      { label: 'Random', make: (rng, size) => solve(randomSequence(rng, Math.min(size, MAX_N))) },
      {
        label: 'Sorted (the LIS is everything)',
        make: (rng, size) =>
          solve(randomSequence(rng, Math.min(size, MAX_N)).sort((x, y) => x - y)),
      },
      {
        label: 'Reverse sorted (length 1)',
        make: (rng, size) =>
          solve(randomSequence(rng, Math.min(size, MAX_N)).sort((x, y) => y - x)),
      },
      {
        label: 'Nearly sorted',
        make: (rng, size) => {
          const a = Array.from({ length: Math.min(size, MAX_N) }, (_, k) => 3 * k + 2);
          for (let s = 0; s < 2; s++) {
            const i = rng.int(0, a.length - 2);
            [a[i], a[i + 1]] = [a[i + 1]!, a[i]!];
          }
          return solve(a);
        },
      },
      {
        label: 'Many duplicates',
        make: (rng, size) => solve(randomSequence(rng, Math.min(size, MAX_N), 4)),
      },
    ],
    sizes: [6, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'length (O(n²) table)',
      best: {
        cost: 'Θ(n²)',
        why: 'Every pair is compared, even when the sequence is sorted.',
        example: 'increasing',
      },
      average: { cost: 'Θ(n²)', why: 'n(n − 1)/2 comparisons.', example: 'length-four' },
      worst: { cost: 'Θ(n²)', why: '12 values: 66 comparisons.', example: 'twelve' },
    },
    {
      op: 'length (binary search over tails)',
      best: {
        cost: 'Θ(n)',
        why: 'Decreasing: tails stays one long, so each search is one comparison.',
      },
      average: {
        cost: 'O(n log n)',
        why: 'One binary search per value over a sorted tails array.',
        example: 'patience',
      },
      worst: {
        cost: 'Θ(n log n)',
        why: 'Increasing: tails grows to n, and the searches add up to about n log₂ n.',
      },
    },
    {
      op: 'trace back',
      best: { cost: 'O(1)', why: 'Length 1: one step.', example: 'decreasing' },
      average: { cost: 'O(L)', why: 'One step per value of the LIS.' },
      worst: { cost: 'O(n)', why: 'The whole sequence increases.', example: 'increasing' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LisSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lengthFour,
    patience,
    tailsNotLis,
    decreasing,
    increasing,
    duplicates,
    twelve,
  ] as unknown as SavedExample[],
  practice: lisPractice(() => dpLis),
  preview: { example: 'length-four', level: 2 },
};

/**
 * Driver protocol for the code tabs: "table a1 ..." or "tails a1 ..." (the method in the
 * settings) prints the length and the subsequence the walk back finds (after Trace back).
 */
function codeScript(calls: OpCall[], settings: LisSettings) {
  const t = new Timeline(dpLis, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    if (e.call[0] === 'trace' && vars.lis !== undefined) {
      input.push(`${settings.method === 'tails' ? 'tails' : 'table'} ${e.end.a.join(' ')}`);
      expected.push(`${String(vars.length)} ${String(vars.lis)}`);
    }
  }
  return { input, expected };
}

export default dpLis;
