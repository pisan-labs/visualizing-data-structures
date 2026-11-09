import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { buildCall, parseInput, randomValues, valuePresets } from '../_range/kit';
import cppSource from './code/cpp/segment_tree.hpp?raw';
import javaSource from './code/java/SegmentTree.java?raw';
import pythonSource from './code/python/segment_tree.py?raw';
import explain from './explain.md?raw';
import addEverything from './examples/add-everything.json';
import lazyTags from './examples/lazy-tags.json';
import rangeMinimum from './examples/range-minimum.json';
import singleCell from './examples/single-cell.json';
import threeCases from './examples/three-cases.json';
import unevenTree from './examples/uneven-tree.json';
import updateThenQuery from './examples/update-then-query.json';
import wholeArray from './examples/whole-array.json';
import worstQuery from './examples/worst-query.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  START,
  type SegExtra,
  type SegSettings,
  type SegState,
} from './model';
import { segmentPractice } from './practice';
import { view } from './view';

export const segmentTree: VizDef<SegState, SegSettings, SegExtra> = {
  id: 'segment-tree',
  title: 'Segment tree (lazy propagation)',
  family: 'Range queries',
  blurb:
    'A tree of ranges over an array: range sums or minimums, point updates and range adds in O(log n), with lazy tags that put work off until a query needs it.',
  settings: [
    {
      kind: 'choice',
      key: 'combine',
      label: 'Each node holds',
      options: [
        { value: 'sum', label: 'The sum of its range' },
        { value: 'min', label: 'The minimum of its range' },
      ],
      help: 'The tree, the three cases and the lazy tags stay the same; only how two children combine changes.',
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
      placeholder: 'e.g. 2 6 to query, 1 5 3 to add, or a list',
      maxLength: 80,
      sample: '1',
      parse: parseInput,
    },
    buttons: [
      { op: 'query', label: 'Query', usesInput: true, primary: true, args: ['l', 'r'] },
      { op: 'add', label: 'Range add', usesInput: true, args: ['l', 'r', 'an amount'] },
      { op: 'update', label: 'Update', usesInput: true, args: ['an index', 'a new value'] },
      { op: 'build', label: 'Build', usesInput: true, more: true },
    ],
    random: { label: 'Random array', make: (rng) => [buildCall(randomValues(rng, 8))] },
    presets: valuePresets(),
    sizes: [8, 10, 16],
  },
  explain,
  complexity: [
    {
      op: 'build(A)',
      best: { cost: 'O(n)', why: '2n − 1 nodes, each computed once from its two children.' },
      average: { cost: 'O(n)', why: 'The work depends on n only, never on the values.' },
      worst: {
        cost: 'O(n)',
        why: 'Still 2n − 1 nodes when n is not a power of two: 19 for 10 values.',
        example: 'uneven-tree',
      },
      note: 'Space: 2n − 1 nodes and as many tags; array code allocates 4n to keep the numbering simple.',
    },
    {
      op: 'query(l, r)',
      best: {
        cost: 'O(1)',
        why: 'The whole array is a full overlap at the root.',
        example: 'whole-array',
      },
      average: { cost: 'O(log n)', why: 'Only nodes that cross an end of the range go deeper.' },
      worst: {
        cost: 'O(log n)',
        why: 'At most four nodes per level: two that cross the ends, and their children.',
        example: 'worst-query',
      },
    },
    {
      op: 'update(i, x)',
      best: { cost: 'O(log n)', why: 'One path from the root to the leaf for i, then back up.' },
      average: {
        cost: 'O(log n)',
        why: 'Every update walks a whole path, up to ⌈log₂ n⌉ + 1 nodes.',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The same path, plus a tag pushed at each node it passes.',
        example: 'update-then-query',
      },
    },
    {
      op: 'add(l, r, x), lazy',
      best: {
        cost: 'O(1)',
        why: 'Adding to the whole array tags the root and stops.',
        example: 'add-everything',
      },
      average: {
        cost: 'O(log n)',
        why: 'A node inside the range takes a tag instead of visiting its subtree.',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The same four nodes per level as a query. Without tags it would be O(n).',
        example: 'lazy-tags',
      },
    },
  ],
  practice: segmentPractice(() => segmentTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SegSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threeCases,
    wholeArray,
    singleCell,
    worstQuery,
    updateThenQuery,
    lazyTags,
    addEverything,
    rangeMinimum,
    unevenTree,
  ] as unknown as SavedExample[],
  preview: { example: 'three-cases', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code keeps sums (the default), so the model runs with
 * sums too, whatever the example's setting. Calls the model refuses (an index out of range, a
 * value that would not fit the drawing) are left out: the shown code leaves those checks to its
 * caller.
 *   build v1 v2 ...  ->  (nothing)
 *   query l r        ->  A[l] + ... + A[r]
 *   update i x       ->  (nothing)
 *   add l r x        ->  (nothing)
 */
function codeScript(calls: OpCall[], settings: SegSettings) {
  const t = new Timeline(segmentTree, { ...settings, combine: 'sum' }, 1, calls);
  const input = [`build ${START.join(' ')}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const last = e.steps[e.steps.length - 1]!;
    if (last.marks.some((m) => m.role === 'error')) continue;
    const [op, ...args] = e.call;
    if (op === 'build') {
      input.push(`build ${e.end.a.join(' ')}`);
      continue;
    }
    input.push([op, ...args.map((a) => Number(String(a).trim()))].join(' '));
    if (op === 'query') expected.push(String(last.vars?.sum));
  }
  return { input, expected };
}

export default segmentTree;
