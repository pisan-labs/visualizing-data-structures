import type { Rng } from '../../engine/rng';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
  driverScript,
  drawSetting,
  fewUnique,
  load,
  parseInput,
  randomValues,
  type ArrayExtra,
  type ArrayState,
} from '../_sorting/kit';
import { searchQuery } from '../_sorting/search';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/interpolation_search.hpp?raw';
import javaSource from './code/java/InterpolationSearch.java?raw';
import pythonSource from './code/python/interpolation_search.py?raw';
import allEqual from './examples/all-equal.json';
import justShort from './examples/just-short.json';
import notThere from './examples/not-there.json';
import oneProbe from './examples/one-probe.json';
import skewed from './examples/skewed.json';
import unsorted from './examples/unsorted.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type InterpolationSettings,
} from './model';
import { interpolationPractice } from './practice';
import { view } from './view';

/** n sorted values spread evenly from about 3 to 97, with a little jitter. */
function even(rng: Rng, n: number): number[] {
  const step = Math.floor(94 / n);
  return Array.from({ length: n }, (_, i) => 3 + i * step + rng.int(0, Math.max(0, step - 2)));
}

/** 1, 2, ..., n - 1 and then one big value: the straight-line guess is far too flat. */
const skewedValues = (n: number): number[] => [
  ...Array.from({ length: n - 1 }, (_, i) => i + 1),
  99,
];

export const interpolationSearch: VizDef<ArrayState, InterpolationSettings, ArrayExtra> = {
  id: 'interpolation-search',
  title: 'Interpolation search',
  family: 'Searching and sorting',
  blurb: 'Guess where x is from its value, the way you open a phone book near the back for "W".',
  settings: [
    {
      kind: 'boolean',
      key: 'guide',
      label: 'Draw the straight line behind each guess (bars)',
      help: 'The guess assumes the values climb in a straight line from A[lo] to A[hi]. The line shows where the height of x meets it.',
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
      label: 'Values or x',
      placeholder: 'e.g. 8 17 24 35, or 24',
      maxLength: 80,
      sample: '55',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'search', label: 'Search', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort A', usesInput: false },
    ],
    random: {
      label: 'Random sorted values',
      make: (rng) => [load(ascending(randomValues(rng, 12)))],
    },
    presets: [
      {
        label: 'Evenly spread values (best case)',
        make: (rng, n) => {
          const vs = even(rng, n);
          return [load(vs), ['search', vs[rng.int(0, n - 1)]!]];
        },
      },
      {
        label: 'Evenly spread, x not there',
        make: (rng, n) => {
          const vs = even(rng, n);
          const i = rng.int(0, n - 2);
          const x = vs[i]! + 1 < vs[i + 1]! ? vs[i]! + 1 : vs[n - 1]! + 1;
          return [load(vs), ['search', Math.min(99, x)]];
        },
      },
      {
        label: 'Skewed values (worst case)',
        make: (_rng, n) => {
          const vs = skewedValues(n);
          return [load(vs), ['search', vs[n - 2]!]];
        },
      },
      {
        label: 'Random sorted values',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['search', vs[rng.int(0, n - 1)]!]];
        },
      },
      {
        label: 'Repeated values',
        make: (rng, n) => {
          const vs = ascending(fewUnique(rng, n));
          return [load(vs), ['search', vs[rng.int(0, n - 1)]!]];
        },
      },
      {
        label: 'Unsorted values',
        make: (rng, n) => {
          const vs = distinctValues(rng, n);
          return [load(vs), ['search', vs[0]!]];
        },
      },
    ],
    sizes: [8, 12, 16, 20],
  },
  explain,
  complexity: [
    {
      op: 'search(x)',
      best: {
        cost: 'O(1)',
        why: 'The first guess lands on x, as it often does on evenly spread values.',
        example: 'one-probe',
      },
      average: {
        cost: 'O(log log n)',
        why: 'On values spread evenly at random, each guess shrinks the window from n to about √n, so about log log n probes.',
        example: 'just-short',
      },
      worst: {
        cost: 'O(n)',
        why: 'Skewed values make the straight-line guess land short every time, so the window shrinks by a slot or two per probe.',
        example: 'skewed',
      },
      note: 'A must be sorted. Each probe costs a multiply and a divide, more than binary search spends on its middle, so it pays off only on big arrays of evenly spread values.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(interpolationSearch, calls, settings as InterpolationSettings, searchQuery()),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    oneProbe,
    justShort,
    skewed,
    notThere,
    allEqual,
    unsorted,
  ] as unknown as SavedExample[],
  practice: interpolationPractice(() => interpolationSearch),
  preview: { example: 'one-probe', level: 2 },
};

export default interpolationSearch;
