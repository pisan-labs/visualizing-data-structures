import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  driverScript,
  drawSetting,
  load,
  randomValues,
  type ArrayState,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import { parseInputUpTo } from '../_techniques/kit';
import cppSource from './code/cpp/sliding_window.hpp?raw';
import javaSource from './code/java/SlidingWindow.java?raw';
import pythonSource from './code/python/sliding_window.py?raw';
import allDifferent from './examples/all-different.json';
import fixedSize from './examples/fixed-size.json';
import growAndShrink from './examples/grow-and-shrink.json';
import noRepeat from './examples/no-repeat.json';
import notEnough from './examples/not-enough.json';
import oneBigValue from './examples/one-big-value.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  MAX_S,
  ops,
  pseudocode,
  type WindowExtra,
  type WindowSettings,
} from './model';
import { windowPractice } from './practice';
import { view } from './view';

const sum = (vs: number[]) => vs.reduce((a, b) => a + b, 0);

export const slidingWindow: VizDef<ArrayState, WindowSettings, WindowExtra> = {
  id: 'sliding-window',
  title: 'Sliding window',
  family: 'Techniques',
  blurb:
    'A stretch of the array that slides right, keeping its sum or its counts up to date as values enter and leave. Each value enters once and leaves once: O(n).',
  settings: [drawSetting()],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: (s: ArrayState) => describeArray(s),
  controls: {
    input: {
      label: 'Values, k or S',
      placeholder: 'e.g. 3 1 4 1 5 9, or 3',
      maxLength: 80,
      sample: '3',
      parse: parseInputUpTo(MAX_S),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'fixed', label: 'Max sum of k', usesInput: true, primary: true },
      { op: 'atLeast', label: 'Shortest sum ≥ S', usesInput: true },
      { op: 'distinct', label: 'Longest with no repeat', usesInput: false },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [load(randomValues(rng, 10, 1, 9)), ['fixed', rng.int(2, 4)]],
    },
    presets: [
      {
        label: 'Random, max sum of 3',
        make: (rng, n) => [load(randomValues(rng, n, 1, 9)), ['fixed', Math.min(3, n)]],
      },
      {
        label: 'Random, shortest sum ≥ 20',
        make: (rng, n) => [load(randomValues(rng, n, 1, 9)), ['atLeast', 20]],
      },
      {
        label: 'Sorted, shortest sum ≥ 30 (the end wins)',
        make: (rng, n) => [load(ascending(randomValues(rng, n, 1, 20))), ['atLeast', 30]],
      },
      {
        label: 'Few distinct values (many repeats)',
        make: (rng, n) => [load(randomValues(rng, n, 1, 3)), ['distinct']],
      },
      {
        label: 'All different (one window, no shrinking)',
        make: (rng, n) => [load(Array.from({ length: n }, (_, i) => i + 1)), ['distinct']],
      },
      {
        label: 'S too big: no window works',
        make: (rng, n) => {
          const vs = randomValues(rng, n, 1, 9);
          return [load(vs), ['atLeast', sum(vs) + 1]];
        },
      },
    ],
    sizes: [8, 10, 14, 20],
  },
  explain,
  complexity: [
    {
      op: 'fixed(k): largest sum of k in a row',
      best: {
        cost: 'O(n)',
        why: 'k values enter the first window, then one enters and one leaves per slide.',
      },
      average: {
        cost: 'O(n)',
        why: 'n enters and n − k leaves, whatever k is.',
        example: 'fixed-size',
      },
      worst: {
        cost: 'O(n)',
        why: 'Adding up every window from scratch would be (n − k + 1)·k, O(nk).',
      },
    },
    {
      op: 'atLeast(S): shortest window with sum ≥ S',
      best: {
        cost: 'O(n)',
        why: 'S is more than all of A: every value enters, none leaves.',
        example: 'not-enough',
      },
      average: {
        cost: 'O(n)',
        why: 'l and r only move right, so at most n enters and n leaves.',
        example: 'grow-and-shrink',
      },
      worst: {
        cost: 'O(n)',
        why: 'At most 2n moves, against n(n + 1)/2 windows for trying them all.',
        example: 'one-big-value',
      },
      note: 'Needs values that are never negative: then growing can only raise the sum and shrinking only lower it.',
    },
    {
      op: 'distinct(): longest window with no repeat',
      best: {
        cost: 'O(n)',
        why: 'No value repeats: every value enters, none leaves.',
        example: 'all-different',
      },
      average: {
        cost: 'O(n)',
        why: 'Each value enters once and leaves at most once; a count update is O(1) with a hash map.',
        example: 'no-repeat',
      },
      worst: {
        cost: 'O(n)',
        why: 'Still at most 2n moves. Checking every window for a repeat is O(n²).',
      },
      note: 'Space: O(d) for the counts, d the number of distinct values.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(slidingWindow, calls, settings as WindowSettings, (call, _before, steps) => {
        const v = steps[steps.length - 1]!.vars ?? {};
        if (v.result === undefined) return null;
        if (call[0] === 'fixed') return { line: `fixed ${v.k}`, out: `${v.result} ${v.at}` };
        if (call[0] === 'atLeast') return { line: `atleast ${v.S}`, out: String(v.result) };
        if (call[0] === 'distinct') return { line: 'distinct', out: `${v.result} ${v.at}` };
        return null;
      }),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fixedSize,
    growAndShrink,
    oneBigValue,
    notEnough,
    noRepeat,
    allDifferent,
  ] as unknown as SavedExample[],
  practice: windowPractice(() => slidingWindow),
  preview: { example: 'grow-and-shrink', level: 2 },
};

export default slidingWindow;
