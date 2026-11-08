import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
  driverScript,
  fewUnique,
  load,
  nearlySorted,
  parseInput,
  randomValues,
  valuesOf,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/bitonic_sort.hpp?raw';
import javaSource from './code/java/BitonicSort.java?raw';
import pythonSource from './code/python/bitonic_sort.py?raw';
import alternating from './examples/alternating.json';
import eight from './examples/eight.json';
import four from './examples/four.json';
import notPower from './examples/not-power.json';
import sixteen from './examples/sixteen.json';
import sorted from './examples/sorted.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BitonicSettings,
} from './model';
import { bitonicPractice } from './practice';
import { view } from './view';

/** "sort" prints the sorted array; a refused sort (n not a power of two) is left out. */
function query(call: OpCall, _before: ArrayState, steps: ArrayStep[]) {
  const end = steps[steps.length - 1]!;
  if (call[0] !== 'sort' || end.vars?.sorted !== true) return null;
  return { line: 'sort', out: valuesOf(end.state).join(' ') };
}

export const bitonicSort: VizDef<ArrayState, BitonicSettings, ArrayExtra> = {
  id: 'bitonic-sort',
  title: 'Bitonic sorting network',
  family: 'Searching and sorting',
  blurb: 'A fixed network of comparators: every column runs in parallel, whatever the input.',
  settings: [
    {
      kind: 'choice',
      key: 'network',
      label: 'Network',
      options: [
        { value: 'flip', label: 'Flip, then half-cleaners (CLRS): every comparator points down' },
        { value: 'alternating', label: "Batcher's: blocks sorted up and down in turn" },
      ],
      help: 'Both sort with the same number of comparators and columns. The first is easier to draw; the second is the original.',
    },
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
      sample: '5 3 8 1',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort', usesInput: false },
    ],
    random: { label: 'Random values', make: (rng) => [load(randomValues(rng, 8))] },
    presets: [
      { label: 'Random', make: (rng, n) => [load(randomValues(rng, n))] },
      {
        label: 'Sorted (same work as any input)',
        make: (rng, n) => [load(ascending(distinctValues(rng, n)))],
      },
      {
        label: 'Reverse sorted',
        make: (rng, n) => [load(ascending(distinctValues(rng, n)).reverse())],
      },
      { label: 'Nearly sorted', make: (rng, n) => [load(nearlySorted(rng, n))] },
      { label: 'Few unique values', make: (rng, n) => [load(fewUnique(rng, n))] },
    ],
    sizes: [4, 8, 16],
  },
  explain,
  complexity: [
    {
      op: 'sort(A), comparators',
      best: {
        cost: 'Θ(n log² n)',
        why: 'The network is fixed: n/2 comparators in each of log n (log n + 1)/2 columns, for any input.',
        example: 'sorted',
      },
      average: {
        cost: 'Θ(n log² n)',
        why: 'The same comparators run on every input.',
        example: 'eight',
      },
      worst: {
        cost: 'Θ(n log² n)',
        why: 'The same comparators run on every input.',
        example: 'sixteen',
      },
      note: 'More comparisons than merge sort, but in parallel it takes only O(log² n) steps: 10 columns for 16 values.',
    },
    {
      op: 'parallel time (columns)',
      best: {
        cost: 'O(log² n)',
        why: 'Each column runs all at once: log n (log n + 1)/2 of them.',
        example: 'four',
      },
      average: {
        cost: 'O(log² n)',
        why: 'The number of columns depends only on n.',
        example: 'eight',
      },
      worst: {
        cost: 'O(log² n)',
        why: 'The number of columns depends only on n.',
        example: 'sixteen',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(bitonicSort, calls, settings as BitonicSettings, query),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [eight, sixteen, sorted, alternating, four, notPower] as unknown as SavedExample[],
  practice: bitonicPractice(() => bitonicSort),
  preview: { example: 'eight', level: 2, hide: ['wire-label', 'row-a', 'stage-'] },
};

export default bitonicSort;
