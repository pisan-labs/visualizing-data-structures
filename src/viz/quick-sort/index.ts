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
import { partitionSettings } from '../_sorting/partition';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/quicksort.hpp?raw';
import javaSource from './code/java/QuickSort.java?raw';
import pythonSource from './code/python/quicksort.py?raw';
import allEqual from './examples/all-equal.json';
import hoare from './examples/hoare.json';
import lomuto from './examples/lomuto.json';
import medianOfThree from './examples/median-of-three.json';
import randomPivot from './examples/random-pivot.json';
import sortedWorst from './examples/sorted-worst.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type QuickSettings,
} from './model';
import { view } from './view';

export const quickSort: VizDef<ArrayState, QuickSettings, ArrayExtra> = {
  id: 'quick-sort',
  title: 'Quicksort',
  family: 'Searching and sorting',
  blurb: 'Pick a pivot, split the array around it, then sort each side the same way.',
  settings: [
    ...partitionSettings('A random pivot makes sorted input as fast as any other.'),
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
    presets: sortPresets({ sorted: 'Sorted (worst for the last pivot)' }, [
      {
        label: 'All equal (worst for Lomuto)',
        make: (rng, n) => {
          const v = rng.int(10, 90);
          return [load(Array.from({ length: n }, () => v))];
        },
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
        why: 'Every pivot lands in the middle, so there are about log n levels of calls, each doing O(n) work.',
        example: 'median-of-three',
      },
      average: {
        cost: 'O(n log n)',
        why: 'With a random pivot some splits are lopsided, but the expected depth is still O(log n): about 1.39 n log₂ n comparisons.',
        example: 'random-pivot',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Sorted input with the last value as pivot: each partition peels off one value, so n(n - 1)/2 comparisons and calls n deep.',
        example: 'sorted-worst',
      },
      note: 'Sorts in place, but the call stack needs O(log n) space on average and O(n) in the worst case. Not stable.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(quickSort, calls, settings as QuickSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lomuto,
    sortedWorst,
    medianOfThree,
    randomPivot,
    hoare,
    allEqual,
  ] as unknown as SavedExample[],
};

export default quickSort;
