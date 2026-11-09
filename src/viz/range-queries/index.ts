import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { buildCall, parseInput, randomValues, valuePresets } from '../_range/kit';
import cppSource from './code/cpp/range_queries.hpp?raw';
import javaSource from './code/java/RangeQueries.java?raw';
import pythonSource from './code/python/range_queries.py?raw';
import explain from './explain.md?raw';
import minOverlap from './examples/min-overlap.json';
import minPowerOfTwo from './examples/min-power-of-two.json';
import singleCell from './examples/single-cell.json';
import sparseBuild from './examples/sparse-build.json';
import sparseUpdate from './examples/sparse-update.json';
import sumCancels from './examples/sum-cancels.json';
import updateFirstCell from './examples/update-first-cell.json';
import updateThenQuery from './examples/update-then-query.json';
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
  type RQExtra,
  type RQSettings,
  type RQState,
} from './model';
import { rangePractice } from './practice';
import { view } from './view';

export const rangeQueries: VizDef<RQState, RQSettings, RQExtra> = {
  id: 'range-queries',
  title: 'Prefix sums and sparse tables',
  family: 'Range queries',
  blurb:
    'Answer range sums and range minimums on an array that does not change, in O(1) per query, after one pass to build a table.',
  settings: [
    {
      kind: 'choice',
      key: 'structure',
      label: 'Structure',
      options: [
        { value: 'prefix', label: 'Prefix sums: sum(i, j)' },
        { value: 'sparse', label: 'Sparse table: min(i, j)' },
      ],
      help: 'Prefix sums answer range sums; a sparse table answers range minimums. Both are built once and then answer each query in O(1).',
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
      placeholder: 'e.g. 2 5 to query, or a list to build',
      maxLength: 80,
      sample: '1',
      parse: parseInput,
    },
    buttons: [
      { op: 'query', label: 'Query', usesInput: true, primary: true, args: ['i', 'j'] },
      { op: 'build', label: 'Build', usesInput: true },
      {
        op: 'update',
        label: 'Update',
        usesInput: true,
        args: ['an index', 'a new value'],
        more: true,
      },
    ],
    random: { label: 'Random array', make: (rng) => [buildCall(randomValues(rng, 8))] },
    presets: valuePresets(),
    sizes: [8, 12, 16],
  },
  explain,
  complexity: [
    {
      op: 'build P',
      best: { cost: 'O(n)', why: 'One addition per value, left to right.', example: 'sum-cancels' },
      average: { cost: 'O(n)', why: 'The loop never depends on the values.' },
      worst: { cost: 'O(n)', why: 'Still one addition per value, n in all.' },
      note: 'Space: n + 1 entries.',
    },
    {
      op: 'sum(i, j) with P',
      best: {
        cost: 'O(1)',
        why: 'One subtraction, P[j + 1] − P[i], even for a single cell.',
        example: 'single-cell',
      },
      average: { cost: 'O(1)', why: 'Two lookups and one subtraction, whatever i and j are.' },
      worst: {
        cost: 'O(1)',
        why: 'The whole array is P[n] − P[0]: still one subtraction.',
        example: 'whole-array',
      },
    },
    {
      op: 'update(i, x) with P',
      best: {
        cost: 'O(1)',
        why: 'Changing the last value changes only P[n].',
      },
      average: { cost: 'O(n)', why: 'n − i entries of P include A[i]; about n/2 on average.' },
      worst: {
        cost: 'O(n)',
        why: 'Every prefix includes A[0], so changing it rewrites all n entries after P[0].',
        example: 'update-first-cell',
      },
    },
    {
      op: 'build the sparse table',
      best: {
        cost: 'O(n log n)',
        why: 'About ⌊log₂ n⌋ rows of up to n entries, one min() each.',
        example: 'sparse-build',
      },
      average: { cost: 'O(n log n)', why: 'The work depends only on n, never on the values.' },
      worst: {
        cost: 'O(n log n)',
        why: 'Row k has n − 2^k + 1 entries: 38 min() calls for n = 16.',
        example: 'sparse-build',
      },
      note: 'Space: O(n log n) entries, the price of O(1) minimums.',
    },
    {
      op: 'min(i, j) with the sparse table',
      best: {
        cost: 'O(1)',
        why: 'A power-of-two length needs only one window.',
        example: 'min-power-of-two',
      },
      average: { cost: 'O(1)', why: 'Two lookups and one min(), whatever the length.' },
      worst: {
        cost: 'O(1)',
        why: 'Two windows of the same length always cover the range; they may overlap.',
        example: 'min-overlap',
      },
    },
    {
      op: 'update(i, x) with the sparse table',
      best: {
        cost: 'O(log n)',
        why: 'At either end of A, one window per row contains i.',
      },
      average: { cost: 'O(n)', why: 'Row k has up to 2^k windows that contain i.' },
      worst: {
        cost: 'O(n)',
        why: 'In the middle, the rows add up to n − 1 windows to recompute: 15 for n = 16.',
        example: 'sparse-update',
      },
    },
  ],
  practice: rangePractice(() => rangeQueries),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RQSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sumCancels,
    wholeArray,
    singleCell,
    updateThenQuery,
    updateFirstCell,
    sparseBuild,
    minOverlap,
    minPowerOfTwo,
    sparseUpdate,
  ] as unknown as SavedExample[],
  preview: { example: 'update-then-query', level: 2 },
};

/**
 * Driver protocol for the code tabs. The driver builds both structures; queries ask the one the
 * settings pick. Calls the model refuses (an index out of range) are left out: the shown code
 * leaves bounds checks to its caller.
 *   build v1 v2 ...  ->  (nothing)
 *   sum i j          ->  A[i] + ... + A[j]
 *   min i j          ->  the smallest of A[i..j]
 *   update i x       ->  (nothing)
 */
function codeScript(calls: OpCall[], settings: RQSettings) {
  const t = new Timeline(rangeQueries, settings, 1, calls);
  const input = [`build ${START.join(' ')}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const last = e.steps[e.steps.length - 1]!;
    if (last.marks.some((m) => m.role === 'error')) continue;
    const v = last.vars ?? {};
    const [op] = e.call;
    if (op === 'build') input.push(`build ${e.end.a.join(' ')}`);
    else if (op === 'update') input.push(`update ${v.i} ${v.x}`);
    else if (settings.structure === 'sparse') {
      input.push(`min ${v.i} ${v.j}`);
      expected.push(String(v.min));
    } else {
      input.push(`sum ${v.i} ${v.j}`);
      expected.push(String(v.sum));
    }
  }
  return { input, expected };
}

export default rangeQueries;
