import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/prefix_sums.hpp?raw';
import javaSource from './code/java/PrefixSums.java?raw';
import pythonSource from './code/python/prefix_sums.py?raw';
import balancedRun from './examples/balanced-run.json';
import countWithNegatives from './examples/count-with-negatives.json';
import equalRunningSums from './examples/equal-running-sums.json';
import everyPair from './examples/every-pair.json';
import longestKeepsFirst from './examples/longest-keeps-first.json';
import nothingSumsToK from './examples/nothing-sums-to-k.json';
import windowGivesUp from './examples/window-gives-up.json';
import zerosEverywhere from './examples/zeros-everywhere.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  parseInput,
  pseudocode,
  readValues,
  type PSExtra,
  type PSSettings,
  type PSState,
} from './model';
import { prefixPractice } from './practice';
import { view } from './view';

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];
const total = (vs: number[]) => vs.reduce((x, y) => x + y, 0);

function between(rng: Rng, n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

/** The sum of a random subarray, so at least one subarray has it. */
function someSum(rng: Rng, vs: number[]): number {
  const i = rng.int(0, vs.length - 1);
  const j = rng.int(i, vs.length - 1);
  return total(vs.slice(i, j + 1));
}

const presets: Preset[] = [
  {
    label: 'Random, some negative',
    make: (rng, n) => {
      const vs = between(rng, n, -4, 6);
      return [load(vs), ['find', someSum(rng, vs)]];
    },
  },
  {
    label: 'All positive (a sliding window works too)',
    make: (rng, n) => {
      const vs = between(rng, n, 1, 6);
      return [load(vs), ['find', someSum(rng, vs)]];
    },
  },
  {
    label: 'Sorted, negatives first',
    make: (rng, n) => {
      const vs = between(rng, n, -6, 6).sort((x, y) => x - y);
      return [load(vs), ['find', someSum(rng, vs)]];
    },
  },
  {
    label: 'Plus and minus: running sums repeat, k = 0',
    make: (rng, n) => {
      const vs = Array.from({ length: n }, (_, i) => (i % 2 ? -1 : 1) * rng.int(1, 3));
      return [load(vs), ['find', 0]];
    },
  },
  {
    label: 'All zeros, k = 0: every subarray counts',
    make: (_rng, n) => [load(Array(n).fill(0)), ['find', 0]],
  },
  {
    label: 'k is the whole array',
    make: (rng, n) => {
      const vs = between(rng, n, -4, 6);
      return [load(vs), ['find', total(vs)]];
    },
  },
  {
    label: 'No subarray sums to k',
    make: (rng, n) => {
      const vs = between(rng, n, 1, 5);
      return [load(vs), ['find', total(vs) + 1]];
    },
  },
];

export const prefixSumHashmap: VizDef<PSState, PSSettings, PSExtra> = {
  id: 'prefix-sum-hashmap',
  title: 'Prefix sums with a hash map',
  family: 'Array and string tricks',
  blurb:
    'Count the subarrays that sum to k in one pass: keep a running sum and a map of the running sums seen so far, and look up sum − k at each step. O(n) against O(n²) for every pair of ends, and negative values are fine.',
  settings: [
    approachSetting({
      pattern: 'Running sum and a hash map, O(n)',
      naive: 'Every pair of ends, O(n²)',
    }),
    {
      kind: 'choice',
      key: 'goal',
      label: 'Find',
      options: [
        { value: 'count', label: 'How many subarrays sum to k' },
        { value: 'longest', label: 'The longest subarray with sum k' },
      ],
      help: 'Counting keeps how often each running sum was seen; the longest keeps where it was first seen.',
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
      label: 'k, or values',
      placeholder: 'e.g. 3, or 2 3 -1 2 to load',
      maxLength: 80,
      sample: '3',
      parse: parseInput,
    },
    buttons: [
      { op: 'find', label: 'Find sum k', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => {
        const vs = between(rng, 8, -4, 6);
        return [load(vs), ['find', someSum(rng, vs)]];
      },
    },
    presets,
    sizes: [6, 8, 10, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'count, running sum and map',
      best: {
        cost: 'O(n)',
        why: 'One pass: n sums and 2n lookups, even when nothing matches.',
        example: 'nothing-sums-to-k',
      },
      average: {
        cost: 'O(n)',
        why: 'Each value costs one addition, one lookup of sum − k and one update.',
        example: 'count-with-negatives',
      },
      worst: {
        cost: 'O(n) expected',
        why: 'All zeros and k = 0: n(n + 1)/2 subarrays, still one pass. Only a hash map whose keys all collide makes it slow.',
        example: 'zeros-everywhere',
      },
      note: 'The answer itself can be n(n + 1)/2, but counting is not listing: the pass adds seen[sum − k] at once.',
    },
    {
      op: 'count, every pair of ends',
      best: {
        cost: 'Θ(n²)',
        why: 'n(n + 1)/2 sums whatever the values: every start, every end.',
        example: 'every-pair',
      },
      average: { cost: 'Θ(n²)', why: 'The same n(n + 1)/2 sums: the loops never stop early.' },
      worst: {
        cost: 'Θ(n²)',
        why: '8 values: 36 sums, against 8 sums and 16 lookups for the pattern.',
        example: 'every-pair',
      },
      note: 'Recomputing each sum from scratch instead of extending it would be Θ(n³).',
    },
    {
      op: 'longest, running sum and map',
      best: { cost: 'O(n)', why: 'One pass, the same as counting.' },
      average: {
        cost: 'O(n)',
        why: 'One lookup of sum − k and at most one write per value.',
        example: 'longest-keeps-first',
      },
      worst: {
        cost: 'O(n) expected',
        why: 'The map only ever gets new keys; a repeated running sum costs one lookup.',
      },
    },
    {
      op: 'extra space',
      best: {
        cost: 'O(1)',
        why: 'Every pair of ends keeps only a sum and a count.',
        example: 'every-pair',
      },
      average: { cost: 'O(n)', why: 'The map holds each distinct running sum once.' },
      worst: {
        cost: 'O(n)',
        why: 'At most n + 1 running sums, all different.',
        example: 'window-gives-up',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const s = settings as PSSettings;
      const t = new Timeline(prefixSumHashmap, s, 1, calls);
      const input = [`load ${t.initial.state.a.join(' ')}`];
      const expected: string[] = [];
      for (const e of t.entries) {
        const v = e.steps.at(-1)!.vars ?? {};
        if (e.call[0] === 'load') {
          if (typeof readValues(e.call[1]) !== 'string') input.push(`load ${e.end.a.join(' ')}`);
        } else if (e.call[0] === 'find' && v.k !== undefined) {
          if (s.goal === 'longest') {
            input.push(`longest ${v.k}`);
            expected.push(`${v.best} ${v.start}`);
          } else {
            input.push(`count ${v.k}`);
            expected.push(String(v.count));
          }
        }
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    countWithNegatives,
    everyPair,
    longestKeepsFirst,
    balancedRun,
    equalRunningSums,
    windowGivesUp,
    zerosEverywhere,
    nothingSumsToK,
  ] as unknown as SavedExample[],
  practice: prefixPractice(() => prefixSumHashmap),
  preview: { example: 'count-with-negatives', level: 2, hide: ['f-', 'found-'] },
};

export default prefixSumHashmap;
