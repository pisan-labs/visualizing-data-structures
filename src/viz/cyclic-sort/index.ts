import type { Rng } from '../../engine/rng';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import { drawSetting, driverScript, load, valuesOf, type ArrayState } from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/cyclic_sort.hpp?raw';
import javaSource from './code/java/CyclicSort.java?raw';
import pythonSource from './code/python/cyclic_sort.py?raw';
import alreadyHome from './examples/already-home.json';
import manyRepeats from './examples/many-repeats.json';
import oneLongCycle from './examples/one-long-cycle.json';
import oneMissing from './examples/one-missing.json';
import sortFirst from './examples/sort-first.json';
import twoCycles from './examples/two-cycles.json';
import explain from './explain.md?raw';
import {
  cyclicValues,
  defaults,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pseudocode,
  readValues,
  type CyclicExtra,
  type CyclicSettings,
} from './model';
import { cyclicPractice, withRepeats } from './practice';
import { view } from './view';

const count = (n: number) => Array.from({ length: n }, (_, k) => k + 1);

/** 1..n in one cycle: each value sits `shift` slots before its home, wrapping around. */
const oneCycle = (rng: Rng, n: number) => {
  // A shift of 1 or n − 1 makes one cycle; another shift may split it into several.
  const shift = rng.int(0, 1) ? 1 : n - 1;
  return count(n).map((_, k) => ((k + shift) % n) + 1);
};

const presets: Preset[] = [
  { label: 'One repeated, one missing', make: (rng, n) => [load(withRepeats(rng, n, 1))] },
  {
    label: 'A shuffle of 1 to n (nothing missing)',
    make: (rng, n) => [load(withRepeats(rng, n, 0))],
  },
  {
    label: 'One long cycle (n − 1 swaps, the most)',
    make: (rng, n) => [load(oneCycle(rng, n))],
  },
  { label: 'Already home (no swaps)', make: (_rng, n) => [load(count(n))] },
  { label: 'Reverse order', make: (_rng, n) => [load(count(n).reverse())] },
  {
    label: 'Many repeats',
    make: (rng, n) => [load(withRepeats(rng, n, Math.ceil(n / 2)))],
  },
  {
    label: 'All the same value',
    make: (rng, n) => [load(Array(n).fill(rng.int(1, n)))],
  },
];

export const cyclicSort: VizDef<ArrayState, CyclicSettings, CyclicExtra> = {
  id: 'cyclic-sort',
  title: 'Cyclic sort',
  family: 'Array and string tricks',
  blurb:
    'n numbers from 1 to n: each value names its own slot, so swap each one home. Every swap puts a value in place for good, at most n − 1 swaps, and then one scan finds what is missing and what is repeated. O(n), against n(n − 1)/2 comparisons for selection sort.',
  settings: [
    approachSetting({
      pattern: 'Cyclic sort: swap each value home, O(n)',
      naive: 'Selection sort, then scan, O(n²)',
    }),
    drawSetting(),
  ],
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
      label: 'Values, each from 1 to n',
      placeholder: 'e.g. 3 1 4 1 2',
      maxLength: 60,
      sample: '3 1 4 1 2',
      parse: (token: string) => {
        const vs = readValues(token);
        return typeof vs === 'string' ? new Error(vs) : vs.join(' ');
      },
    },
    buttons: [
      { op: 'sort', label: 'Sort, then scan', usesInput: false, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [load(withRepeats(rng, 8, rng.int(0, 2)))],
    },
    presets,
    sizes: [6, 8, 10, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'cyclic sort, then scan',
      best: {
        cost: 'O(n)',
        why: 'Every value already home: n comparisons, no swaps, then n for the scan.',
        example: 'already-home',
      },
      average: {
        cost: 'O(n)',
        why: 'Each comparison either sends a value home for good or moves i on: at most 2n − 1 of them.',
        example: 'one-missing',
      },
      worst: {
        cost: 'O(n)',
        why: 'One cycle through every slot: n − 1 swaps, 2n − 1 comparisons, then the scan.',
        example: 'one-long-cycle',
      },
      note: 'A swap puts at least one value home, and a value at home never moves again, so there are at most n − 1 swaps.',
    },
    {
      op: 'selection sort, then scan',
      best: {
        cost: 'Θ(n²)',
        why: 'n(n − 1)/2 comparisons whatever the values, even when every value is home.',
        example: 'already-home',
      },
      average: {
        cost: 'Θ(n²)',
        why: 'Each slot searches the rest for its smallest value.',
        example: 'sort-first',
      },
      worst: {
        cost: 'Θ(n²)',
        why: '8 values: 28 comparisons to sort, against 13 for cyclic sort.',
        example: 'sort-first',
      },
      note: 'A sort that compares values needs about n log₂ n comparisons in the worst case; cyclic sort beats that because a value tells it where to go.',
    },
    {
      op: 'extra space',
      best: {
        cost: 'O(1)',
        why: 'Both swap in place and keep a few indices.',
        example: 'one-missing',
      },
      average: { cost: 'O(1)', why: 'The input array is the only array.' },
      worst: {
        cost: 'O(1)',
        why: 'A count per number would take n slots; the swaps make the array its own table.',
        example: 'many-repeats',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    // The code is the pattern, so drive it with the pattern's run whatever the approach:
    // selection sort leaves the repeats in other slots.
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(
        cyclicSort,
        calls,
        { ...(settings as CyclicSettings), approach: 'pattern' },
        (call, before) => {
          if (call[0] !== 'sort') return null;
          const { a } = cyclicValues(valuesOf(before));
          const missing: number[] = [];
          const repeated: number[] = [];
          a.forEach((v, i) => {
            if (v !== i + 1) {
              missing.push(i + 1);
              repeated.push(v);
            }
          });
          const list = (xs: number[]) => (xs.length ? xs.join(' ') : '-');
          return { line: 'sort', out: `${a.join(' ')} | ${list(missing)} | ${list(repeated)}` };
        },
      ),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    oneMissing,
    sortFirst,
    oneLongCycle,
    twoCycles,
    alreadyHome,
    manyRepeats,
  ] as unknown as SavedExample[],
  practice: cyclicPractice(() => cyclicSort),
  preview: { example: 'one-missing', level: 2, hide: ['heading', 'missing-', 'repeated-', 'ptr-'] },
};

export default cyclicSort;
