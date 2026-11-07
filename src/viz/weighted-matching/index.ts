import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/hungarian.hpp?raw';
import javaSource from './code/java/Hungarian.java?raw';
import pythonSource from './code/python/hungarian.py?raw';
import allEqual from './examples/all-equal.json';
import cheapest from './examples/cheapest-four.json';
import maximize from './examples/maximize.json';
import oneWorker from './examples/one-worker.json';
import products from './examples/products.json';
import zeros from './examples/zeros-on-diagonal.json';
import explain from './explain.md?raw';
import {
  MAX_N,
  START_TEXT,
  defaults,
  describe,
  formatMatrix,
  init,
  initialSay,
  initialVars,
  ops,
  parseMatrix,
  pseudocode,
  totalOf,
  type HmExtra,
  type HmSettings,
  type HmState,
} from './model';
import { hungarianPractice } from './practice';
import { view } from './view';

export function parseMatrixInput(token: string): Value | Error {
  const m = parseMatrix(token);
  return m instanceof Error ? m : token.trim();
}

const load = (m: number[][]): OpCall => ['load', formatMatrix(m)];

export const randomMatrix = (rng: Rng, n: number, hi = 9): number[][] =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(1, hi)));

/** c[i][j] = (i + 1)(j + 1): every row prefers column 1, and many potential updates follow. */
export const productMatrix = (n: number): number[][] =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i + 1) * (j + 1)));

const preset = (label: string, make: (rng: Rng, n: number) => number[][]): Preset => ({
  label,
  make: (rng, size) => [load(make(rng, Math.min(MAX_N, Math.max(1, size)))), ['run']],
});

export const weightedMatching: VizDef<HmState, HmSettings, HmExtra> = {
  id: 'weighted-matching',
  title: 'Weighted matching (Hungarian)',
  family: 'Flow and matching',
  blurb:
    'The assignment problem: give each of n workers one of n jobs at the least total cost, with the Hungarian algorithm, its potentials and its tight edges.',
  settings: [
    {
      kind: 'choice',
      key: 'goal',
      label: 'Goal',
      options: [
        { value: 'min', label: 'Minimize the total cost' },
        { value: 'max', label: 'Maximize the total (profits instead of costs)' },
      ],
      help: 'To maximize, the algorithm minimizes M − c, where M is the largest entry.',
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
      label: 'Cost matrix',
      placeholder: 'e.g. 4 1 3; 2 0 5; 3 2 2',
      maxLength: 200,
      sample: START_TEXT,
      parse: parseMatrixInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find the best assignment', usesInput: false },
    ],
    random: {
      label: 'Random costs',
      make: (rng) => [load(randomMatrix(rng, rng.int(3, 5)))],
    },
    presets: [
      preset('Random costs 1 to 9', (rng, n) => randomMatrix(rng, n)),
      preset('Random costs 1 to 99', (rng, n) => randomMatrix(rng, n, 99)),
      preset('Products: many updates', (_rng, n) => productMatrix(n)),
      preset('Cheap diagonal', (rng, n) =>
        randomMatrix(rng, n).map((r, i) => r.map((c, j) => (i === j ? 0 : c))),
      ),
      preset('All the same', (_rng, n) => Array.from({ length: n }, () => Array(n).fill(5))),
      preset('Everyone wants column 1', (rng, n) =>
        randomMatrix(rng, n).map((r) => r.map((c, j) => (j === 0 ? 1 : c + 3))),
      ),
    ],
    sizes: [3, 4, 5, 6],
  },
  explain,
  complexity: [
    {
      op: 'Hungarian algorithm',
      best: {
        cost: 'Θ(n²)',
        why: 'The reductions read every cell; when every row has its own tight cell, each phase ends at once.',
        example: 'zeros-on-diagonal',
      },
      average: {
        cost: 'O(n³)',
        why: 'n phases, each with at most n potential updates, and slack kept per column makes each update O(n).',
        example: 'cheapest-four',
      },
      worst: {
        cost: 'O(n³)',
        why: 'Still n phases of O(n²). This page recomputes δ from scratch, which is O(n⁴), to keep the code short.',
        example: 'products',
      },
    },
    {
      op: 'Potential updates in one phase',
      best: {
        cost: '0',
        why: 'A tight cell to a free column is already there.',
        example: 'zeros-on-diagonal',
      },
      average: { cost: 'a few', why: 'Each update adds a tight cell out of the tree.' },
      worst: {
        cost: 'n',
        why: 'Each update grows T by at least one column, and T has at most n.',
        example: 'products',
      },
    },
    {
      op: 'Trying every assignment',
      best: { cost: 'Θ(n!)', why: 'There are n! permutations, and each needs its total.' },
      average: { cost: 'Θ(n · n!)', why: 'Six workers already make 720 assignments.' },
      worst: {
        cost: 'Θ(n · n!)',
        why: 'Twenty workers make about 2.4 × 10¹⁸: the reason to use potentials.',
        example: 'all-equal',
      },
      note: 'Space for the Hungarian algorithm: Θ(n²) for the matrix, Θ(n) for u, v and the tree.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as HmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [cheapest, maximize, products, zeros, allEqual, oneWorker] as unknown as SavedExample[],
  practice: hungarianPractice(() => weightedMatching),
  preview: { example: 'cheapest-four', level: 2 },
};

/**
 * Driver protocol for the code tabs: "solve <min|max> <n> <costs row by row>" prints
 * "<total> | <column of each row, from 1>".
 */
function codeScript(calls: OpCall[], settings: HmSettings) {
  const t = new Timeline(weightedMatching, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] !== 'run' || !r) continue;
    const cost = e.end.cost;
    input.push(`solve ${settings.goal} ${cost.length} ${cost.flat().join(' ')}`);
    expected.push(`${totalOf(cost, r.rowMate)} | ${r.rowMate.map((j) => j + 1).join(' ')}`);
  }
  return { input, expected };
}

export default weightedMatching;
