import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/assignment.hpp?raw';
import javaSource from './code/java/Assignment.java?raw';
import pythonSource from './code/python/assignment.py?raw';
import allTies from './examples/all-ties.json';
import cheapestFirst from './examples/cheapest-first.json';
import everyOrder from './examples/every-order.json';
import fourWorkers from './examples/four-workers.json';
import oneWorker from './examples/one-worker.json';
import twoWorkers from './examples/two-workers.json';
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
  readCosts,
  solveDP,
  START,
  tableText,
  type AssignExtra,
  type AssignSettings,
  type AssignState,
} from './model';
import { assignPractice, randomCosts } from './practice';
import { view } from './view';

/** The input box: a cost table, handed on in its canonical text. */
export function parseCosts(text: string): Value | Error {
  const cost = readCosts(text);
  return typeof cost === 'string' ? new Error(cost) : tableText(cost);
}

const size = (n: number) => Math.max(1, Math.min(n, MAX_N));
const solve = (cost: number[][]): OpCall[] => [['load', tableText(cost)], ['solve']];

/** Each worker in turn takes its cheapest task left (ties to the lower task). */
function greedyTotal(cost: number[][]): number {
  let used = 0;
  let total = 0;
  for (const row of cost) {
    let pick = -1;
    row.forEach((c, t) => {
      if (!((used >> t) & 1) && (pick < 0 || c < row[pick]!)) pick = t;
    });
    used |= 1 << pick;
    total += row[pick]!;
  }
  return total;
}

const presets: Preset[] = [
  { label: 'Random costs', make: (rng, n) => solve(randomCosts(rng, size(n))) },
  {
    label: 'Cheapest task first goes wrong',
    make: (rng, n) => {
      let cost = randomCosts(rng, size(n));
      for (let k = 0; k < 60 && greedyTotal(cost) === solveDP(cost).best; k++)
        cost = randomCosts(rng, size(n));
      return solve(cost);
    },
  },
  {
    label: 'Every cost the same (all ties)',
    make: (_rng, n) => solve(Array.from({ length: size(n) }, () => Array<number>(size(n)).fill(5))),
  },
  {
    label: 'Cheap on the diagonal',
    make: (rng, n) =>
      solve(
        Array.from({ length: size(n) }, (_, w) =>
          Array.from({ length: size(n) }, (_, t) => (w === t ? rng.int(1, 3) : rng.int(5, 9))),
        ),
      ),
  },
  {
    label: 'Wide range of costs',
    make: (rng, n) => solve(randomCosts(rng, size(n), 0, 99)),
  },
];

export const dpBitmask: VizDef<AssignState, AssignSettings, AssignExtra> = {
  id: 'dp-bitmask',
  title: 'DP over subsets (bitmask)',
  family: 'DP patterns',
  blurb:
    'Give n workers n tasks for the least total cost with a DP over the set of tasks already given out, one bitmask per set: 2ⁿ masks and n · 2ⁿ⁻¹ tries, against n! orders for trying them all.',
  settings: [
    approachSetting({
      pattern: 'A DP over the masks of tasks, O(n · 2ⁿ)',
      naive: 'Try every order, O(n · n!)',
    }),
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
      label: 'Costs (rows by /)',
      placeholder: 'e.g. 2 6 7 / 3 8 9 / 5 9 4',
      maxLength: 80,
      sample: START,
      parse: parseCosts,
    },
    buttons: [
      { op: 'solve', label: 'Cheapest total', usesInput: false, primary: true },
      { op: 'load', label: 'Load costs', usesInput: true },
    ],
    random: {
      label: 'Random costs',
      make: (rng) => solve(randomCosts(rng, rng.int(3, 4))),
    },
    presets,
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'cheapest total, DP over masks',
      best: {
        cost: 'Θ(n · 2ⁿ)',
        why: 'Every mask tries each of its tasks, whatever the costs: n · 2ⁿ⁻¹ tries.',
        example: 'all-ties',
      },
      average: {
        cost: 'Θ(n · 2ⁿ)',
        why: 'Four workers: 16 masks and 32 tries.',
        example: 'four-workers',
      },
      worst: {
        cost: 'Θ(n · 2ⁿ)',
        why: 'The same 32 tries at n = 4; at n = 20 about 10 million, still fine.',
        example: 'four-workers',
      },
      note: 'Walking the answer back from the full mask is n more steps.',
    },
    {
      op: 'cheapest total, every order',
      best: {
        cost: 'Θ(n · n!)',
        why: 'Every order is finished, however bad it looks early: n! orders.',
        example: 'every-order',
      },
      average: {
        cost: 'Θ(n · n!)',
        why: 'About e · n! tries: 64 at n = 4, against 32 for the DP.',
        example: 'every-order',
      },
      worst: {
        cost: 'Θ(n · n!)',
        why: 'At n = 2 both take 4 tries; at n = 10 it is close to 10 million against 5 120.',
        example: 'two-workers',
      },
      note: 'Counting tries, the order search is about e · n!. Each call also runs through all n tasks to find the ones left, which makes Θ(n · n!) steps.',
    },
    {
      op: 'extra space',
      best: {
        cost: 'O(n)',
        why: 'Trying every order keeps one order and the best: the call stack is n deep.',
        example: 'every-order',
      },
      average: { cost: 'Θ(2ⁿ)', why: 'The DP keeps one value per mask.' },
      worst: {
        cost: 'Θ(2ⁿ)',
        why: 'Plus the task each mask took last, to walk the answer back.',
        example: 'four-workers',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(dpBitmask, settings as AssignSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        if (e.call[0] !== 'solve' || e.end.best === null) continue;
        // The code is the DP, so its assignment is the DP's even when the page ran every order
        // (with ties the two can pick different assignments of the same total).
        const dp = solveDP(e.end.cost);
        sameTotal(dp.best, e.end.best);
        input.push(`solve ${tableText(e.end.cost)}`);
        expected.push([dp.best, ...dp.tasks].join(' '));
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fourWorkers,
    everyOrder,
    cheapestFirst,
    twoWorkers,
    allTies,
    oneWorker,
  ] as unknown as SavedExample[],
  practice: assignPractice(() => dpBitmask),
  preview: { example: 'four-workers', level: 2, hide: ['cell-', 'ch-', 'rh-', 'best-', 'now-'] },
};

/** The page's own answer and the DP's always agree on the total. */
function sameTotal(a: number, b: number) {
  if (a !== b) throw new Error(`The DP found ${a} but the page found ${b}.`);
}

export default dpBitmask;
