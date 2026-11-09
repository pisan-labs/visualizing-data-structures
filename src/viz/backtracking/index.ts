import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/backtracking.hpp?raw';
import javaSource from './code/java/Backtracking.java?raw';
import pythonSource from './code/python/backtracking.py?raw';
import oneValue from './examples/one-value.json';
import outOfReach from './examples/out-of-reach.json';
import permutationsFour from './examples/permutations-four.json';
import permutationsThree from './examples/permutations-three.json';
import subsetsThree from './examples/subsets-three.json';
import targetSum from './examples/target-sum.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_TARGET,
  MAX_VALUES,
  ops,
  pseudocode,
  readValues,
  type BtSettings,
  type BtState,
} from './model';
import { backtrackingPractice } from './practice';
import { view } from './view';

/** "1 2 3": the whole box is one value, checked here so mistakes show up at once. */
export function parseValues(token: string): Value | Error {
  const values = readValues(token);
  if (!values) return new Error(`Type 1 to ${MAX_VALUES} values from 1 to 9, such as 1 2 3.`);
  return values.join(' ');
}

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1).join(' ');

export const backtracking: VizDef<BtState, BtSettings, undefined> = {
  id: 'backtracking',
  title: 'Backtracking (subsets, permutations)',
  family: 'Recursion',
  blurb:
    'Choose, explore, unchoose: list every subset or every order, and prune branches that cannot work.',
  settings: [
    {
      kind: 'choice',
      key: 'problem',
      label: 'Generate',
      options: [
        { value: 'subsets', label: 'Subsets: take or skip each value' },
        { value: 'permutations', label: 'Permutations: pick the next unused value' },
      ],
    },
    {
      kind: 'number',
      key: 'target',
      label: 'Target sum for subsets (0 for none)',
      min: 0,
      max: MAX_TARGET,
      help: 'With a target, the search lists only the subsets with that sum, and prunes a branch as soon as its sum is too big or can no longer reach the target.',
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
      label: 'Values',
      placeholder: 'e.g. 1 2 3 (up to 4, from 1 to 9)',
      maxLength: 20,
      sample: '1 2 3',
      parse: parseValues,
    },
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'load', label: 'Load without running', usesInput: true, more: true },
    ],
    presets: [
      { label: 'The values 1 to n', make: (_rng, size) => [['run', upTo(size)]] },
      {
        label: 'Random values',
        make: (rng, size) => [
          ['run', Array.from({ length: size }, () => String(rng.int(1, 9))).join(' ')],
        ],
      },
      { label: 'A repeated value', make: (_rng, size) => [['run', `1 ${upTo(size - 1)}`]] },
      { label: 'One value', make: () => [['run', '5']] },
    ],
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'Every subset of n values: time',
      best: {
        cost: 'Θ(n · 2ⁿ)',
        why: '2ⁿ subsets, each copied out in up to n steps, from 2ⁿ⁺¹ - 1 calls.',
        example: 'one-value',
      },
      average: {
        cost: 'Θ(n · 2ⁿ)',
        why: 'Every call makes two more until all n values are decided.',
        example: 'subsets-three',
      },
      worst: {
        cost: 'Θ(n · 2ⁿ)',
        why: 'The output alone has 2ⁿ subsets, so nothing can do better.',
        example: 'subsets-three',
      },
    },
    {
      op: 'Every permutation of n values: time',
      best: {
        cost: 'Θ(n · n!)',
        why: 'n! orders, each copied out in n steps.',
        example: 'permutations-three',
      },
      average: {
        cost: 'Θ(n · n!)',
        why: 'The tree fans out n, then n - 1, then n - 2 ways, down to 1.',
        example: 'permutations-three',
      },
      worst: {
        cost: 'Θ(n · n!)',
        why: '4 values already take 65 calls for 24 orders.',
        example: 'permutations-four',
      },
      note: 'Each call also scans the n values for unused ones, which adds a factor of n to the calls.',
    },
    {
      op: 'Subsets with a target sum, pruned: time',
      best: {
        cost: 'O(1)',
        why: 'If all the values together cannot reach the target, the first call stops.',
        example: 'out-of-reach',
      },
      average: {
        cost: 'O(n · 2ⁿ)',
        why: 'Pruning cuts whole subtrees, often most of the tree, but it promises nothing.',
        example: 'target-sum',
      },
      worst: {
        cost: 'O(n · 2ⁿ)',
        why: 'A target that many branches can still reach leaves little to prune.',
        example: 'target-sum',
      },
    },
    {
      op: 'Stack depth',
      best: { cost: 'O(1)', why: 'A pruned first call is one frame.', example: 'out-of-reach' },
      average: {
        cost: 'O(n)',
        why: 'One frame per decision on the path from the top to a leaf.',
        example: 'subsets-three',
      },
      worst: {
        cost: 'O(n)',
        why: 'n decisions deep, plus the first call.',
        example: 'permutations-four',
      },
      note: 'The chosen list is one more O(n): the search reuses it, so it never copies more than one path.',
    },
  ],
  practice: backtrackingPractice(() => backtracking),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BtSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    subsetsThree,
    oneValue,
    permutationsThree,
    permutationsFour,
    targetSum,
    outOfReach,
  ] as unknown as SavedExample[],
  opening: 'subsets-three',
  preview: { example: 'subsets-three', level: 2 },
};

/**
 * Driver protocol for the code tabs: "subsets 1 2 3", "target 5 1 2 3 4" or "permutations 1 2 3"
 * prints the outputs in the order the search finds them, such as "[1,2] [1] [2] []". Loads and
 * rejected calls print nothing, so they are left out.
 */
function codeScript(calls: OpCall[], settings: BtSettings) {
  const t = new Timeline(backtracking, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    // A rejected call hands back the state it was given.
    const ran = e.call[0] === 'run' && e.end !== before && e.end.run !== null;
    before = e.end;
    if (!ran || e.end.run === null) continue;
    const run = e.end.run;
    const values = e.end.values.join(' ');
    input.push(
      run.problem === 'permutations'
        ? `permutations ${values}`
        : run.target > 0
          ? `target ${run.target} ${values}`
          : `subsets ${values}`,
    );
    expected.push(e.end.found.map((xs) => `[${xs.join(',')}]`).join(' '));
  }
  return { input, expected };
}

export default backtracking;
