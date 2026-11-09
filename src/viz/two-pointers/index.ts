import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
  driverScript,
  drawSetting,
  load,
  randomValues,
  valuesOf,
  type ArrayState,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import { parseInputUpTo } from '../_techniques/kit';
import cppSource from './code/cpp/two_pointers.hpp?raw';
import javaSource from './code/java/TwoPointers.java?raw';
import pythonSource from './code/python/two_pointers.py?raw';
import findPair from './examples/find-pair.json';
import firstTry from './examples/first-try.json';
import mostWater from './examples/most-water.json';
import noPair from './examples/no-pair.json';
import removeDuplicates from './examples/remove-duplicates.json';
import reverseInPlace from './examples/reverse-in-place.json';
import sortFirst from './examples/sort-first.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  MAX_TARGET,
  ops,
  pseudocode,
  type TwoExtra,
  type TwoSettings,
} from './model';
import { twoPractice } from './practice';
import { view } from './view';

/** A target that some pair of the sorted values adds up to. */
function pairTarget(rng: { int(lo: number, hi: number): number }, vs: number[]): number {
  const i = rng.int(0, vs.length - 2);
  const j = rng.int(i + 1, vs.length - 1);
  return vs[i]! + vs[j]!;
}

/** The smallest target above the first pair's sum that no pair adds up to. */
function missingTarget(vs: number[]): number {
  const sums = new Set<number>();
  vs.forEach((x, i) => vs.slice(i + 1).forEach((y) => sums.add(x + y)));
  let t = Math.floor((vs[0]! + vs[vs.length - 1]!) / 2) + 1;
  while (sums.has(t) && t < MAX_TARGET) t++;
  return t;
}

export const twoPointers: VizDef<ArrayState, TwoSettings, TwoExtra> = {
  id: 'two-pointers',
  title: 'Two pointers',
  family: 'Techniques',
  blurb:
    'An index at each end of an array, moving in. Each move rules out a whole row of candidate pairs, so n − 1 checks do the work of n(n − 1)/2.',
  settings: [drawSetting()],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: (s: ArrayState) => describeArray(s),
  controls: {
    input: {
      label: 'Values or a target',
      placeholder: 'e.g. 2 5 9 14 21, or 23',
      maxLength: 80,
      sample: '23',
      parse: parseInputUpTo(MAX_TARGET),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'pairSum', label: 'Pair sum', usesInput: true, primary: true },
      { op: 'dedupe', label: 'Remove duplicates', usesInput: false },
      { op: 'reverse', label: 'Reverse', usesInput: false },
      { op: 'water', label: 'Most water', usesInput: false, more: true },
      { op: 'sort', label: 'Sort A', usesInput: false, more: true },
    ],
    random: {
      label: 'Random sorted values',
      make: (rng) => {
        const vs = ascending(distinctValues(rng, 10));
        return [load(vs), ['pairSum', pairTarget(rng, vs)]];
      },
    },
    presets: [
      {
        label: 'Sorted, with a pair that adds up',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['pairSum', pairTarget(rng, vs)]];
        },
      },
      {
        label: 'Sorted, no pair adds up (worst case)',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['pairSum', missingTarget(vs)]];
        },
      },
      {
        label: 'The two ends add up (best case)',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['pairSum', vs[0]! + vs[n - 1]!]];
        },
      },
      {
        label: 'Sorted with repeats',
        make: (rng, n) => [
          load(ascending(randomValues(rng, n, 1, Math.max(3, n - 2)))),
          ['dedupe'],
        ],
      },
      {
        label: 'Random walls',
        make: (rng, n) => [load(randomValues(rng, n, 1, 20)), ['water']],
      },
      {
        label: 'Random, then reverse',
        make: (rng, n) => [load(randomValues(rng, n)), ['reverse']],
      },
    ],
    sizes: [6, 8, 10, 14],
  },
  explain,
  complexity: [
    {
      op: 'pairSum(target) on a sorted array',
      best: {
        cost: 'O(1)',
        why: 'The two ends already add up to the target: one check.',
        example: 'first-try',
      },
      average: {
        cost: 'O(n)',
        why: 'Each check moves a pointer one step in, ruling out a row or column of pairs.',
        example: 'find-pair',
      },
      worst: {
        cost: 'O(n)',
        why: 'No pair adds up: the pointers walk until they meet, n − 1 checks.',
        example: 'no-pair',
      },
      note: 'Trying every pair takes n(n − 1)/2 checks, O(n²). On unsorted input, sorting first costs O(n log n).',
    },
    {
      op: 'maxWater()',
      best: { cost: 'O(n)', why: 'Every move narrows the gap by one: always n − 1 pairs.' },
      average: {
        cost: 'O(n)',
        why: 'The same n − 1 pairs, whatever the heights.',
        example: 'most-water',
      },
      worst: { cost: 'O(n)', why: 'n − 1 pairs, against n(n − 1)/2 for trying every pair.' },
    },
    {
      op: 'removeDuplicates()',
      best: { cost: 'O(n)', why: 'fast reads every value once, even when none repeats.' },
      average: {
        cost: 'O(n)',
        why: 'One comparison per value after the first, and at most one copy.',
        example: 'remove-duplicates',
      },
      worst: {
        cost: 'O(n)',
        why: 'n − 1 comparisons. Deleting each duplicate by shifting the rest left would be O(n²).',
      },
      note: 'Space: O(1). It works in place and returns how many values to keep.',
    },
    {
      op: 'reverse()',
      best: { cost: 'O(n)', why: '⌊n/2⌋ swaps, whatever the values.' },
      average: { cost: 'O(n)', why: 'Each swap fixes two positions.', example: 'reverse-in-place' },
      worst: { cost: 'O(n)', why: 'The same ⌊n/2⌋ swaps.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(twoPointers, calls, settings as TwoSettings, (call, _before, steps) => {
        const last = steps[steps.length - 1]!;
        if (call[0] === 'reverse') return { line: 'reverse', out: valuesOf(last.state).join(' ') };
        const result = last.vars?.result;
        if (result === undefined) return null;
        if (call[0] === 'pairSum')
          return {
            line: `pair ${call[1]}`,
            out: result === 'none' ? 'none' : String(result).replace(', ', ' '),
          };
        if (call[0] === 'dedupe')
          return { line: 'dedupe', out: `${result}: ${valuesOf(last.state).join(' ')}` };
        if (call[0] === 'water') return { line: 'water', out: String(result) };
        return null;
      }),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    findPair,
    noPair,
    firstTry,
    sortFirst,
    mostWater,
    removeDuplicates,
    reverseInPlace,
  ] as unknown as SavedExample[],
  practice: twoPractice(() => twoPointers),
  preview: { example: 'find-pair', level: 2 },
};

export default twoPointers;
