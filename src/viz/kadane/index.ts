import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/kadane.hpp?raw';
import javaSource from './code/java/Kadane.java?raw';
import pythonSource from './code/python/kadane.py?raw';
import allNegative from './examples/all-negative.json';
import allPositive from './examples/all-positive.json';
import emptyAllowed from './examples/empty-allowed.json';
import everyPair from './examples/every-pair.json';
import extendOrRestart from './examples/extend-or-restart.json';
import tieAtZero from './examples/tie-at-zero.json';
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
  type KExtra,
  type KSettings,
  type KState,
} from './model';
import { kadanePractice } from './practice';
import { view } from './view';

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];
const solve = (vs: number[]): OpCall[] => [load(vs), ['find']];

function between(rng: Rng, n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

const presets: Preset[] = [
  { label: 'Random, some negative', make: (rng, n) => solve(between(rng, n, -6, 6)) },
  {
    label: 'All negative (the best is one value)',
    make: (rng, n) => solve(between(rng, n, -9, -1)),
  },
  {
    label: 'All positive (the whole array)',
    make: (rng, n) => solve(between(rng, n, 1, 9)),
  },
  {
    label: 'Sorted, negatives first',
    make: (rng, n) => solve(between(rng, n, -6, 6).sort((x, y) => x - y)),
  },
  {
    label: 'Two good runs and a dip between them',
    make: (rng, n) => {
      const third = Math.max(1, Math.floor(n / 3));
      const vs = [
        ...between(rng, third, 1, 6),
        ...between(rng, n - 2 * third, -6, -1),
        ...between(rng, third, 1, 6),
      ];
      return solve(vs);
    },
  },
  {
    label: 'Small values, many ties',
    make: (rng, n) => solve(between(rng, n, -1, 1)),
  },
  {
    label: 'Alternating signs',
    make: (rng, n) =>
      solve(Array.from({ length: n }, (_, i) => (i % 2 ? -1 : 1) * rng.int(1, 6))),
  },
];

export const kadane: VizDef<KState, KSettings, KExtra> = {
  id: 'kadane',
  title: "Kadane's maximum subarray",
  family: 'Array and string tricks',
  blurb:
    'The subarray with the largest sum in one pass: at each value, extend the run so far or restart, and keep the best. O(n) against O(n²) for every pair of ends, and it hands back where the subarray is, not just its sum.',
  settings: [
    approachSetting({
      pattern: 'Extend or restart (Kadane), O(n)',
      naive: 'Every pair of ends, O(n²)',
    }),
    {
      kind: 'boolean',
      key: 'empty',
      label: 'Allow the empty subarray (sum 0)',
      help: 'Off, a subarray has at least one value, so an all-negative array gives its largest value. On, the empty subarray counts, so the answer is never below 0.',
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
      placeholder: 'e.g. 3 -4 5 -2 6',
      maxLength: 80,
      sample: '3 -4 5',
      parse: parseInput,
    },
    buttons: [
      { op: 'find', label: 'Max subarray', usesInput: false },
      { op: 'load', label: 'Load', usesInput: true, primary: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => solve(between(rng, 9, -6, 6)),
    },
    presets,
    sizes: [6, 8, 10, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'max subarray, extend or restart',
      best: {
        cost: 'Θ(n)',
        why: 'One pass whatever the values: one addition and two comparisons per value.',
        example: 'all-positive',
      },
      average: {
        cost: 'Θ(n)',
        why: 'The same pass; restarting costs nothing extra.',
        example: 'extend-or-restart',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'All negative: a restart at every value, still one step each.',
        example: 'all-negative',
      },
      note: 'It has to look at every value: one you skip might be a huge positive.',
    },
    {
      op: 'max subarray, every pair of ends',
      best: {
        cost: 'Θ(n²)',
        why: 'n(n + 1)/2 sums whatever the values: every start, every end.',
        example: 'every-pair',
      },
      average: { cost: 'Θ(n²)', why: 'The loops never stop early.' },
      worst: {
        cost: 'Θ(n²)',
        why: '9 values: 45 sums and 45 comparisons, against 9 and 18 for one pass.',
        example: 'every-pair',
      },
      note: 'Adding up each subarray from scratch, instead of extending the sum, would be Θ(n³).',
    },
    {
      op: 'extra space',
      best: { cost: 'O(1)', why: 'The pass keeps run, best and three indices.' },
      average: { cost: 'O(1)', why: 'Nothing grows with n.', example: 'extend-or-restart' },
      worst: {
        cost: 'O(1)',
        why: 'Even the subarray is just two indices, lo and hi.',
        example: 'tie-at-zero',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const s = settings as KSettings;
      const t = new Timeline(kadane, s, 1, calls);
      const input = [`load ${t.initial.state.a.join(' ')}`];
      const expected: string[] = [];
      for (const e of t.entries) {
        const v = e.steps.at(-1)!.vars ?? {};
        if (e.call[0] === 'load') {
          if (typeof readValues(e.call[1]) !== 'string') input.push(`load ${e.end.a.join(' ')}`);
        } else if (e.call[0] === 'find' && v.lo !== undefined) {
          input.push(s.empty ? 'max_or_empty' : 'max');
          expected.push(`${v.best} ${v.lo} ${v.hi}`);
        }
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    extendOrRestart,
    everyPair,
    allNegative,
    emptyAllowed,
    tieAtZero,
    allPositive,
  ] as unknown as SavedExample[],
  practice: kadanePractice(() => kadane),
  preview: { example: 'extend-or-restart', level: 2 },
};

export default kadane;
