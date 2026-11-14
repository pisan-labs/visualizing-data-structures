import { Timeline } from '../../engine/timeline';
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/combination_sum.hpp?raw';
import javaSource from './code/java/CombinationSum.java?raw';
import pythonSource from './code/python/combination_sum.py?raw';
import eachOnce from './examples/each-once.json';
import everyList from './examples/every-list.json';
import everySubset from './examples/every-subset.json';
import manyWays from './examples/many-ways.json';
import nothingFits from './examples/nothing-fits.json';
import repeatsSkipped from './examples/repeats-skipped.json';
import sortAndPrune from './examples/sort-and-prune.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_VALUES,
  ops,
  parseInput,
  pseudocode,
  type CSExtra,
  type CSSettings,
  type CSState,
} from './model';
import { combinationPractice } from './practice';
import { view } from './view';

const solve = (vs: number[], target: number): OpCall[] => [
  ['load', vs.join(' ')],
  ['search', target],
];

const values = (rng: Rng, n: number, lo = 2, hi = 9) =>
  Array.from({ length: n }, () => rng.int(lo, hi));

/** A target that some combination can make up: a few of the values added together. */
function reachable(rng: Rng, vs: number[]): number {
  let t = 0;
  for (let k = 0; k < 2 + rng.int(0, 1); k++) t += vs[rng.int(0, vs.length - 1)]!;
  return Math.min(t, 16);
}

const presets: Preset[] = [
  {
    label: 'Random candidates',
    make: (rng, n) => {
      const vs = values(rng, n);
      return solve(vs, reachable(rng, vs));
    },
  },
  {
    label: 'Repeated values (try each once)',
    make: (rng, n) => {
      const base = values(rng, Math.max(1, Math.ceil(n / 2)), 1, 5);
      const vs = [...base, ...base].slice(0, n);
      return solve(vs, reachable(rng, vs));
    },
  },
  {
    label: 'Sorted, smallest first',
    make: (rng, n) => {
      const vs = values(rng, n).sort((a, b) => a - b);
      return solve(vs, reachable(rng, vs));
    },
  },
  {
    label: 'Reverse sorted',
    make: (rng, n) => {
      const vs = values(rng, n).sort((a, b) => b - a);
      return solve(vs, reachable(rng, vs));
    },
  },
  {
    label: 'Nothing fits: every candidate is bigger than the target',
    make: (rng, n) => solve(values(rng, n, 6, 9), 5),
  },
  {
    label: 'Small candidates: many ways (worst case)',
    make: (_rng, n) =>
      solve(
        Array.from({ length: Math.min(n, 3) }, (_, i) => i + 1),
        6,
      ),
  },
];

export const combinationSum: VizDef<CSState, CSSettings, CSExtra> = {
  id: 'combination-sum',
  title: 'Combination sum (backtracking)',
  family: 'Search templates',
  blurb:
    'List every combination of candidates that adds up to a target, each used again or only once. Sort first, and a loop can stop at the first candidate bigger than what is left; at each depth try a repeated value only once.',
  settings: [
    approachSetting({
      pattern: 'Sorted backtracking, pruned',
      naive: 'Every list, then check its sum',
    }),
    {
      kind: 'choice',
      key: 'reuse',
      label: 'Each candidate',
      options: [
        { value: 'again', label: 'Can be used again' },
        { value: 'once', label: 'Can be used once' },
      ],
      help: 'Used again, repeated candidates add nothing and are dropped. Used once, a value typed twice may be used twice, and equal values are tried once at each depth.',
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
      label: 'Target, or candidates',
      placeholder: 'e.g. 10, or 7 3 5 4 to load',
      maxLength: 40,
      sample: '10',
      parse: parseInput,
    },
    buttons: [
      { op: 'search', label: 'Search', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random candidates',
      make: (rng) => {
        const vs = values(rng, 4);
        return solve(vs, reachable(rng, vs));
      },
    },
    presets,
    sizes: [2, 3, 4, MAX_VALUES],
  },
  explain,
  complexity: [
    {
      op: 'Sorted backtracking, each again',
      best: {
        cost: 'O(n log n)',
        why: 'The smallest candidate is bigger than the target: one call, and the loop stops at once.',
        example: 'nothing-fits',
      },
      average: {
        cost: 'O(n · C)',
        why: 'Pruning keeps the tree close to the C calls that lead somewhere; 14 calls for 3 combinations of 10.',
        example: 'sort-and-prune',
      },
      worst: {
        cost: 'exponential in t / min(c)',
        why: 'With small candidates there are many combinations, and each one is a path through the tree: 1, 2 and 3 make 5 in 5 ways.',
        example: 'many-ways',
      },
      note: 'C is the number of calls; a combination can be t / min(c) values long, which bounds the depth.',
    },
    {
      op: 'Every list, then check',
      best: {
        cost: 'O(Π (t / cᵢ + 1))',
        why: 'No list is checked before it is complete, so even a hopeless target builds them all.',
      },
      average: {
        cost: 'O(Π (t / cᵢ + 1))',
        why: 'Every count of every candidate: 125 calls for 7, 3, 5, 4 and 10, against 14 when sorted and pruned.',
        example: 'every-list',
      },
      worst: {
        cost: 'O(2ⁿ) used once',
        why: 'Used once, every subset: 63 calls for 5 candidates, and equal values find some lists twice.',
        example: 'every-subset',
      },
    },
    {
      op: 'Sorted backtracking, each once',
      best: {
        cost: 'O(n log n)',
        why: 'Sorting dominates when the first candidate is already too big.',
      },
      average: {
        cost: 'O(n · C)',
        why: 'Each call scans its candidates until one is too big; repeats are skipped at once.',
        example: 'repeats-skipped',
      },
      worst: {
        cost: 'O(n · 2ⁿ)',
        why: 'At most one call per subset, each copying up to n values when it outputs.',
        example: 'each-once',
      },
    },
    {
      op: 'Stack depth',
      best: { cost: 'O(1)', why: 'Nothing fits: one call.', example: 'nothing-fits' },
      average: {
        cost: 'O(t / min(c))',
        why: 'Each call adds a candidate of at least min(c), so the path is at most t / min(c) long.',
        example: 'sort-and-prune',
      },
      worst: {
        cost: 'O(t)',
        why: 'With 1 among the candidates, a combination can be t ones long.',
        example: 'many-ways',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      // The code is sorted backtracking, whatever the approach shown.
      const s = { ...(settings as CSSettings), approach: 'pattern' as const };
      const t = new Timeline(combinationSum, s, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        if (e.call[0] !== 'search') continue;
        const last = e.steps.at(-1)!;
        if (!last.extra) continue;
        input.push(`${s.reuse} ${last.vars?.target} ${e.end.values.join(' ')}`);
        const found = last.extra.found;
        expected.push(found.length ? found.map((f) => `[${f.join(',')}]`).join(' ') : 'none');
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sortAndPrune,
    everyList,
    repeatsSkipped,
    everySubset,
    eachOnce,
    nothingFits,
    manyWays,
  ] as unknown as SavedExample[],
  practice: combinationPractice(() => combinationSum),
  preview: { example: 'sort-and-prune', level: 2, hide: ['title', 'c-', 'chosen', 'sum', 'found'] },
};

export default combinationSum;
