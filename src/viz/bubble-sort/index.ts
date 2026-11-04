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
import cppSource from './code/cpp/bubble_sort.hpp?raw';
import javaSource from './code/java/BubbleSort.java?raw';
import pythonSource from './code/python/bubble_sort.py?raw';
import alreadySorted from './examples/already-sorted.json';
import duplicates from './examples/duplicates.json';
import largestLast from './examples/largest-last.json';
import lastSwap from './examples/last-swap.json';
import reverse from './examples/reverse.json';
import smallestFirst from './examples/smallest-first.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BubbleSettings,
} from './model';
import { view } from './view';

export const bubbleSort: VizDef<ArrayState, BubbleSettings, ArrayExtra> = {
  id: 'bubble-sort',
  title: 'Bubble sort',
  family: 'Searching and sorting',
  blurb: 'Swap neighbors that are out of order, pass after pass, until no pair is left.',
  settings: [
    {
      kind: 'choice',
      key: 'direction',
      label: 'Direction of a pass',
      options: [
        { value: 'down', label: 'From the back: the smallest value moves to the front (CLRS)' },
        { value: 'up', label: 'From the front: the largest value moves to the end' },
      ],
      help: 'CLRS walks j from the back; many other books walk from the front. It is the same algorithm in a mirror.',
    },
    {
      kind: 'boolean',
      key: 'earlyExit',
      label: 'Stop early after a pass with no swaps',
      help: 'Turns the best case (sorted input) into one pass.',
    },
    {
      kind: 'boolean',
      key: 'lastSwap',
      label: 'Last-swap rule: the next pass stops where this one last swapped',
      help: 'Also stops early, so it includes the option above.',
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
      sorted: 'Sorted (best case with early exit)',
      reverse: 'Reverse sorted (worst case)',
    }),
    sizes: SORT_SIZES,
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(n)',
        why: 'Sorted input with early exit: one pass of n - 1 comparisons finds no swaps and stops. Without early exit it is still n(n - 1)/2 comparisons.',
        example: 'already-sorted',
      },
      average: {
        cost: 'O(n²)',
        why: 'Each swap fixes exactly one out-of-order pair, and random input has about n²/4 of them.',
        example: 'smallest-first',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Reverse order: all n(n - 1)/2 comparisons end in a swap.',
        example: 'reverse',
      },
      note: 'Extra space: O(1). Stable: equal neighbors never swap.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(bubbleSort, calls, settings as BubbleSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    smallestFirst,
    largestLast,
    alreadySorted,
    reverse,
    lastSwap,
    duplicates,
  ] as unknown as SavedExample[],
};

export default bubbleSort;
