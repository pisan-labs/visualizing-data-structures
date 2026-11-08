import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/subset_sum.hpp?raw';
import javaSource from './code/java/SubsetSum.java?raw';
import pythonSource from './code/python/subset_sum.py?raw';
import allEven from './examples/all-even.json';
import largest from './examples/largest.json';
import makeNine from './examples/make-nine.json';
import needsAll from './examples/needs-all.json';
import rowByRow from './examples/row-by-row.json';
import zeroTarget from './examples/zero-target.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_ITEMS,
  MAX_TARGET,
  numbersFromArg,
  ops,
  pseudocode,
  type SubsetExtra,
  type SubsetSettings,
  type SubsetState,
} from './model';
import { randomNumbers, subsetPractice } from './practice';
import { view } from './view';

/** The input box holds the numbers, or one target. */
export function parseSubset(text: string): Value | Error {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 1 && /^\d+$/.test(tokens[0]!) && Number(tokens[0]) <= MAX_TARGET)
    return Number(tokens[0]);
  const xs = numbersFromArg(tokens.join(' '));
  if (typeof xs === 'string') return new Error(xs);
  return xs.join(' ');
}

const solve = (xs: number[], T: number): OpCall[] => [
  ['numbers', xs.join(' ')],
  ['target', T],
  ['fill'],
  ['trace'],
];

export const dpSubsetSum: VizDef<SubsetState, SubsetSettings, SubsetExtra> = {
  id: 'dp-subset-sum',
  title: 'Subset sum',
  family: 'Dynamic programming',
  blurb:
    'Do some of the numbers add up to exactly T? A table of true and false for every prefix of the numbers and every sum.',
  settings: [],
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
      label: 'Numbers or target',
      placeholder: 'e.g. 3 4 5 2, or 9',
      maxLength: 40,
      sample: '3 4 5 2',
      parse: parseSubset,
    },
    buttons: [
      { op: 'numbers', label: 'Set numbers', usesInput: true, primary: true },
      { op: 'target', label: 'Target', usesInput: true },
      { op: 'fill', label: 'Fill the table', usesInput: false },
      { op: 'trace', label: 'Trace back', usesInput: false },
      { op: 'row', label: 'Fill one row', usesInput: false, more: true },
    ],
    random: {
      label: 'Random numbers',
      make: (rng) => solve(randomNumbers(rng, rng.int(3, 5)), rng.int(6, MAX_TARGET)),
    },
    presets: [
      {
        label: 'Random numbers',
        make: (rng, size) =>
          solve(randomNumbers(rng, Math.min(size, MAX_ITEMS)), rng.int(6, MAX_TARGET)),
      },
      {
        label: 'All even, odd target (no subset)',
        make: (rng, size) =>
          solve(
            Array.from({ length: Math.min(size, MAX_ITEMS) }, () => 2 * rng.int(1, 7)),
            2 * rng.int(2, 6) + 1,
          ),
      },
      {
        label: 'Powers of two (exactly one subset)',
        make: (rng, size) =>
          solve(
            [1, 2, 4, 8].slice(0, Math.min(size, 4)),
            rng.int(1, Math.min(14, 2 ** Math.min(size, 4) - 1)),
          ),
      },
      {
        label: 'Every number needed',
        make: (rng, size) => {
          const xs = randomNumbers(rng, Math.min(size, 4), 3);
          return solve(
            xs,
            xs.reduce((a, b) => a + b, 0),
          );
        },
      },
      {
        label: 'Largest table (the most work)',
        make: (rng) => solve(randomNumbers(rng, MAX_ITEMS, 12), MAX_TARGET),
      },
    ],
    sizes: [3, 4, 5, 6],
  },
  explain,
  complexity: [
    {
      op: 'fill the table',
      best: {
        cost: 'Θ(nT)',
        why: 'Every cell is filled, even when the answer is plainly no.',
        example: 'all-even',
      },
      average: {
        cost: 'Θ(nT)',
        why: 'Each cell reads at most two cells in the row above.',
        example: 'make-nine',
      },
      worst: {
        cost: 'Θ(nT)',
        why: '6 numbers and target 14: 105 cells, each O(1).',
        example: 'largest',
      },
      note: 'Pseudo-polynomial: T is a value. Writing T takes about log₂ T bits, so the table is exponential in the size of the input. Space Θ(nT), or Θ(T) for the yes or no alone.',
    },
    {
      op: 'trace back',
      best: { cost: 'O(1)', why: 'S[n][T] = F: nothing to walk.', example: 'all-even' },
      average: { cost: 'O(n)', why: 'One step per row.' },
      worst: { cost: 'O(n)', why: 'Still one step per number.', example: 'needs-all' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SubsetSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    makeNine,
    allEven,
    needsAll,
    rowByRow,
    largest,
    zeroTarget,
  ] as unknown as SavedExample[],
  practice: subsetPractice(() => dpSubsetSum),
  preview: { example: 'make-nine', level: 2 },
};

/**
 * Driver protocol for the code tabs: "can T x1 ..." prints true or false (after Fill the table);
 * "subset T x1 ..." prints true and the numbers the walk back takes, or false (after Trace back).
 */
function codeScript(calls: OpCall[], settings: SubsetSettings) {
  const t = new Timeline(dpSubsetSum, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    const problem = `${e.end.T} ${e.end.xs.join(' ')}`;
    if (e.call[0] === 'fill' && vars.found !== undefined) {
      input.push(`can ${problem}`);
      expected.push(String(vars.found));
    } else if (e.call[0] === 'trace' && vars.found !== undefined) {
      input.push(`subset ${problem}`);
      expected.push(`${String(vars.found)} ${String(vars.subset)}`.trim());
    }
  }
  return { input, expected };
}

export default dpSubsetSum;
