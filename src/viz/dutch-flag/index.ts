import type { Rng } from '../../engine/rng';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import {
  ascending,
  drawSetting,
  driverScript,
  load,
  valuesOf,
  type ArrayState,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import { intArg, parseInputUpTo } from '../_techniques/kit';
import cppSource from './code/cpp/three_way.hpp?raw';
import javaSource from './code/java/ThreeWay.java?raw';
import pythonSource from './code/python/three_way.py?raw';
import allAbove from './examples/all-above.json';
import allEqual from './examples/all-equal.json';
import countThenRewrite from './examples/count-then-rewrite.json';
import pivotMissing from './examples/pivot-missing.json';
import threeColors from './examples/three-colors.json';
import threeKinds from './examples/three-kinds.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  MAX_PIVOT,
  ops,
  partitionValues,
  pseudocode,
  type FlagExtra,
  type FlagSettings,
} from './model';
import { flagPractice } from './practice';
import { view } from './view';

const between = (rng: Rng, n: number, lo: number, hi: number) =>
  Array.from({ length: n }, () => rng.int(lo, hi));

/** Values with a pivot that is one of them. */
function withPivot(vs: number[], rng: Rng): OpCall[] {
  return [load(vs), ['partition', vs[rng.int(0, vs.length - 1)]!]];
}

const presets: Preset[] = [
  {
    label: 'Random, pivot from the array',
    make: (rng, n) => withPivot(between(rng, n, 1, 9), rng),
  },
  {
    label: 'Three colors: 0, 1 and 2, pivot 1',
    make: (rng, n) => [load(between(rng, n, 0, 2)), ['partition', 1]],
  },
  {
    label: 'All equal to the pivot (no swaps)',
    make: (rng, n) => {
      const v = rng.int(2, 9);
      return [load(Array(n).fill(v)), ['partition', v]];
    },
  },
  {
    label: 'All above the pivot (a swap every step)',
    make: (rng, n) => [load(between(rng, n, 5, 9)), ['partition', rng.int(1, 4)]],
  },
  {
    label: 'All below the pivot (every swap is with itself)',
    make: (rng, n) => [load(between(rng, n, 1, 5)), ['partition', rng.int(6, 9)]],
  },
  {
    label: 'Pivot not in the array (a two-way split)',
    make: (rng, n) => {
      const p = rng.int(3, 7);
      const vs = between(rng, n, 1, 8).map((v) => (v >= p ? v + 1 : v));
      return [load(vs), ['partition', p]];
    },
  },
  {
    label: 'Sorted',
    make: (rng, n) => withPivot(ascending(between(rng, n, 1, 9)), rng),
  },
  {
    label: 'Reverse sorted',
    make: (rng, n) => withPivot(ascending(between(rng, n, 1, 9)).reverse(), rng),
  },
];

export const dutchFlag: VizDef<ArrayState, FlagSettings, FlagExtra> = {
  id: 'dutch-flag',
  title: 'Dutch national flag (three-way partition)',
  family: 'Array and string tricks',
  blurb:
    'Put the values below a pivot first, then the ones equal to it, then the ones above, in one pass and in place: three indices keep four regions, and each step shrinks the unknown one. n comparisons, against two passes and n extra slots for counting then rewriting.',
  settings: [
    approachSetting({
      pattern: 'Three pointers, one pass, in place',
      naive: 'Count, then rewrite: two passes and a copy',
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
      label: 'Pivot, or values',
      placeholder: 'e.g. 5, or 7 2 5 9 to load',
      maxLength: 80,
      sample: '5',
      parse: parseInputUpTo(MAX_PIVOT),
    },
    buttons: [
      { op: 'partition', label: 'Partition', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => withPivot(between(rng, 9, 1, 9), rng),
    },
    presets,
    sizes: [6, 9, 12],
  },
  explain,
  complexity: [
    {
      op: 'partition, three pointers',
      best: {
        cost: 'O(n)',
        why: 'Every value equals p: n comparisons, mid walks to the end, no swaps.',
        example: 'all-equal',
      },
      average: {
        cost: 'O(n)',
        why: 'Each step looks at one value and makes at most one swap.',
        example: 'three-kinds',
      },
      worst: {
        cost: 'O(n)',
        why: 'Every value above p: n comparisons and n − 1 swaps (the last is with itself), and mid never moves.',
        example: 'all-above',
      },
      note: 'The loop runs exactly n times: each step makes the unknown region one smaller. A step on a value equal to p swaps nothing, and with no such value the last step swaps a value with itself, so there are at most n − 1 swaps.',
    },
    {
      op: 'partition, count then rewrite',
      best: {
        cost: 'Θ(n)',
        why: '2n comparisons and 2n writes whatever the values: two passes and a copy.',
        example: 'count-then-rewrite',
      },
      average: { cost: 'Θ(n)', why: 'The same 4n steps: nothing stops early.' },
      worst: {
        cost: 'Θ(n)',
        why: '9 values: 18 comparisons and 18 writes, against 9 comparisons and 3 swaps.',
        example: 'count-then-rewrite',
      },
    },
    {
      op: 'extra space',
      best: {
        cost: 'O(1)',
        why: 'Three pointers keep three indices and swap in place.',
        example: 'three-kinds',
      },
      average: { cost: 'O(1) or O(n)', why: 'Counting needs three counts, but rewriting needs B.' },
      worst: {
        cost: 'O(n)',
        why: 'Count then rewrite copies every value into B, n extra slots.',
        example: 'count-then-rewrite',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    // The code is the pattern; it is driven by the pattern's run whatever the approach, since
    // counting then rewriting leaves the values of a kind in another order.
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(
        dutchFlag,
        calls,
        { ...(settings as FlagSettings), approach: 'pattern' },
        (call, before) => {
          if (call[0] !== 'partition') return null;
          const p = intArg(call[1], 0, MAX_PIVOT, 'The pivot');
          if (typeof p === 'string') return null;
          const r = partitionValues(valuesOf(before), p);
          return { line: `partition ${p}`, out: `${r.a.join(' ')} | ${r.low} ${r.high}` };
        },
      ),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threeKinds,
    countThenRewrite,
    threeColors,
    allEqual,
    allAbove,
    pivotMissing,
  ] as unknown as SavedExample[],
  practice: flagPractice(() => dutchFlag),
  preview: { example: 'three-colors', level: 2, hide: ['heading', 'pivot-'] },
};

export default dutchFlag;
