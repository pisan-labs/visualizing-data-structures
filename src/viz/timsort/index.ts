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
import cppSource from './code/cpp/timsort.hpp?raw';
import javaSource from './code/java/TimSort.java?raw';
import pythonSource from './code/python/timsort.py?raw';
import gallop from './examples/gallop.json';
import naturalRuns from './examples/natural-runs.json';
import shortRuns from './examples/short-runs.json';
import sorted from './examples/sorted.json';
import stable from './examples/stable.json';
import stackInvariant from './examples/stack-invariant.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type TimSettings,
} from './model';
import { timPractice } from './practice';
import { view } from './view';

export const timsort: VizDef<ArrayState, TimSettings, ArrayExtra> = {
  id: 'timsort',
  title: 'Timsort',
  family: 'Searching and sorting',
  blurb: 'Find the runs already in the data, grow short ones, and merge them off a stack.',
  settings: [
    {
      kind: 'number',
      key: 'minrun',
      label: 'minrun: extend runs shorter than',
      min: 2,
      max: 8,
      help: 'Real Timsort picks 32 to 64 from n. With at most 20 values here, a small minrun leaves several runs to merge.',
    },
    {
      kind: 'boolean',
      key: 'gallop',
      label: 'Gallop to skip values already in place before a merge',
      help: 'Exponential search from each end finds the stretches that need no merging at all.',
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
    random: { label: 'Random values', make: (rng) => [load(randomValues(rng, 12))] },
    presets: sortPresets({ sorted: 'Sorted (best case)' }, [
      {
        label: 'A few long runs',
        make: (rng, n) => {
          const out: number[] = [];
          while (out.length < n) {
            const len = Math.min(n - out.length, rng.int(3, 6));
            const start = rng.int(1, 60);
            const run = Array.from({ length: len }, (_, i) => start + i * rng.int(2, 7));
            out.push(...(rng.int(0, 3) ? run : run.reverse()).map((v) => Math.min(99, v)));
          }
          return [load(out)];
        },
      },
      {
        label: 'Sorted, then a few new values',
        make: (rng, n) => {
          const k = Math.max(2, Math.floor(n / 4));
          const base = Array.from({ length: n - k }, (_, i) => 5 + Math.round((i * 90) / n));
          return [load([...base, ...randomValues(rng, k)])];
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
        cost: 'O(n)',
        why: 'Sorted (or reverse sorted) input is one run: n - 1 comparisons and nothing to merge.',
        example: 'sorted',
      },
      average: {
        cost: 'O(n log n)',
        why: 'Random input has short runs. They are grown to minrun and merged like merge sort, with merges between runs of similar size.',
        example: 'short-runs',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'The stack rules keep it O(log n) deep, so each value takes part in O(log n) merges.',
        example: 'stack-invariant',
      },
      note: 'Stable. O(n) extra space for tmp in the worst case, often much less. Python, Java (for objects), Android and V8 use it.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(timsort, calls, settings as TimSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    naturalRuns,
    shortRuns,
    sorted,
    stackInvariant,
    gallop,
    stable,
  ] as unknown as SavedExample[],
  practice: timPractice(() => timsort),
  preview: { example: 'natural-runs', level: 1, hide: ['row-aux', 'slot-aux', 'idx-aux'] },
};

export default timsort;
