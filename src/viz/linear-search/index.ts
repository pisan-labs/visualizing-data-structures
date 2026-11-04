import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
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
import cppSource from './code/cpp/linear_search.hpp?raw';
import javaSource from './code/java/LinearSearch.java?raw';
import pythonSource from './code/python/linear_search.py?raw';
import duplicates from './examples/duplicates.json';
import firstSlot from './examples/first-slot.json';
import found from './examples/found.json';
import notFound from './examples/not-found.json';
import sentinel from './examples/sentinel.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type LinearSettings,
} from './model';
import { linearPractice } from './practice';
import { view } from './view';

/** Driver protocol: "search x" prints the index the model returned. Rejected calls are left out. */
function searchQuery(call: OpCall, _before: ArrayState, steps: ArrayStep[]) {
  const vars = steps[steps.length - 1]!.vars;
  if (call[0] !== 'search' || typeof vars?.result !== 'number') return null;
  return { line: `search ${vars.x}`, out: String(vars.result) };
}

export const linearSearch: VizDef<ArrayState, LinearSettings, ArrayExtra> = {
  id: 'linear-search',
  title: 'Linear search',
  family: 'Searching and sorting',
  blurb: 'Look at every value in turn until you find the one you want.',
  settings: [
    {
      kind: 'boolean',
      key: 'sentinel',
      label: 'Sentinel: put x in a spare slot past the end',
      help: 'The loop is then sure to stop, so it can skip the i < n check on every step.',
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
      placeholder: 'e.g. 5 3 8 1, or 8',
      maxLength: 80,
      sample: '35',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'search', label: 'Search', usesInput: true, primary: true },
    ],
    random: { label: 'Random values', make: (rng) => [load(randomValues(rng, 8))] },
    presets: [
      {
        label: 'Random values, a value that is there',
        make: (rng, n) => {
          const vs = distinctValues(rng, n);
          return [load(vs), ['search', vs[rng.int(0, n - 1)]!]];
        },
      },
      {
        label: 'Random values, a missing value (worst case)',
        make: (rng, n) => {
          const vs = distinctValues(rng, n + 1);
          return [load(vs.slice(0, n)), ['search', vs[n]!]];
        },
      },
      {
        label: 'The value is first (best case)',
        make: (rng, n) => {
          const vs = distinctValues(rng, n);
          return [load(vs), ['search', vs[0]!]];
        },
      },
      {
        label: 'Few unique values',
        make: (rng, n) => {
          const keys = distinctValues(rng, 3);
          const vs = Array.from({ length: n }, () => keys[rng.int(0, 2)]!);
          return [load(vs), ['search', keys[rng.int(0, 2)]!]];
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
        why: 'x is in A[0]: one comparison and done.',
        example: 'first-slot',
      },
      average: {
        cost: 'O(n)',
        why: 'If x is there, at a random position, about n/2 comparisons; if it is not, all n.',
        example: 'found',
      },
      worst: {
        cost: 'O(n)',
        why: 'x is not there (or is the last value): every value is compared.',
        example: 'not-found',
      },
      note: 'No precondition: the values can be in any order. A sentinel saves the index checks, not the comparisons.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(linearSearch, calls, settings as LinearSettings, searchQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [found, notFound, firstSlot, duplicates, sentinel] as unknown as SavedExample[],
  practice: linearPractice(() => linearSearch),
};

export default linearSearch;
