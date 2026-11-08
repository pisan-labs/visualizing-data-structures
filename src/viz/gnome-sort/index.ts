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
import cppSource from './code/cpp/gnome_sort.hpp?raw';
import javaSource from './code/java/GnomeSort.java?raw';
import pythonSource from './code/python/gnome_sort.py?raw';
import duplicates from './examples/duplicates.json';
import jump from './examples/jump.json';
import reverse from './examples/reverse.json';
import sorted from './examples/sorted.json';
import walkBack from './examples/walk-back.json';
import walk from './examples/walk.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type GnomeSettings,
} from './model';
import { gnomePractice } from './practice';
import { view } from './view';

export const gnomeSort: VizDef<ArrayState, GnomeSettings, ArrayExtra> = {
  id: 'gnome-sort',
  title: 'Gnome sort',
  family: 'Searching and sorting',
  blurb: 'One index walks the array: forward when the pair is in order, back after a swap.',
  settings: [
    {
      kind: 'boolean',
      key: 'jump',
      label: 'Jump back to where the gnome left off',
      help: 'Without it, the gnome walks forward over the sorted part after every insertion. With it, it is insertion sort with swaps.',
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
        label: 'Small value at the end',
        make: (rng, n) => {
          const vs = Array.from({ length: n - 1 }, (_, i) => 10 + Math.round((i * 85) / n));
          return [load([...vs, rng.int(1, 9)])];
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
        why: 'Sorted input: the gnome walks straight to the end, n - 1 comparisons and no swaps.',
        example: 'sorted',
      },
      average: {
        cost: 'O(n²)',
        why: 'One swap per out-of-order pair, about n²/4 of them, and a walk back over each one.',
        example: 'walk',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Reverse order: n(n - 1)/2 swaps, and about as many comparisons again walking forward.',
        example: 'reverse',
      },
      note: 'Extra space: O(1). Stable. Jumping back makes it insertion sort, which saves the walks but not the swaps.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(gnomeSort, calls, settings as GnomeSettings, sortQuery),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [walk, walkBack, jump, sorted, reverse, duplicates] as unknown as SavedExample[],
  practice: gnomePractice(() => gnomeSort),
  preview: { example: 'walk', level: 2 },
};

export default gnomeSort;
