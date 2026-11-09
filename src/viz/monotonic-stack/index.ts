import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
  driverScript,
  drawSetting,
  load,
  parseInput,
  randomValues,
  type ArrayState,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/monotonic_stack.hpp?raw';
import javaSource from './code/java/MonotonicStack.java?raw';
import pythonSource from './code/python/monotonic_stack.py?raw';
import allWaiting from './examples/all-waiting.json';
import answeredAtOnce from './examples/answered-at-once.json';
import histogram from './examples/histogram.json';
import nextGreater from './examples/next-greater.json';
import previousSmaller from './examples/previous-smaller.json';
import staircase from './examples/staircase.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type MonoExtra,
  type StackSettings,
} from './model';
import { stackPractice } from './practice';
import { view } from './view';

export const monotonicStack: VizDef<ArrayState, StackSettings, MonoExtra> = {
  id: 'monotonic-stack',
  title: 'Monotonic stack',
  family: 'Techniques',
  blurb:
    'A stack whose values stay in order. Each new value pops what it breaks the order with, and every pop answers a question: the next greater value, or the largest rectangle.',
  settings: [
    {
      kind: 'choice',
      key: 'find',
      label: 'Scan for',
      options: [
        { value: 'next-greater', label: 'The next greater value (stack decreases)' },
        { value: 'previous-smaller', label: 'The previous smaller value (stack increases)' },
      ],
      help: 'The same loop answers both; only the comparison and when the answer is written change.',
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
  describe: (s: ArrayState) => describeArray(s),
  controls: {
    input: {
      label: 'Values',
      placeholder: 'e.g. 4 7 3 2 5 8',
      maxLength: 80,
      sample: '4 7 3 2 5',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'scan', label: 'Scan with the stack', usesInput: false, primary: true },
      { op: 'histogram', label: 'Largest rectangle', usesInput: false },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [load(randomValues(rng, 9, 1, 30)), ['scan']],
    },
    presets: [
      { label: 'Random', make: (rng, n) => [load(randomValues(rng, n, 1, 30)), ['scan']] },
      {
        label: 'Decreasing (the stack fills up)',
        make: (rng, n) => [load(ascending(distinctValues(rng, n)).reverse()), ['scan']],
      },
      {
        label: 'Increasing (each answered at once)',
        make: (rng, n) => [load(ascending(distinctValues(rng, n))), ['scan']],
      },
      {
        label: 'Few distinct values (ties)',
        make: (rng, n) => [load(randomValues(rng, n, 1, 3)), ['scan']],
      },
      {
        label: 'Random histogram',
        make: (rng, n) => [load(randomValues(rng, n, 1, 9)), ['histogram']],
      },
      {
        label: 'A staircase histogram',
        make: (_rng, n) => [load(Array.from({ length: n }, (_, i) => i + 1)), ['histogram']],
      },
    ],
    sizes: [6, 9, 12, 16],
  },
  explain,
  complexity: [
    {
      op: 'scan: next greater (or previous smaller) for every value',
      best: {
        cost: 'O(n)',
        why: 'Decreasing values: n pushes and no pops until the end.',
        example: 'all-waiting',
      },
      average: {
        cost: 'O(n)',
        why: 'Each index is pushed once and popped at most once, so at most 2n stack operations.',
        example: 'next-greater',
      },
      worst: {
        cost: 'O(n)',
        why: 'One value can pop many at once, but the pops add up to at most n over the whole scan.',
        example: 'answered-at-once',
      },
      note: 'Brute force scans right from every value: up to n(n − 1)/2 comparisons, O(n²). Space: O(n) for the stack.',
    },
    {
      op: 'histogram: largest rectangle',
      best: {
        cost: 'O(n)',
        why: 'Every bar is pushed once and popped once, by a lower bar or by the height-0 bar at the end.',
      },
      average: {
        cost: 'O(n)',
        why: 'Each pop measures one rectangle in O(1).',
        example: 'histogram',
      },
      worst: {
        cost: 'O(n)',
        why: 'Rising bars wait to the end and are all popped there: still n pops.',
        example: 'staircase',
      },
      note: 'Trying every stretch of bars with its lowest bar is O(n²).',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(monotonicStack, calls, settings as StackSettings, (call, _before, steps) => {
        const v = steps[steps.length - 1]!.vars ?? {};
        if (v.result === undefined) return null;
        if (call[0] === 'scan')
          return {
            line: (settings as StackSettings).find === 'next-greater' ? 'next' : 'prev',
            out: String(v.result),
          };
        if (call[0] === 'histogram') return { line: 'histogram', out: String(v.result) };
        return null;
      }),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    nextGreater,
    allWaiting,
    answeredAtOnce,
    previousSmaller,
    histogram,
    staircase,
  ] as unknown as SavedExample[],
  practice: stackPractice(() => monotonicStack),
  preview: { example: 'next-greater', level: 2 },
};

export default monotonicStack;
