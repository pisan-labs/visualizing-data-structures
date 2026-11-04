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
import cppSource from './code/cpp/cocktail_sort.hpp?raw';
import javaSource from './code/java/CocktailSort.java?raw';
import pythonSource from './code/python/cocktail_sort.py?raw';
import alreadySorted from './examples/already-sorted.json';
import duplicates from './examples/duplicates.json';
import lastSwap from './examples/last-swap.json';
import reverse from './examples/reverse.json';
import shaker from './examples/shaker.json';
import turtle from './examples/turtle.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type CocktailSettings,
} from './model';
import { view } from './view';

export const cocktailSort: VizDef<ArrayState, CocktailSettings, ArrayExtra> = {
  id: 'cocktail-sort',
  title: 'Cocktail shaker sort',
  family: 'Searching and sorting',
  blurb: 'Bubble sort in both directions: large values move right, then small values move left.',
  settings: [
    {
      kind: 'choice',
      key: 'shrink',
      label: 'After each pass, shrink the window',
      options: [
        { value: 'one', label: 'By one at that end' },
        { value: 'last', label: 'To where the pass last swapped' },
      ],
      help: 'Everything past the last swap is already in place, so the second rule can skip several values at once.',
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
    presets: sortPresets({ sorted: 'Sorted (best case)', reverse: 'Reverse sorted (worst case)' }, [
      {
        label: 'Small value at the end (a turtle)',
        make: (rng, n) => {
          const vs = Array.from({ length: n }, (_, i) => 10 + Math.round((i * 85) / n));
          return [load([...vs.slice(1), rng.int(1, 9)])];
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
        why: 'Sorted input: the first forward pass makes n - 1 comparisons, finds no swaps and stops.',
        example: 'already-sorted',
      },
      average: {
        cost: 'O(n²)',
        why: 'Each swap still fixes exactly one out-of-order pair, and random input has about n²/4 of them.',
        example: 'shaker',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Reverse order: every comparison ends in a swap, n(n - 1)/2 of each.',
        example: 'reverse',
      },
      note: 'Extra space: O(1). Stable. It beats bubble sort on small values stuck near the end, not on the total work.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(cocktailSort, calls, settings as CocktailSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    turtle,
    shaker,
    alreadySorted,
    reverse,
    lastSwap,
    duplicates,
  ] as unknown as SavedExample[],
};

export default cocktailSort;
