import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
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
import cppSource from './code/cpp/heap_sort.hpp?raw';
import javaSource from './code/java/HeapSort.java?raw';
import pythonSource from './code/python/heap_sort.py?raw';
import allEqual from './examples/all-equal.json';
import buildBottomUp from './examples/build-bottom-up.json';
import notStable from './examples/not-stable.json';
import reverseInput from './examples/reverse-input.json';
import sortedInput from './examples/sorted-input.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type HeapSortSettings,
} from './model';
import { heapSortPractice } from './practice';
import { describeHeapSort, view } from './view';

export const heapSort: VizDef<ArrayState, HeapSortSettings, ArrayExtra> = {
  id: 'heap-sort',
  title: 'Heap sort',
  family: 'Searching and sorting',
  blurb:
    'Build a max-heap in the array, then swap the largest value to the end and sift down, again and again. O(n log n) in every case, in place.',
  settings: [
    {
      kind: 'choice',
      key: 'index',
      label: 'Array indexing',
      options: [
        { value: 'one', label: 'From 1 (CLRS): children of i are 2i and 2i + 1' },
        { value: 'zero', label: 'From 0: children of i are 2i + 1 and 2i + 2' },
      ],
      help: 'The pseudocode, the narration and the index labels all follow this choice.',
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
  describe: (state, settings) => describeHeapSort(state, settings.index === 'zero' ? 0 : 1),
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
    presets: sortPresets(
      {
        sorted: 'Sorted (every value sinks while building)',
        reverse: 'Reverse sorted (already a max-heap)',
        few: 'Few unique values (watch stability)',
      },
      [
        {
          label: 'All equal (nothing sifts down)',
          make: (rng, n) => [load(Array.from({ length: n }, () => 10 * rng.int(1, 9)))],
        },
      ],
    ),
    sizes: SORT_SIZES,
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(n log n)',
        why: 'With distinct values, even sorted or reverse-sorted input: each new root sifts down most of the heap’s height.',
        example: 'reverse-input',
      },
      average: {
        cost: 'O(n log n)',
        why: 'n − 1 sift-downs from the root, each O(log n), after an O(n) build.',
        example: 'build-bottom-up',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'A sift-down never goes deeper than the tree, ⌊log₂ n⌋ levels, with two comparisons a level.',
        example: 'sorted-input',
      },
      note: 'In place: O(1) extra space. Not stable. Many equal values are the exception to the best case: they never sift down, and all-equal values take O(n).',
    },
    {
      op: 'buildMaxHeap(A, n)',
      best: {
        cost: 'O(n)',
        why: 'Input that is already a max-heap: n/2 sift-downs that stop at once, with no swaps.',
        example: 'reverse-input',
      },
      average: {
        cost: 'O(n)',
        why: 'Half the nodes are leaves, a quarter sit one level up, and so on: the heights add up to less than n.',
        example: 'build-bottom-up',
      },
      worst: {
        cost: 'O(n)',
        why: 'Sorted input sends every value down to a leaf, and that is still fewer than n swaps.',
        example: 'sorted-input',
      },
    },
    {
      op: 'maxHeapify(A, i)',
      best: {
        cost: 'O(1)',
        why: 'Neither child is bigger: two comparisons and it stops.',
        example: 'all-equal',
      },
      average: {
        cost: 'O(log n)',
        why: 'A value that came from the bottom tends to sink back to the bottom.',
        example: 'build-bottom-up',
      },
      worst: {
        cost: 'O(log n)',
        why: 'One swap per level, from i down to a leaf.',
        example: 'sorted-input',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(heapSort, calls, settings as HeapSortSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    buildBottomUp,
    sortedInput,
    reverseInput,
    notStable,
    allEqual,
  ] as unknown as SavedExample[],
  practice: heapSortPractice(() => heapSort),
  preview: { example: 'build-bottom-up' },
};

export default heapSort;
