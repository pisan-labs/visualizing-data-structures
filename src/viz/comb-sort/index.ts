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
import cppSource from './code/cpp/comb_sort.hpp?raw';
import javaSource from './code/java/CombSort.java?raw';
import pythonSource from './code/python/comb_sort.py?raw';
import halving from './examples/halving.json';
import reverse from './examples/reverse.json';
import shrinkingGap from './examples/shrinking-gap.json';
import sorted from './examples/sorted.json';
import turtle from './examples/turtle.json';
import unstable from './examples/unstable.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type CombSettings,
} from './model';
import { combPractice } from './practice';
import { view } from './view';

export const combSort: VizDef<ArrayState, CombSettings, ArrayExtra> = {
  id: 'comb-sort',
  title: 'Comb sort',
  family: 'Searching and sorting',
  blurb: 'Bubble sort with a shrinking gap, so small values near the end jump home fast.',
  settings: [
    {
      kind: 'choice',
      key: 'shrink',
      label: 'Shrink the gap by',
      options: [
        { value: '1.3', label: '1.3 (the usual choice)' },
        { value: '2', label: '2 (halving, too fast)' },
        { value: '1.1', label: '1.1 (too slow: many passes)' },
      ],
      help: 'Too fast and turtles are left behind for bubble passes to fix; too slow and every pass costs n comparisons for little gain.',
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
    presets: sortPresets({ reverse: 'Reverse sorted' }, [
      {
        label: 'Turtles: small values at the end',
        make: (rng, n) => {
          const k = Math.max(1, Math.floor(n / 4));
          const big = Array.from({ length: n - k }, (_, i) => 30 + Math.round((i * 65) / n));
          const small = Array.from({ length: k }, () => rng.int(1, 25));
          return [load([...big, ...small])];
        },
      },
      {
        label: 'Rabbits: big values at the front',
        make: (rng, n) => {
          const k = Math.max(1, Math.floor(n / 4));
          const big = Array.from({ length: k }, () => rng.int(80, 99));
          const rest = Array.from({ length: n - k }, (_, i) => 5 + Math.round((i * 70) / n));
          return [load([...big, ...rest])];
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
        why: 'Even sorted input gets a pass for every gap, about log₁.₃ n passes of up to n comparisons each.',
        example: 'sorted',
      },
      average: {
        cost: 'Ω(n² / 2ᵖ)',
        why: 'p is the number of gaps (passes before gap 1). No tidy formula is known; on random input it runs close to n log n, far ahead of bubble sort.',
        example: 'shrinking-gap',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Some inputs leave values out of place after the big gaps, and gap-1 passes then crawl like bubble sort.',
        example: 'halving',
      },
      note: 'Extra space: O(1). Not stable: a long swap can jump one value over an equal one.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(combSort, calls, settings as CombSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [turtle, shrinkingGap, sorted, reverse, halving, unstable] as unknown as SavedExample[],
  practice: combPractice(() => combSort),
  preview: { example: 'shrinking-gap', level: 2 },
};

export default combSort;
