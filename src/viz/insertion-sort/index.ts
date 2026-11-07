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
import cppSource from './code/cpp/insertion_sort.hpp?raw';
import javaSource from './code/java/InsertionSort.java?raw';
import pythonSource from './code/python/insertion_sort.py?raw';
import alreadySorted from './examples/already-sorted.json';
import duplicates from './examples/duplicates.json';
import nearlySorted from './examples/nearly-sorted.json';
import reverse from './examples/reverse.json';
import shiftRight from './examples/shift-right.json';
import swapLeft from './examples/swap-left.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type InsertionSettings,
} from './model';
import { insertionPractice } from './practice';
import { view } from './view';

export const insertionSort: VizDef<ArrayState, InsertionSettings, ArrayExtra> = {
  id: 'insertion-sort',
  title: 'Insertion sort',
  family: 'Searching and sorting',
  blurb: 'Grow a sorted part one value at a time, sliding each new value into its place.',
  settings: [
    {
      kind: 'choice',
      key: 'move',
      label: 'Make room by',
      options: [
        { value: 'shift', label: 'Holding the key and shifting larger values right (CLRS)' },
        { value: 'swap', label: 'Swapping the new value with its left neighbor' },
      ],
      help: 'Same comparisons. A shift is one write; a swap is three.',
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
      sorted: 'Sorted (best case)',
      reverse: 'Reverse sorted (worst case)',
      nearly: 'Nearly sorted (fast)',
    }),
    sizes: SORT_SIZES,
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(n)',
        why: 'Sorted input: each new value is compared once with its left neighbor and stays put.',
        example: 'already-sorted',
      },
      average: {
        cost: 'O(n²)',
        why: 'One shift per out-of-order pair, and random input has about n²/4 of them.',
        example: 'shift-right',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Reverse order: every new value travels all the way to the front, n(n - 1)/2 shifts.',
        example: 'reverse',
      },
      note: 'Shifts = out-of-order pairs, so nearly sorted input is fast. Extra space: O(1). Stable.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(insertionSort, calls, settings as InsertionSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    shiftRight,
    swapLeft,
    alreadySorted,
    nearlySorted,
    reverse,
    duplicates,
  ] as unknown as SavedExample[],
  practice: insertionPractice(() => insertionSort),
  preview: { example: 'shift-right', level: 2 },
};

export default insertionSort;
