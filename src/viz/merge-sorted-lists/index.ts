import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/merge.hpp?raw';
import javaSource from './code/java/Merge.java?raw';
import pythonSource from './code/python/merge.py?raw';
import copyAndSort from './examples/copy-and-sort.json';
import emptyList from './examples/empty-list.json';
import fourInPairs from './examples/four-in-pairs.json';
import fourOneAtATime from './examples/four-one-at-a-time.json';
import interleaved from './examples/interleaved.json';
import restAtOnce from './examples/rest-at-once.json';
import tiesKeepOrder from './examples/ties-keep-order.json';
import twoLists from './examples/two-lists.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  formatLists,
  init,
  initialSay,
  initialVars,
  listValues,
  MAX_LEN,
  ops,
  parseInput,
  pseudocode,
  readLists,
  type MExtra,
  type MSettings,
  type MState,
} from './model';
import { mergePractice } from './practice';
import { view } from './view';

const build = (lists: number[][]): OpCall => ['build', formatLists(lists)];

/** A sorted list of n values from lo to hi. */
const sorted = (rng: Rng, n: number, lo = 1, hi = 99) =>
  Array.from({ length: n }, () => rng.int(lo, hi)).sort((x, y) => x - y);

/** `size` values split into k sorted lists, each at most MAX_LEN. */
function split(rng: Rng, size: number, k: number): number[][] {
  const total = Math.min(size, k * MAX_LEN);
  const lens = Array(k).fill(Math.floor(total / k));
  for (let i = 0; i < total % k; i++) lens[i]++;
  return lens.map((n: number) => sorted(rng, n));
}

const presets: Preset[] = [
  { label: 'Two random lists', make: (rng, n) => [build(split(rng, n, 2)), ['merge']] },
  {
    label: 'Interleaved (most comparisons)',
    make: (_rng, n) => {
      const vs = Array.from({ length: Math.min(n, 2 * MAX_LEN) }, (_, i) => 10 + 5 * i);
      return [
        build([vs.filter((_, i) => i % 2 === 0), vs.filter((_, i) => i % 2 === 1)]),
        ['merge'],
      ];
    },
  },
  {
    label: 'One list all smaller (fewest comparisons)',
    make: (rng, n) => {
      const m = Math.min(MAX_LEN, Math.floor(n / 2));
      return [build([sorted(rng, m, 1, 49), sorted(rng, Math.min(MAX_LEN, n - m), 50)]), ['merge']];
    },
  },
  {
    label: 'Many equal values',
    make: (rng, n) => [
      build(split(rng, n, 2).map((l) => l.map((v) => 1 + (v % 3)).sort((x, y) => x - y))),
      ['merge'],
    ],
  },
  {
    label: 'One list empty',
    make: (rng, n) => [build([[], sorted(rng, Math.min(n, MAX_LEN))]), ['merge']],
  },
  { label: 'Three lists', make: (rng, n) => [build(split(rng, n, 3)), ['merge']] },
  { label: 'Four lists', make: (rng, n) => [build(split(rng, n, 4)), ['merge']] },
];

export const mergeSortedLists: VizDef<MState, MSettings, MExtra> = {
  id: 'merge-sorted-lists',
  title: 'Merge sorted lists',
  family: 'Linked list tricks',
  blurb:
    'Merge sorted linked lists by moving pointers: a dummy head, a tail, and the smaller front node each time. O(m + n) and no new nodes, against copying to an array and sorting. Then k lists, merged in pairs.',
  settings: [
    approachSetting({
      pattern: 'Relink with a dummy head, O(m + n)',
      naive: 'Copy to an array, sort, rebuild',
    }),
    {
      kind: 'choice',
      key: 'kway',
      label: 'More than two lists',
      options: [
        { value: 'pairs', label: 'Merge in pairs, O(N log k)' },
        { value: 'one', label: 'One at a time, O(N k)' },
      ],
      help: 'Pairs: A with B and C with D, then the results. One at a time: A with B, then with C, then with D, so A’s nodes are compared again in every merge.',
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
      label: 'Sorted lists',
      placeholder: 'e.g. 1 4 7 | 2 3 8',
      maxLength: 80,
      sample: '1 4 7 | 2 3 8',
      parse: parseInput,
    },
    buttons: [
      { op: 'merge', label: 'Merge', usesInput: false, primary: true },
      { op: 'build', label: 'Build', usesInput: true },
    ],
    random: {
      label: 'Random lists',
      make: (rng) => [build(split(rng, rng.int(5, 10), rng.int(2, 4)))],
    },
    presets,
    sizes: [6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'merge two lists, dummy head',
      best: {
        cost: 'O(min(m, n))',
        why: 'The shorter list is all smaller: one comparison per node of it, then the rest is linked at once.',
        example: 'rest-at-once',
      },
      average: {
        cost: 'O(m + n)',
        why: 'One comparison per node taken; 6 for these 7 nodes.',
        example: 'two-lists',
      },
      worst: {
        cost: 'Θ(m + n)',
        why: 'Interleaved values: m + n − 1 comparisons, 9 for 10 nodes.',
        example: 'interleaved',
      },
      note: 'Extra space O(1): only the dummy and a few pointers. No node is made or copied.',
    },
    {
      op: 'k lists, in pairs',
      best: {
        cost: 'O(N)',
        why: 'k = 2 is one merge. With more lists, about log2(k) rounds.',
        example: 'two-lists',
      },
      average: {
        cost: 'O(N log k)',
        why: 'Each round touches every node once, and there are about log2(k) rounds.',
        example: 'four-in-pairs',
      },
      worst: { cost: 'O(N log k)', why: 'Even when every merge is interleaved.' },
    },
    {
      op: 'k lists, one at a time',
      best: { cost: 'O(N)', why: 'Two lists: the same single merge.', example: 'two-lists' },
      average: {
        cost: 'O(N k)',
        why: 'A’s nodes are in every one of the k − 1 merges.',
        example: 'four-one-at-a-time',
      },
      worst: {
        cost: 'Θ(N k)',
        why: 'Lists of equal length: the growing result is compared again and again.',
      },
    },
    {
      op: 'copy to an array, sort, rebuild',
      best: {
        cost: 'Θ(N)',
        why: 'Already in order: the insertion sort makes one comparison per value.',
      },
      average: {
        cost: 'Θ(N²)',
        why: 'This page sorts by insertion: 13 comparisons here against 6 for the merge.',
        example: 'copy-and-sort',
      },
      worst: {
        cost: 'Θ(N²)',
        why: 'With a good library sort, O(N log N). Either way N cells and N new nodes.',
        example: 'copy-and-sort',
      },
      note: 'N is the number of nodes in all the lists together.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings) => codeScript(calls, settings as MSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoLists,
    restAtOnce,
    interleaved,
    tiesKeepOrder,
    emptyList,
    copyAndSort,
    fourInPairs,
    fourOneAtATime,
  ] as unknown as SavedExample[],
  practice: mergePractice(() => mergeSortedLists),
  preview: { example: 'two-lists', level: 2 },
};

/**
 * Driver protocol for the code tabs: "build 1 4 7 | 2 3 8" (lists separated by |, "empty" for
 * an empty one) prints nothing; "merge" merges them all into one and prints its values, or
 * "empty".
 */
function codeScript(calls: OpCall[], settings: MSettings) {
  const t = new Timeline(mergeSortedLists, settings, 1, calls);
  const input = [`build ${formatLists(listValues(t.initial.state))}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] === 'build') {
      if (typeof readLists(e.call[1]) !== 'string')
        input.push(`build ${formatLists(listValues(e.end))}`);
    } else if (e.call[0] === 'merge') {
      input.push('merge');
      expected.push(listValues(e.end)[0]!.join(' ') || 'empty');
    }
  }
  return { input, expected };
}

export default mergeSortedLists;
