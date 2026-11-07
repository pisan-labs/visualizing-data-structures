import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  drawSetting,
  driverScript,
  load,
  parseInput,
  randomValues,
  SORT_SIZES,
  sortPresets,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
} from '../_sorting/kit';
import { partitionSettings } from '../_sorting/partition';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/quickselect.hpp?raw';
import javaSource from './code/java/QuickSelect.java?raw';
import pythonSource from './code/python/quickselect.py?raw';
import duplicates from './examples/duplicates.json';
import hoare from './examples/hoare.json';
import lucky from './examples/lucky.json';
import median from './examples/median.json';
import smallest from './examples/smallest.json';
import sortedWorst from './examples/sorted-worst.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type SelectSettings,
} from './model';
import { selectPractice } from './practice';
import { view } from './view';

/** Driver protocol: "select k" prints the k-th smallest value. Rejected calls are left out. */
function selectQuery(call: OpCall, _before: ArrayState, steps: ArrayStep[]) {
  const result = steps[steps.length - 1]!.vars?.result;
  if (call[0] !== 'select' || typeof result !== 'number') return null;
  return { line: `select ${steps[steps.length - 1]!.vars!.k}`, out: String(result) };
}

export const quickselect: VizDef<ArrayState, SelectSettings, ArrayExtra> = {
  id: 'quickselect',
  title: 'Quickselect',
  family: 'Searching and sorting',
  blurb: 'Find the k-th smallest value by partitioning, without sorting the whole array.',
  settings: [
    ...partitionSettings(
      "CLRS's RANDOMIZED-SELECT uses a random pivot, so that is the default here.",
    ),
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
      label: 'Values or k',
      placeholder: 'e.g. 5 3 8 1, or 2',
      maxLength: 80,
      sample: '3',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'select', label: 'Select', usesInput: true, primary: true },
    ],
    random: { label: 'Random values', make: (rng) => [load(randomValues(rng, 8))] },
    presets: sortPresets({}, [
      {
        label: 'Random values, find the median',
        make: (rng, n) => [load(randomValues(rng, n)), ['select', Math.ceil(n / 2)]],
      },
    ]),
    sizes: SORT_SIZES,
  },
  explain,
  complexity: [
    {
      op: 'select(k)',
      best: {
        cost: 'O(n)',
        why: 'The first pivot lands in the target slot: one partition, n - 1 comparisons.',
        example: 'lucky',
      },
      average: {
        cost: 'O(n)',
        why: 'Each partition throws away a good share of the range on average, so the work adds up like n + 3n/4 + (3/4)²n + ..., which is O(n).',
        example: 'median',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Sorted input, last value as pivot, k = 1: each partition removes only one value, n(n - 1)/2 comparisons.',
        example: 'sorted-worst',
      },
      note: "Reorders A as it goes. CLRS's SELECT (median of medians) guarantees O(n) in the worst case too.",
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(quickselect, calls, settings as SelectSettings, selectQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [median, smallest, lucky, sortedWorst, hoare, duplicates] as unknown as SavedExample[],
  practice: selectPractice(() => quickselect),
  preview: { example: 'median', level: 2 },
};

export default quickselect;
