import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  drawSetting,
  driverScript,
  sortQuery,
  type ArrayExtra,
  type ArrayState,
} from '../_sorting/kit';
import { loadCall, parseInputIn, randomIn, rangePresets } from '../_sorting/linear';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/radix_sort.hpp?raw';
import javaSource from './code/java/RadixSort.java?raw';
import pythonSource from './code/python/radix_sort.py?raw';
import baseSixteen from './examples/base-sixteen.json';
import baseTwo from './examples/base-two.json';
import oneBucket from './examples/one-bucket.json';
import onePass from './examples/one-pass.json';
import stability from './examples/stability.json';
import threeDigits from './examples/three-digits.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  RANGE,
  type RadixExtra,
  type RadixSettings,
} from './model';
import { radixPractice } from './practice';
import { view } from './view';

export const radixSort: VizDef<ArrayState, RadixSettings, RadixExtra> = {
  id: 'radix-sort',
  title: 'Radix sort',
  family: 'Searching and sorting',
  blurb:
    'Sort by the last digit, then the one before it, and so on: one stable pass per digit, with a bucket for each digit value.',
  settings: [
    {
      kind: 'number',
      key: 'base',
      label: 'Base',
      min: 2,
      max: 16,
      help: 'The number of buckets. A bigger base means fewer digits, so fewer passes, but more buckets in each pass.',
    },
    { ...drawSetting(), help: 'Values in buckets are always drawn as cells.' },
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
      placeholder: `e.g. 329 457 657 (0 to ${RANGE.hi})`,
      maxLength: 60,
      sample: '329 457 657 839',
      parse: parseInputIn(RANGE),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort', usesInput: false },
    ],
    random: { label: 'Random values', make: (rng) => [loadCall(randomIn(rng, 7, 0, 999))] },
    presets: rangePresets(0, RANGE.hi, [
      {
        label: 'Three-digit values',
        make: (rng, n) => [loadCall(randomIn(rng, n, 100, 999))],
      },
      {
        label: 'One digit (one pass in base 10)',
        make: (rng, n) => [loadCall(randomIn(rng, n, 0, 9))],
      },
      {
        label: 'Same last digit (one full bucket)',
        make: (rng, n) => {
          const last = rng.int(0, 9);
          return [loadCall(randomIn(rng, n, 0, 99).map((v) => v * 10 + last))];
        },
      },
    ]),
    sizes: [6, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(d(n + b))',
        why: 'One pass when every value has one digit: n moves out and back, plus b buckets.',
        example: 'one-pass',
      },
      average: {
        cost: 'O(d(n + b))',
        why: 'd passes, each moving n values into b buckets and back: 3 passes for values up to 999.',
        example: 'three-digits',
      },
      worst: {
        cost: 'O(d(n + b))',
        why: 'Base 2 has the most passes: one per bit, 10 for values up to 999.',
        example: 'base-two',
      },
      note: 'd is the number of digits of the largest value in base b. Extra space O(n + b). Stable, and each pass must be.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(
        radixSort as unknown as VizDef<ArrayState, RadixSettings, ArrayExtra>,
        calls,
        settings as RadixSettings,
        sortQuery,
      ),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threeDigits,
    stability,
    baseTwo,
    baseSixteen,
    onePass,
    oneBucket,
  ] as unknown as SavedExample[],
  practice: radixPractice(() => radixSort),
  preview: { example: 'three-digits', level: 2 },
};

export default radixSort;
