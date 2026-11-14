import { Timeline } from '../../engine/timeline';
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/search_answer.hpp?raw';
import javaSource from './code/java/SearchAnswer.java?raw';
import pythonSource from './code/python/search_answer.py?raw';
import aDayPerPackage from './examples/a-day-per-package.json';
import everyCapacityUpward from './examples/every-capacity-upward.json';
import everyGapUpward from './examples/every-gap-upward.json';
import everyPositionTaken from './examples/every-position-taken.json';
import oneTruckForEverything from './examples/one-truck-for-everything.json';
import shipInThreeDays from './examples/ship-in-three-days.json';
import spreadThreeItems from './examples/spread-three-items.json';
import twoItemsTakeTheEnds from './examples/two-items-take-the-ends.json';
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
  type BAExtra,
  type BASettings,
  type BAState,
  type Problem,
} from './model';
import { searchAnswerPractice } from './practice';
import { view } from './view';

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

const problemOf = (settings?: Settings): Problem =>
  settings?.problem === 'spread' ? 'spread' : 'ship';

function weights(rng: Rng, n: number, lo = 1, hi = 9): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

/** n different positions from 0 to `top`, sorted. */
function positions(rng: Rng, n: number, top = 30): number[] {
  const set = new Set<number>();
  while (set.size < n) set.add(rng.int(0, top));
  return [...set].sort((a, b) => a - b);
}

/** Load the values and search with d or k. */
const solve = (vs: number[], param: number): OpCall[] => [load(vs), ['search', param]];

/** A d (ship) or k (spread) in the middle of what makes sense for n values. */
const middle = (rng: Rng, n: number, problem: Problem) =>
  problem === 'ship' ? rng.int(2, Math.max(2, Math.ceil(n / 2))) : rng.int(2, Math.max(2, n - 1));

const presets: Preset[] = [
  {
    label: 'Random values',
    make: (rng, n, settings) => {
      const problem = problemOf(settings);
      const vs = problem === 'ship' ? weights(rng, n) : positions(rng, n);
      return solve(vs, middle(rng, n, problem));
    },
  },
  {
    label: 'Little room: d = 1 day, or k = 2 items (worst for trying upward)',
    make: (rng, n, settings) => {
      const problem = problemOf(settings);
      return problem === 'ship' ? solve(weights(rng, n), 1) : solve(positions(rng, n), 2);
    },
  },
  {
    label: 'Lots of room: d = n days, or k = n items (best for trying upward)',
    make: (rng, n, settings) => {
      const problem = problemOf(settings);
      return problem === 'ship' ? solve(weights(rng, n), n) : solve(positions(rng, n), n);
    },
  },
  {
    label: 'Sorted, smallest first',
    make: (rng, n, settings) => {
      const problem = problemOf(settings);
      const vs = problem === 'ship' ? weights(rng, n).sort((a, b) => a - b) : positions(rng, n);
      return solve(vs, middle(rng, n, problem));
    },
  },
  {
    label: 'All the same, or evenly spaced',
    make: (rng, n, settings) => {
      const problem = problemOf(settings);
      const step = rng.int(2, 5);
      const vs =
        problem === 'ship' ? Array(n).fill(step) : Array.from({ length: n }, (_, i) => i * step);
      return solve(vs, middle(rng, n, problem));
    },
  },
  {
    label: 'One heavy package, or one far position',
    make: (rng, n, settings) => {
      const problem = problemOf(settings);
      if (problem === 'ship') {
        const vs = weights(rng, n, 1, 4);
        vs[rng.int(0, n - 1)] = 20;
        return solve(vs, middle(rng, n, problem));
      }
      const vs = positions(rng, n - 1, 12);
      return solve([...vs, 50], middle(rng, n, problem));
    },
  },
];

export const binarySearchAnswer: VizDef<BAState, BASettings, BAExtra> = {
  id: 'binary-search-answer',
  title: 'Binary search on the answer',
  family: 'Search templates',
  blurb:
    'When the question is the smallest (or largest) value that works, and “does x work?” is a check that flips only once as x grows, binary search the answers instead of an array: about log₂ of the range in checks, against one check per answer.',
  settings: [
    approachSetting({
      pattern: 'Binary search the answers, O(n log range)',
      naive: 'Every answer upward, O(n · range)',
    }),
    {
      kind: 'choice',
      key: 'problem',
      label: 'Problem',
      options: [
        { value: 'ship', label: 'Smallest capacity that ships in d days' },
        { value: 'spread', label: 'Largest gap between k items' },
      ],
      help: 'Each problem keeps its own values. Load a list to change them, then search with d days or k items.',
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
      label: 'd or k, or values',
      placeholder: 'e.g. 3, or 4 7 2 6 to load',
      maxLength: 60,
      sample: '3',
      parse: parseInput,
    },
    buttons: [
      { op: 'search', label: 'Search', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => solve(weights(rng, 7), rng.int(2, 4)),
    },
    presets,
    sizes: [4, 6, 8, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'smallest capacity, binary search on the answer',
      best: {
        cost: 'O(n log S)',
        why: 'About log₂ S checks whatever the answer: d = 8 still takes 5. A check reads at most n packages.',
        example: 'a-day-per-package',
      },
      average: {
        cost: 'O(n log S)',
        why: 'The window of possible capacities halves with every check.',
        example: 'ship-in-three-days',
      },
      worst: {
        cost: 'O(n log S)',
        why: 'An answer at the very top costs no more: d = 1 takes 4 checks for 29 capacities.',
      },
      note: 'S = sum(w) − max(w) + 1, the number of capacities that could be the answer.',
    },
    {
      op: 'smallest capacity, every capacity upward',
      best: {
        cost: 'O(n)',
        why: 'With a day for each package, the heaviest one is the answer: one check.',
      },
      average: {
        cost: 'O(n · S)',
        why: 'One check per capacity from max(w) up to the answer.',
        example: 'every-capacity-upward',
      },
      worst: {
        cost: 'Θ(n · S)',
        why: 'd = 1: every capacity up to the total, 29 checks and 160 reads.',
        example: 'one-truck-for-everything',
      },
    },
    {
      op: 'largest gap, binary search on the answer',
      best: {
        cost: 'O(n log n + n log D)',
        why: 'Sorting the positions, then about log₂ D checks: k = 7 still takes 4.',
        example: 'every-position-taken',
      },
      average: {
        cost: 'O(n log n + n log D)',
        why: 'Each check is one greedy pass, and the window of gaps halves each time.',
        example: 'spread-three-items',
      },
      worst: {
        cost: 'O(n log n + n log D)',
        why: 'An answer at the top costs no more: k = 2 takes 5 checks for 23 gaps.',
      },
      note: 'D = p[n − 1] − p[0], the widest any gap can be.',
    },
    {
      op: 'largest gap, every gap upward',
      best: {
        cost: 'O(n)',
        why: 'k = n: every position is taken, and the first check, at 2, fails.',
      },
      average: {
        cost: 'O(n · D)',
        why: 'One check per gap until one fails.',
        example: 'every-gap-upward',
      },
      worst: {
        cost: 'Θ(n · D)',
        why: 'k = 2: every gap up to the whole span works, 22 checks and 109 reads.',
        example: 'two-items-take-the-ends',
      },
      note: 'Sorting first adds O(n log n) to both ways.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const s = settings as BASettings;
      const t = new Timeline(binarySearchAnswer, s, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        if (e.call[0] !== 'search') continue;
        const v = e.steps.at(-1)!.vars ?? {};
        if (v.answer === undefined) continue;
        const param = s.problem === 'spread' ? v.k : v.d;
        const values = s.problem === 'spread' ? e.end.p : e.end.w;
        input.push(`${s.problem} ${param} ${values.join(' ')}`);
        expected.push(String(v.answer));
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    shipInThreeDays,
    everyCapacityUpward,
    oneTruckForEverything,
    aDayPerPackage,
    spreadThreeItems,
    everyGapUpward,
    twoItemsTakeTheEnds,
    everyPositionTaken,
  ] as unknown as SavedExample[],
  practice: searchAnswerPractice(() => binarySearchAnswer),
  preview: { example: 'ship-in-three-days', level: 2, hide: ['heading', 'try-', 'tried-'] },
};

export default binarySearchAnswer;
