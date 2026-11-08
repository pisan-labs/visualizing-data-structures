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
} from '../_sorting/kit';
import { searchQuery } from '../_sorting/search';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/exponential_search.hpp?raw';
import javaSource from './code/java/ExponentialSearch.java?raw';
import pythonSource from './code/python/exponential_search.py?raw';
import doubling from './examples/doubling.json';
import farEnd from './examples/far-end.json';
import nearFront from './examples/near-front.json';
import pastTheEnd from './examples/past-the-end.json';
import unsorted from './examples/unsorted.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type ExponentialSettings,
} from './model';
import { exponentialPractice } from './practice';
import { view } from './view';

export const exponentialSearch: VizDef<ArrayState, ExponentialSettings, ArrayExtra> = {
  id: 'exponential-search',
  title: 'Exponential search',
  family: 'Searching and sorting',
  blurb: 'Jump 1, 2, 4, 8, ... slots until you pass x, then binary search the last jump.',
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
      label: 'Values or x',
      placeholder: 'e.g. 8 17 24 35, or 24',
      maxLength: 80,
      sample: '26',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'search', label: 'Search', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort A', usesInput: false },
    ],
    random: {
      label: 'Random sorted values',
      make: (rng) => [load(ascending(randomValues(rng, 16)))],
    },
    presets: [
      {
        label: 'x near the front (best case)',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['search', vs[rng.int(0, Math.min(2, n - 1))]!]];
        },
      },
      {
        label: 'x near the end',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
          return [load(vs), ['search', vs[rng.int(Math.floor((2 * n) / 3), n - 1)]!]];
        },
      },
      {
        label: 'Bigger than every value (worst case)',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n)).map((v) => Math.min(v, 97));
          return [load(vs), ['search', 99]];
        },
      },
      {
        label: 'Random sorted values, one that is there',
        make: (rng, n) => {
          const vs = ascending(distinctValues(rng, n));
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
      op: 'search(x), x at index i',
      best: {
        cost: 'O(1)',
        why: 'x is in A[0] or A[1]: the jumps stop at once and binary search has two values to look at.',
        example: 'near-front',
      },
      average: {
        cost: 'O(log i)',
        why: 'About log₂ i jumps to pass x, then binary search on a stretch of about i / 2 values: another log₂ i probes.',
        example: 'doubling',
      },
      worst: {
        cost: 'O(log n)',
        why: 'x is near the end or not there: about 2 log₂ n probes, roughly twice what binary search takes.',
        example: 'far-end',
      },
      note: 'A must be sorted. It works even when n is unknown (a stream, or an endless sorted list): the jumps find an end for binary search.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(exponentialSearch, calls, settings as ExponentialSettings, searchQuery()),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [nearFront, doubling, farEnd, pastTheEnd, unsorted] as unknown as SavedExample[],
  practice: exponentialPractice(() => exponentialSearch),
  preview: { example: 'doubling', level: 2 },
};

export default exponentialSearch;
