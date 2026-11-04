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
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/selection_sort.hpp?raw';
import javaSource from './code/java/SelectionSort.java?raw';
import pythonSource from './code/python/selection_sort.py?raw';
import largestLast from './examples/largest-last.json';
import notStable from './examples/not-stable.json';
import reverse from './examples/reverse.json';
import smallestFirst from './examples/smallest-first.json';
import sortedInput from './examples/sorted-input.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type SelectionSettings,
} from './model';
import { view } from './view';

export const selectionSort: VizDef<ArrayState, SelectionSettings, ArrayExtra> = {
  id: 'selection-sort',
  title: 'Selection sort',
  family: 'Searching and sorting',
  blurb: 'Find the smallest value, swap it into place, and repeat on the rest.',
  settings: [
    {
      kind: 'choice',
      key: 'select',
      label: 'Each pass selects',
      options: [
        { value: 'min', label: 'The minimum, which goes to the front (CLRS)' },
        { value: 'max', label: 'The maximum, which goes to the end' },
      ],
      help: 'Both make the same number of comparisons and swaps; the sorted part grows from the other end.',
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
    presets: sortPresets({
      sorted: 'Sorted (no better than random)',
      reverse: 'Reverse sorted',
      few: 'Few unique values (watch stability)',
    }),
    sizes: SORT_SIZES,
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(n²)',
        why: 'Even sorted input: each pass scans the whole unsorted part, n(n - 1)/2 comparisons in all.',
        example: 'sorted-input',
      },
      average: {
        cost: 'O(n²)',
        why: 'The comparisons do not depend on the order of the values at all.',
        example: 'smallest-first',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Same n(n - 1)/2 comparisons as every other input.',
        example: 'reverse',
      },
      note: 'Exactly n - 1 swaps, the fewest of the simple sorts. Extra space: O(1). Not stable.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(selectionSort, calls, settings as SelectionSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    smallestFirst,
    largestLast,
    sortedInput,
    reverse,
    notStable,
  ] as unknown as SavedExample[],
};

export default selectionSort;
