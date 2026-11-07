import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
  drawSetting,
  driverScript,
  load,
  parseInput,
  randomValues,
  SORT_SIZES,
  sortPresets,
  sortQuery,
  type ArrayExtra,
  type ArrayState,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/merge_sort.hpp?raw';
import javaSource from './code/java/MergeSort.java?raw';
import pythonSource from './code/python/merge_sort.py?raw';
import bottomUp from './examples/bottom-up.json';
import duplicates from './examples/duplicates.json';
import oddSize from './examples/odd-size.json';
import sortedInput from './examples/sorted-input.json';
import topDown from './examples/top-down.json';
import worstCase from './examples/worst-case.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type MergeSettings,
} from './model';
import { mergePractice } from './practice';
import { view } from './view';

/**
 * Arrange sorted values so every merge of top-down merge sort interleaves its two runs to the
 * end: the most comparisons possible. The left half (ceil(n/2) values) gets every other value.
 */
export function mostComparisons(sorted: number[]): number[] {
  if (sorted.length <= 1) return sorted;
  const left = sorted.filter((_, i) => i % 2 === 0);
  const right = sorted.filter((_, i) => i % 2 === 1);
  return [...mostComparisons(left), ...mostComparisons(right)];
}

export const mergeSort: VizDef<ArrayState, MergeSettings, ArrayExtra> = {
  id: 'merge-sort',
  title: 'Merge sort',
  family: 'Searching and sorting',
  blurb: 'Split the array in half, sort each half, then merge the two sorted halves.',
  settings: [
    {
      kind: 'choice',
      key: 'style',
      label: 'Style',
      options: [
        { value: 'topdown', label: 'Top-down: split, recurse, merge (CLRS)' },
        { value: 'bottomup', label: 'Bottom-up: merge runs of 1, 2, 4, ... with loops' },
      ],
      help: 'Same merge, same O(n log n). Bottom-up needs no recursion, so there is no call stack.',
    },
    drawSetting(),
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: describeArray,
  controls: {
    input: {
      label: 'Values',
      placeholder: 'e.g. 5 3 8 1',
      maxLength: 80,
      sample: '5 3 8 1 9 2',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort', usesInput: false },
    ],
    random: { label: 'Random values', make: (rng) => [load(randomValues(rng, 8))] },
    presets: sortPresets({ sorted: 'Sorted (fewest comparisons)' }, [
      {
        label: 'Interleaved (most comparisons)',
        make: (rng, n) => [load(mostComparisons(ascending(distinctValues(rng, n))))],
      },
    ]),
    sizes: SORT_SIZES,
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(n log n)',
        why: 'Even sorted input is split and merged at every level. Comparisons drop to about half, because L runs out first; the writes do not.',
        example: 'sorted-input',
      },
      average: {
        cost: 'O(n log n)',
        why: 'About log n levels of calls, and the merges on each level handle all n values once.',
        example: 'top-down',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'When every merge interleaves its runs to the end: 17 comparisons for 8 values, n log n - n + 1.',
        example: 'worst-case',
      },
      note: 'Extra space: O(n) for L and R. Stable: on a tie, L goes first.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(mergeSort, calls, settings as MergeSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    topDown,
    bottomUp,
    sortedInput,
    worstCase,
    oddSize,
    duplicates,
  ] as unknown as SavedExample[],
  practice: mergePractice(() => mergeSort),
  preview: { example: 'top-down', level: 2 },
};

export default mergeSort;
