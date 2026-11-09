import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/karatsuba.hpp?raw';
import javaSource from './code/java/Karatsuba.java?raw';
import pythonSource from './code/python/karatsuba.py?raw';
import baseCase from './examples/base-case.json';
import fourProducts from './examples/four-products.json';
import sumsGrow from './examples/sums-grow.json';
import threeProducts from './examples/three-products.json';
import twoDigit from './examples/two-digit.json';
import uneven from './examples/uneven-lengths.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX,
  ops,
  pseudocode,
  type KaraSettings,
  type KaraState,
} from './model';
import { karatsubaPractice } from './practice';
import { view } from './view';

const digitsOf = (rng: { int(a: number, b: number): number }, n: number) =>
  rng.int(10 ** (n - 1), 10 ** n - 1);

export const karatsuba: VizDef<KaraState, KaraSettings, undefined> = {
  id: 'karatsuba',
  title: 'Karatsuba multiplication',
  family: 'Divide and conquer',
  blurb:
    'Split both numbers in half and multiply with three half-size products instead of four: n^1.585 digit products instead of n².',
  settings: [
    {
      kind: 'choice',
      key: 'split',
      label: 'Products per split',
      options: [
        { value: 'three', label: 'Three: Karatsuba, (a+b)(c+d) − ac − bd' },
        { value: 'four', label: 'Four: plain divide and conquer, ac, ad, bc, bd' },
      ],
      help: 'Four products per split is no faster than the schoolbook method: T(n) = 4T(n/2) + O(n) is still O(n²). The third product is the whole trick.',
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
      label: 'x y',
      placeholder: `two numbers, e.g. 1234 5678 (up to ${MAX})`,
      maxLength: 20,
      sample: '1234',
      parse: (t) => parseWhole(t, 0, MAX, 'Each number'),
    },
    buttons: [
      { op: 'multiply', label: 'Multiply x·y', usesInput: true, primary: true, args: ['x', 'y'] },
    ],
    random: {
      label: 'Random 4-digit numbers',
      make: (rng) => [['multiply', digitsOf(rng, 4), digitsOf(rng, 4)]],
    },
    presets: [
      {
        label: 'Two random numbers of n digits',
        make: (rng, size) => [['multiply', digitsOf(rng, size), digitsOf(rng, size)]],
      },
      {
        label: 'All nines (sums grow a digit)',
        make: (_rng, size) => [['multiply', 10 ** size - 1, 10 ** size - 1]],
      },
      {
        label: 'Powers of ten',
        make: (_rng, size) => [['multiply', 10 ** (size - 1), 10 ** (size - 1)]],
      },
      {
        label: 'Different lengths',
        make: (rng, size) => [
          ['multiply', digitsOf(rng, size), digitsOf(rng, Math.max(1, size - 2))],
        ],
      },
    ],
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'multiply two n-digit numbers: digit products',
      best: {
        cost: 'O(1)',
        why: 'A single digit times anything is the base case: no split at all.',
        example: 'base-case',
      },
      average: {
        cost: 'O(n^1.585)',
        why: 'T(n) = 3T(n/2) + O(n): three half-size products per level, so 3^(log₂ n) = n^(log₂ 3) leaves.',
        example: 'three-products',
      },
      worst: {
        cost: 'O(n^1.585)',
        why: 'The sums a + b may carry into an extra digit, which changes the constant, not the growth.',
        example: 'sums-grow',
      },
      note: 'The schoolbook method and the four-product split both make n² digit products.',
    },
    {
      op: 'four products per split',
      best: { cost: 'O(1)', why: 'The same base case.', example: 'base-case' },
      average: {
        cost: 'O(n²)',
        why: 'T(n) = 4T(n/2) + O(n): 4^(log₂ n) = n² leaves, no better than schoolbook.',
        example: 'four-products',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Every split makes all four products, so every digit of x meets every digit of y.',
        example: 'four-products',
      },
    },
  ],
  practice: karatsubaPractice(() => karatsuba),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as KaraSettings),
  },
  examples: [
    threeProducts,
    fourProducts,
    twoDigit,
    baseCase,
    sumsGrow,
    uneven,
  ] as unknown as SavedExample[],
  opening: 'three-products',
  preview: { example: 'three-products', level: 2 },
};

/** Driver protocol: "multiply x y" prints the product and the number of calls (three products). */
function codeScript(calls: OpCall[], settings: KaraSettings) {
  const t = new Timeline(karatsuba, { ...settings, split: 'three' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const end = e.end;
    if (e.steps.length < 2 || !end.done) continue;
    const root = end.calls[0]!;
    input.push(`multiply ${root.x} ${root.y}`);
    expected.push(`${root.result} ${end.calls.length}`);
  }
  return { input, expected };
}

export default karatsuba;
