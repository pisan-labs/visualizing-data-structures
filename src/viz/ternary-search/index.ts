import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
  driverScript,
  drawSetting,
  load,
  parseInput,
  randomValues,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/ternary_search.hpp?raw';
import javaSource from './code/java/TernarySearch.java?raw';
import pythonSource from './code/python/ternary_search.py?raw';
import firstPoint from './examples/first-point.json';
import moreComparisons from './examples/more-comparisons.json';
import peakAtEnd from './examples/peak-at-end.json';
import peak from './examples/peak.json';
import thirds from './examples/thirds.json';
import twoPeaks from './examples/two-peaks.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  unimodal,
  type TernarySettings,
} from './model';
import { ternaryPractice } from './practice';
import { view } from './view';

/** "search x" prints the index found; "max" prints the index of the peak. */
function query(call: OpCall, _before: ArrayState, steps: ArrayStep[]) {
  const vars = steps[steps.length - 1]!.vars;
  if (typeof vars?.result !== 'number') return null;
  if (call[0] === 'search') return { line: `search ${vars.x}`, out: String(vars.result) };
  if (call[0] === 'max') return { line: 'max', out: String(vars.result) };
  return null;
}

const sortedOrPeak = (settings?: Settings) => settings?.goal === 'max';

export const ternarySearch: VizDef<ArrayState, TernarySettings, ArrayExtra> = {
  id: 'ternary-search',
  title: 'Ternary search',
  family: 'Searching and sorting',
  blurb: 'Look at two points and keep one third: for sorted values, or for the peak of a hill.',
  settings: [
    {
      kind: 'choice',
      key: 'goal',
      label: 'What to find',
      options: [
        { value: 'value', label: 'A value x in a sorted array' },
        { value: 'max', label: 'The maximum of values that rise, then fall' },
      ],
      help: 'Picks the starting array and the presets. Both buttons work either way.',
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
      sample: '46',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'search', label: 'Search', usesInput: true, primary: true },
      { op: 'max', label: 'Find max', usesInput: false },
      { op: 'sort', label: 'Sort A', usesInput: false, more: true },
    ],
    random: {
      label: 'Random sorted values',
      make: (rng) => [load(ascending(randomValues(rng, 15)))],
    },
    presets: [
      {
        label: 'Random values for this goal',
        make: (rng, n, settings) => {
          if (sortedOrPeak(settings)) return [load(unimodal(rng, n)), ['max']];
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['search', vs[rng.int(0, n - 1)]!]];
        },
      },
      {
        label: 'Sorted, x not there (worst case)',
        make: (rng, n) => {
          const vs = distinctValues(rng, n + 1);
          return [load(ascending(vs.slice(0, n))), ['search', vs[n]!]];
        },
      },
      {
        label: 'Sorted, x at the first m1 (best case)',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['search', vs[Math.floor((n - 1) / 3)]!]];
        },
      },
      {
        label: 'A hill: rises, then falls',
        make: (rng, n) => [load(unimodal(rng, n)), ['max']],
      },
      {
        label: 'A hill with the peak at one end',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(rng.int(0, 1) ? vs : vs.reverse()), ['max']];
        },
      },
      {
        label: 'Two hills (not unimodal)',
        make: (rng, n) => {
          const half = Math.max(2, Math.floor(n / 2));
          return [load([...unimodal(rng, half), ...unimodal(rng, n - half)]), ['max']];
        },
      },
    ],
    sizes: [8, 12, 16, 20],
  },
  explain,
  complexity: [
    {
      op: 'search(x), sorted array',
      best: {
        cost: 'O(1)',
        why: 'x is at the first m1: one round, one comparison.',
        example: 'first-point',
      },
      average: {
        cost: 'O(log n)',
        why: 'Each round keeps a third of the window, so about log₃ n rounds of up to four comparisons each.',
        example: 'thirds',
      },
      worst: {
        cost: 'O(log n)',
        why: 'x is not there: about log₃ n rounds, about 4 log₃ n ≈ 2.5 log₂ n comparisons. Binary search needs at most 2 log₂ n.',
        example: 'more-comparisons',
      },
      note: 'Fewer rounds than binary search, but more comparisons. On sorted arrays binary search wins.',
    },
    {
      op: 'max(), unimodal array',
      best: {
        cost: 'O(log n)',
        why: 'It never stops early: it shrinks the window to one value, a third at a time.',
        example: 'peak',
      },
      average: {
        cost: 'O(log n)',
        why: 'Each round drops a third, so about log₁.₅ n ≈ 1.7 log₂ n rounds of one comparison.',
        example: 'peak',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The same for every unimodal array, wherever the peak is.',
        example: 'peak-at-end',
      },
      note: 'Needs values that rise, then fall, with no flat stretches.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(ternarySearch, calls, settings as TernarySettings, query),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    thirds,
    moreComparisons,
    firstPoint,
    peak,
    peakAtEnd,
    twoPeaks,
  ] as unknown as SavedExample[],
  practice: ternaryPractice(() => ternarySearch),
  preview: { example: 'peak', level: 2 },
};

export default ternarySearch;
