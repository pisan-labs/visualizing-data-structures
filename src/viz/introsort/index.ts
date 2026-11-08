import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
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
import cppSource from './code/cpp/introsort.hpp?raw';
import javaSource from './code/java/Introsort.java?raw';
import pythonSource from './code/python/introsort.py?raw';
import killerExample from './examples/killer.json';
import shortBudget from './examples/short-budget.json';
import smallParts from './examples/small-parts.json';
import sortedLast from './examples/sorted-last.json';
import typical from './examples/typical.json';
import unstable from './examples/unstable.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  killer,
  ops,
  pseudocode,
  type IntroSettings,
} from './model';
import { introPractice } from './practice';
import { view } from './view';

export const introsort: VizDef<ArrayState, IntroSettings, ArrayExtra> = {
  id: 'introsort',
  title: 'Introsort',
  family: 'Searching and sorting',
  blurb:
    'Quicksort with a depth budget: heap sort takes over when it runs out, insertion sort finishes small parts.',
  settings: [
    {
      kind: 'choice',
      key: 'pivot',
      label: 'Pivot',
      options: [
        { value: 'median3', label: 'Median of first, middle and last (as libraries do)' },
        { value: 'last', label: 'Last value (CLRS quicksort)' },
      ],
    },
    {
      kind: 'choice',
      key: 'depth',
      label: 'Depth budget',
      options: [
        { value: 'twice', label: '2⌊log₂ n⌋ (Musser, the C++ libraries)' },
        { value: 'once', label: '⌊log₂ n⌋ (switches sooner)' },
      ],
      help: 'A well-behaved quicksort goes about log₂ n deep. Going twice that deep means the pivots are bad.',
    },
    {
      kind: 'number',
      key: 'small',
      label: 'Insertion sort parts of at most',
      min: 1,
      max: 8,
      help: 'Libraries use 16; with at most 20 values here, a smaller cutoff leaves quicksort some work.',
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
    presets: sortPresets({}, [
      {
        label: 'Median-of-3 killer (worst case)',
        make: (_rng, n, settings) => [
          load(killer(n, { ...defaults, ...settings } as IntroSettings)),
        ],
      },
      {
        label: 'Sorted, for the last-value pivot',
        make: (rng, n) => [load(ascending(distinctValues(rng, n)))],
      },
    ]),
    sizes: SORT_SIZES,
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(n log n)',
        why: 'Good pivots: about log₂ n levels of partitioning, O(n) work per level.',
        example: 'typical',
      },
      average: {
        cost: 'O(n log n)',
        why: 'On random input it is quicksort, which rarely comes near the depth budget.',
        example: 'typical',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'Quicksort stops after 2 log₂ n levels of O(n) work each, and heap sort finishes every part left in O(n log n).',
        example: 'killer',
      },
      note: 'In place, with O(log n) stack. Not stable. C++ std::sort and .NET Array.Sort work this way.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(introsort, calls, settings as IntroSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    typical,
    killerExample,
    shortBudget,
    sortedLast,
    smallParts,
    unstable,
  ] as unknown as SavedExample[],
  practice: introPractice(() => introsort),
  preview: { example: 'killer', level: 1 },
};

export default introsort;
