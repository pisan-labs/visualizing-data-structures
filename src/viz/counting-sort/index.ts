import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  drawSetting,
  driverScript,
  SORT_SIZES,
  sortQuery,
  type ArrayExtra,
  type ArrayState,
} from '../_sorting/kit';
import { loadCall, parseInputIn, randomIn, rangePresets } from '../_sorting/linear';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/counting_sort.hpp?raw';
import javaSource from './code/java/CountingSort.java?raw';
import pythonSource from './code/python/counting_sort.py?raw';
import allEqual from './examples/all-equal.json';
import bigK from './examples/big-k.json';
import countAndPlace from './examples/count-and-place.json';
import reverse from './examples/reverse.json';
import stable from './examples/stable.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  RANGE,
  type CountExtra,
  type CountSettings,
} from './model';
import { countingPractice } from './practice';
import { view } from './view';

export const countingSort: VizDef<ArrayState, CountSettings, CountExtra> = {
  id: 'counting-sort',
  title: 'Counting sort',
  family: 'Searching and sorting',
  blurb:
    'Count how often each value occurs, add up the counts, then drop every value straight into its place. No comparisons.',
  settings: [drawSetting()],
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
      placeholder: `e.g. 2 5 3 0 (0 to ${RANGE.hi})`,
      maxLength: 80,
      sample: '2 5 3 0 2 3',
      parse: parseInputIn(RANGE),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort', usesInput: false },
    ],
    random: { label: 'Random values', make: (rng) => [loadCall(randomIn(rng, 8, 0, 9))] },
    presets: rangePresets(0, RANGE.hi, [
      {
        label: 'Small k: values 0 to 3',
        make: (rng, n) => [loadCall(randomIn(rng, n, 0, 3))],
      },
      {
        label: 'Big k for n: one value of 20',
        make: (rng, n) => {
          const vs = randomIn(rng, Math.max(1, Math.round(n / 4)), 0, 4);
          return [loadCall([...vs, RANGE.hi])];
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
        cost: 'O(n + k)',
        why: 'Every value is counted and placed once, and every count is added once, whatever the order.',
        example: 'all-equal',
      },
      average: {
        cost: 'O(n + k)',
        why: 'Eight values up to 5: 8 counts, 5 additions, 8 placements and 8 copies.',
        example: 'count-and-place',
      },
      worst: {
        cost: 'O(n + k)',
        why: 'A big k costs even with few values: four values up to 20 need 20 additions.',
        example: 'big-k',
      },
      note: 'Extra space: O(n + k) for B and C. Stable. Values must be whole numbers from 0 to k.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(
        countingSort as unknown as VizDef<ArrayState, CountSettings, ArrayExtra>,
        calls,
        settings as CountSettings,
        sortQuery,
      ),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [countAndPlace, stable, bigK, allEqual, reverse] as unknown as SavedExample[],
  practice: countingPractice(() => countingSort),
};

export default countingSort;
