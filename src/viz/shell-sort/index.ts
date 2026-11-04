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
import cppSource from './code/cpp/shell_sort.hpp?raw';
import javaSource from './code/java/ShellSort.java?raw';
import pythonSource from './code/python/shell_sort.py?raw';
import ciuraGaps from './examples/ciura-gaps.json';
import halvingTrap from './examples/halving-trap.json';
import halving from './examples/halving.json';
import knuthGaps from './examples/knuth-gaps.json';
import notStable from './examples/not-stable.json';
import sortedInput from './examples/sorted-input.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type ShellSettings,
} from './model';
import { shellPractice } from './practice';
import { view } from './view';

export const shellSort: VizDef<ArrayState, ShellSettings, ArrayExtra> = {
  id: 'shell-sort',
  title: 'Shell sort',
  family: 'Searching and sorting',
  blurb: 'Insertion sort over big gaps first, so values travel far in a few moves.',
  settings: [
    {
      kind: 'choice',
      key: 'gaps',
      label: 'Gap sequence',
      options: [
        { value: 'shell', label: "Shell's original: n/2, n/4, ..., 1" },
        { value: 'knuth', label: "Knuth's: ..., 40, 13, 4, 1 (each 3h + 1)" },
        { value: 'ciura', label: "Ciura's: ..., 57, 23, 10, 4, 1 (found by experiment)" },
      ],
      help: 'Every sequence ends with 1, so the result is always sorted. The gaps decide how much work the last pass has left.',
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
    random: { label: 'Random values', make: (rng) => [load(randomValues(rng, 8))] },
    presets: sortPresets({ sorted: 'Sorted (best case)' }, [
      {
        label: "Interleaved (worst for Shell's gaps)",
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          const small = vs.slice(0, Math.floor(n / 2));
          const large = vs.slice(Math.floor(n / 2));
          return [load(vs.map((_, i) => (i % 2 === 0 ? large[i / 2] : small[(i - 1) / 2])!))];
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
        cost: 'O(n log n)',
        why: "Sorted input: each of the log n gap passes makes fewer than n comparisons and no shifts (Shell's gaps).",
        example: 'sorted-input',
      },
      average: {
        cost: 'Depends on the gaps',
        why: "No formula is known for most sequences. With Knuth's or Ciura's gaps it grows far more slowly than n² in experiments.",
        example: 'ciura-gaps',
      },
      worst: {
        cost: 'O(n²)',
        why: "With Shell's halving gaps the early passes can do nothing at all, leaving a full insertion sort. Knuth's gaps bring the worst case down to O(n^1.5).",
        example: 'halving-trap',
      },
      note: 'Extra space: O(1). Not stable: values jump h places over equal values.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(shellSort, calls, settings as ShellSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    halving,
    knuthGaps,
    ciuraGaps,
    sortedInput,
    halvingTrap,
    notStable,
  ] as unknown as SavedExample[],
  practice: shellPractice(() => shellSort),
};

export default shellSort;
