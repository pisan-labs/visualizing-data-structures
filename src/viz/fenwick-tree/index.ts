import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { buildCall, parseInput, randomValues, valuePresets } from '../_range/kit';
import cppSource from './code/cpp/fenwick_tree.hpp?raw';
import javaSource from './code/java/FenwickTree.java?raw';
import pythonSource from './code/python/fenwick_tree.py?raw';
import explain from './explain.md?raw';
import addClimbs from './examples/add-climbs.json';
import addThenQuery from './examples/add-then-query.json';
import buildByAdds from './examples/build-by-adds.json';
import buildLinear from './examples/build-linear.json';
import longestQuery from './examples/longest-query.json';
import longestUpdate from './examples/longest-update.json';
import prefixThirteen from './examples/prefix-thirteen.json';
import singleCell from './examples/single-cell.json';
import wholeArray from './examples/whole-array.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  START,
  type FenExtra,
  type FenSettings,
  type FenState,
} from './model';
import { fenwickPractice } from './practice';
import { view } from './view';

export const fenwickTree: VizDef<FenState, FenSettings, FenExtra> = {
  id: 'fenwick-tree',
  title: 'Fenwick tree',
  family: 'Range queries',
  blurb:
    'Prefix sums that survive updates: a binary indexed tree adds and sums in O(log n) by following the lowest set bit of an index.',
  settings: [
    {
      kind: 'choice',
      key: 'build',
      label: 'Build',
      options: [
        { value: 'linear', label: 'Copy A, then pass each total up (O(n))' },
        { value: 'updates', label: 'One add per value (O(n log n))' },
      ],
      help: 'Both build the same tree. Build the same list both ways and compare the build cost.',
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
      label: 'Numbers',
      placeholder: 'e.g. 13, or 3 5, or a list to build',
      maxLength: 80,
      sample: '1',
      parse: parseInput,
    },
    buttons: [
      { op: 'prefix', label: 'Prefix sum', usesInput: true, primary: true },
      { op: 'sum', label: 'Range sum', usesInput: true, args: ['l', 'r'] },
      { op: 'add', label: 'Add', usesInput: true, args: ['an index', 'an amount'] },
      { op: 'build', label: 'Build', usesInput: true },
    ],
    random: { label: 'Random array', make: (rng) => [buildCall(randomValues(rng, 8))] },
    presets: valuePresets(),
    sizes: [8, 12, 16],
  },
  explain,
  complexity: [
    {
      op: 'build, copy and pass up',
      best: {
        cost: 'O(n)',
        why: 'One addition per index that has a parent: n minus the number of 1 bits of n.',
        example: 'build-linear',
      },
      average: { cost: 'O(n)', why: 'The work depends on n only, never on the values.' },
      worst: { cost: 'O(n)', why: 'At most n − 1 additions, 15 for 16 values.' },
      note: 'Space: n entries, the same as A. No pointers.',
    },
    {
      op: 'build, one add per value',
      best: { cost: 'O(n log n)', why: 'Every value climbs its whole update path.' },
      average: { cost: 'O(n log n)', why: 'The paths depend on the indices, not the values.' },
      worst: {
        cost: 'O(n log n)',
        why: 'Up to ⌊log₂ n⌋ + 1 entries per value: 48 additions for 16 values.',
        example: 'build-by-adds',
      },
    },
    {
      op: 'add(i, delta)',
      best: {
        cost: 'O(1)',
        why: 'When i + (i & −i) is past n, as for i = n, only T[i] changes.',
      },
      average: { cost: 'O(log n)', why: 'Each step at least doubles the lowest set bit.' },
      worst: {
        cost: 'O(log n)',
        why: 'i = 1 climbs through every power of two: ⌊log₂ n⌋ + 1 entries.',
        example: 'longest-update',
      },
    },
    {
      op: 'prefix(i)',
      best: {
        cost: 'O(1)',
        why: 'A power of two has one 1 bit, so one entry covers A[1..i].',
        example: 'whole-array',
      },
      average: { cost: 'O(log n)', why: 'One entry per 1 bit of i; about half the bits.' },
      worst: {
        cost: 'O(log n)',
        why: 'Every bit set, as in 15 = 1111₂: one entry per bit.',
        example: 'longest-query',
      },
    },
    {
      op: 'sum(l, r)',
      best: {
        cost: 'O(1)',
        why: 'sum(1, 16) is prefix(16) − prefix(0): one entry and an empty walk.',
        example: 'whole-array',
      },
      average: { cost: 'O(log n)', why: 'Two prefix walks of O(log n) each.' },
      worst: {
        cost: 'O(log n)',
        why: 'Both walks can read every bit, and they may even read the same entries.',
        example: 'single-cell',
      },
    },
  ],
  practice: fenwickPractice(() => fenwickTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FenSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    prefixThirteen,
    addClimbs,
    wholeArray,
    singleCell,
    longestQuery,
    longestUpdate,
    addThenQuery,
    buildLinear,
    buildByAdds,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs. Both builds give the same tree, so the code builds one way
 * whatever the setting. Calls the model refuses (an index out of range, a value that would not
 * fit the drawing) are left out: the shown code leaves those checks to its caller.
 *   build v1 v2 ...  ->  (nothing)
 *   add i delta      ->  (nothing)
 *   prefix i         ->  A[1] + ... + A[i]
 *   sum l r          ->  A[l] + ... + A[r]
 */
function codeScript(calls: OpCall[], settings: FenSettings) {
  const t = new Timeline(fenwickTree, settings, 1, calls);
  const input = [`build ${START.join(' ')}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const last = e.steps[e.steps.length - 1]!;
    if (last.marks.some((m) => m.role === 'error')) continue;
    const [op, ...args] = e.call;
    const nums = args.map((a) => Number(String(a).trim()));
    if (op === 'build') {
      input.push(`build ${e.end.a.slice(1).join(' ')}`);
    } else {
      input.push([op, ...nums].join(' '));
      if (op !== 'add') expected.push(String(last.vars?.sum));
    }
  }
  return { input, expected };
}

export default fenwickTree;
