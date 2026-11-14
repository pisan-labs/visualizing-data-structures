import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import { withApproach } from '../_heaps2/say';
import cppSource from './code/cpp/k_way_merge.hpp?raw';
import javaSource from './code/java/KWayMerge.java?raw';
import pythonSource from './code/python/k_way_merge.py?raw';
import aListRunsOut from './examples/a-list-runs-out.json';
import alreadyInOrder from './examples/already-in-order.json';
import concatenateAndSort from './examples/concatenate-and-sort.json';
import equalHeads from './examples/equal-heads.json';
import fiveLists from './examples/five-lists.json';
import mergeInPairs from './examples/merge-in-pairs.json';
import threeLists from './examples/three-lists.json';
import twoLists from './examples/two-lists.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  formatLists,
  init,
  initialSay,
  initialVars,
  MAX_LISTS,
  MAX_TOTAL,
  ops,
  parseInput,
  pseudocode,
  type MergeExtra,
  type MergeSettings,
  type MergeState,
} from './model';
import { mergePractice } from './practice';
import { view } from './view';

const load = (lists: number[][]): OpCall => ['load', formatLists(lists)];

/** n values split into k sorted lists, as evenly as the sizes allow. */
function split(vs: number[], k: number): number[][] {
  const lists: number[][] = Array.from({ length: k }, () => []);
  vs.forEach((v, i) => lists[i % k]!.push(v));
  return lists.map((l) => l.sort((x, y) => x - y));
}

function random(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.int(1, 60));
}

const kFor = (n: number) => Math.min(MAX_LISTS, Math.max(2, Math.round(n / 3)));

const presets: Preset[] = [
  {
    label: 'Random lists',
    make: (rng, n) => [load(split(random(rng, n), kFor(n))), ['merge']],
  },
  {
    label: 'Two lists (a plain merge)',
    make: (rng, n) => [load(split(random(rng, Math.min(n, 10)), 2)), ['merge']],
  },
  {
    label: `${MAX_LISTS} lists of two or three`,
    make: (rng, n) => [load(split(random(rng, Math.max(n, 10)), MAX_LISTS)), ['merge']],
  },
  {
    label: 'Lists already in order, one after another',
    make: (rng, n) => {
      const vs = random(rng, n).sort((x, y) => x - y);
      const k = kFor(n);
      const size = Math.ceil(n / k);
      return [
        load(
          Array.from({ length: k }, (_, j) => vs.slice(j * size, (j + 1) * size)).filter(
            (l) => l.length,
          ),
        ),
        ['merge'],
      ];
    },
  },
  {
    label: 'One long list and short ones',
    make: (rng, n) => {
      const vs = random(rng, n);
      const long = vs.slice(0, 5).sort((x, y) => x - y);
      const rest = vs.slice(5);
      return [
        load([long, ...(rest.length ? split(rest, Math.min(3, rest.length)) : [])]),
        ['merge'],
      ];
    },
  },
  {
    label: 'Many equal values',
    make: (rng, n) => [
      load(
        split(
          Array.from({ length: n }, () => rng.int(1, 3) * 5),
          kFor(n),
        ),
      ),
      ['merge'],
    ],
  },
];

export const kWayMerge: VizDef<MergeState, MergeSettings, MergeExtra> = {
  id: 'k-way-merge',
  title: 'K-way merge',
  family: 'Heap patterns',
  blurb:
    'Merge k sorted lists into one: a min-heap holds each list’s head, and its root is always the next value out. O(n log k), against O(n log n) for putting everything in one array and sorting it.',
  settings: [
    withApproach(
      approachSetting({
        pattern: 'A min-heap of heads, O(n log k)',
        naive: 'Concatenate and sort, O(n log n)',
        help: 'All three give the same list. Watch the comparisons, or use Compare with this same page to run two side by side.',
      }),
      { value: 'pairs', label: 'Merge in pairs, round by round, O(n log k)' },
    ),
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
      placeholder: 'e.g. 1 8 12 | 3 4 10 | 2 9',
      maxLength: 80,
      sample: '1 8 12 | 3 4 10 15 | 2 9 11',
      parse: parseInput,
    },
    buttons: [
      { op: 'merge', label: 'Merge', usesInput: false, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random lists',
      make: (rng) => [load(split(random(rng, 10), 3)), ['merge']],
    },
    presets,
    sizes: [6, 8, 10, MAX_TOTAL],
  },
  explain,
  complexity: [
    {
      op: 'merge, a min-heap of heads',
      best: {
        cost: 'O(n + k log k)',
        why: 'Lists in order one after another: each new head is smaller than every other head and stays at the root after two comparisons. Only a list running out costs a full sift.',
        example: 'a-list-runs-out',
      },
      average: {
        cost: 'Θ(n log k)',
        why: 'Each value out costs a sift-down of at most 2 log k comparisons.',
        example: 'five-lists',
      },
      worst: {
        cost: 'O(n log k)',
        why: 'The heap never holds more than k values, so no sift is longer than its height.',
        example: 'five-lists',
      },
      note: 'Extra space is O(k): the heap holds one value per list. With k = 2 it is a plain merge with extra steps.',
    },
    {
      op: 'merge in pairs, round by round',
      best: {
        cost: 'Θ(n)',
        why: 'Lists already in order, one after another: each merge stops when the shorter list runs out.',
        example: 'already-in-order',
      },
      average: {
        cost: 'Θ(n log k)',
        why: 'About log₂ k rounds, and each round touches every value once.',
        example: 'merge-in-pairs',
      },
      worst: { cost: 'O(n log k)', why: 'At most n − 1 comparisons a round, ⌈log₂ k⌉ rounds.' },
      note: 'Merging one list at a time into a growing result is worse: the result is copied k times, O(nk).',
    },
    {
      op: 'concatenate and sort',
      best: {
        cost: 'Θ(n log n)',
        why: 'Merge sort does every pass whatever the order: the lists being sorted is wasted.',
        example: 'concatenate-and-sort',
      },
      average: { cost: 'Θ(n log n)', why: 'About log₂ n passes over all n values.' },
      worst: { cost: 'Θ(n log n)', why: 'The same passes; at most n − 1 comparisons each.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const s = settings as MergeSettings;
      const t = new Timeline(kWayMerge, s, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      t.entries.forEach((e, i) => {
        if (e.call[0] !== 'merge') return;
        const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
        const lists = before.lists.map((l) => l.map((x) => x.key));
        if (lists.flat().length === 0) return;
        input.push(`merge ${formatLists(lists)}`);
        expected.push(String(e.steps.at(-1)!.vars?.merged ?? ''));
      });
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threeLists,
    concatenateAndSort,
    mergeInPairs,
    fiveLists,
    aListRunsOut,
    equalHeads,
    twoLists,
    alreadyInOrder,
  ] as unknown as SavedExample[],
  practice: mergePractice(() => kWayMerge),
  preview: { example: 'three-lists', level: 2 },
};

export default kWayMerge;
