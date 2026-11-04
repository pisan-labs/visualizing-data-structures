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
  type ArrayStep,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/binary_search.hpp?raw';
import javaSource from './code/java/BinarySearch.java?raw';
import pythonSource from './code/python/binary_search.py?raw';
import duplicates from './examples/duplicates.json';
import firstOccurrence from './examples/first-occurrence.json';
import firstProbe from './examples/first-probe.json';
import found from './examples/found.json';
import insertionPoint from './examples/insertion-point.json';
import lowerBound from './examples/lower-bound.json';
import notFound from './examples/not-found.json';
import recursive from './examples/recursive.json';
import unsorted from './examples/unsorted.json';
import upperBound from './examples/upper-bound.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BinarySettings,
  type Variant,
} from './model';
import { binaryPractice } from './practice';
import { view } from './view';

/** Driver commands, one per variant. */
const COMMANDS: Record<Variant, string> = {
  exact: 'search',
  first: 'first',
  lower: 'lower',
  upper: 'upper',
  insert: 'locate',
};

/** "search x" (or first, lower, upper, locate) prints what the model returned. */
const searchQuery =
  (variant: Variant) => (call: OpCall, _before: ArrayState, steps: ArrayStep[]) => {
    const vars = steps[steps.length - 1]!.vars;
    if (call[0] !== 'search' || typeof vars?.result !== 'number') return null;
    return { line: `${COMMANDS[variant]} ${vars.x}`, out: String(vars.result) };
  };

export const binarySearch: VizDef<ArrayState, BinarySettings, ArrayExtra> = {
  id: 'binary-search',
  title: 'Binary search',
  family: 'Searching and sorting',
  blurb: 'Look in the middle of a sorted array and throw away the half that cannot hold x.',
  settings: [
    {
      kind: 'choice',
      key: 'variant',
      label: 'What to return',
      options: [
        { value: 'exact', label: 'Exact match: an index of x, or -1' },
        { value: 'first', label: 'First occurrence: the first x, or -1' },
        { value: 'lower', label: 'Lower bound: the first value ≥ x' },
        { value: 'upper', label: 'Upper bound: the first value > x' },
        { value: 'insert', label: 'Insertion point, like Java: an index of x, or -(lo + 1)' },
      ],
      help: 'With repeated values, an exact match can stop at any copy of x. The others pin down one end.',
    },
    {
      kind: 'choice',
      key: 'style',
      label: 'Style',
      options: [
        { value: 'iterative', label: 'Iterative: a loop' },
        { value: 'recursive', label: 'Recursive: a call for each half' },
      ],
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
      sample: '42',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'search', label: 'Search', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort A', usesInput: false },
    ],
    random: {
      label: 'Random sorted values',
      make: (rng) => [load(ascending(randomValues(rng, 10)))],
    },
    presets: [
      {
        label: 'Sorted values, one that is there',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['search', vs[rng.int(0, n - 1)]!]];
        },
      },
      {
        label: 'Sorted values, one that is not (worst case)',
        make: (rng, n) => {
          const vs = distinctValues(rng, n + 1);
          return [load(ascending(vs.slice(0, n))), ['search', vs[n]!]];
        },
      },
      {
        label: 'The middle value (best case)',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['search', vs[Math.floor((n - 1) / 2)]!]];
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
      op: 'search(x), exact match',
      best: {
        cost: 'O(1)',
        why: 'x is the first value it looks at, in the middle.',
        example: 'first-probe',
      },
      average: {
        cost: 'O(log n)',
        why: 'Each probe halves the window, so about log₂ n probes.',
        example: 'found',
      },
      worst: {
        cost: 'O(log n)',
        why: 'x is not there: the window shrinks to empty after at most ⌊log₂ n⌋ + 1 probes.',
        example: 'not-found',
      },
      note: 'A must be sorted. 20 values take at most 5 probes, and a million take at most 20.',
    },
    {
      op: 'lowerBound(x), upperBound(x)',
      best: {
        cost: 'O(log n)',
        why: 'They never stop early: the window always shrinks to empty.',
        example: 'lower-bound',
      },
      average: {
        cost: 'O(log n)',
        why: 'About log₂ n probes, whatever x is.',
        example: 'lower-bound',
      },
      worst: {
        cost: 'O(log n)',
        why: 'At most ⌊log₂ n⌋ + 1 probes.',
        example: 'upper-bound',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(
        binarySearch,
        calls,
        settings as BinarySettings,
        searchQuery((settings as BinarySettings).variant),
      ),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    found,
    firstProbe,
    notFound,
    duplicates,
    firstOccurrence,
    lowerBound,
    upperBound,
    insertionPoint,
    unsorted,
    recursive,
  ] as unknown as SavedExample[],
  practice: binaryPractice(() => binarySearch),
};

export default binarySearch;
