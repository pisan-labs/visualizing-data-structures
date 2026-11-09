import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctValues,
  driverScript,
  drawSetting,
  load,
  randomValues,
  type ArrayState,
} from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import { MAX_N, parseInputUpTo } from '../_techniques/kit';
import cppSource from './code/cpp/monotonic_queue.hpp?raw';
import javaSource from './code/java/MonotonicQueue.java?raw';
import pythonSource from './code/python/monotonic_queue.py?raw';
import decreasing from './examples/decreasing.json';
import increasing from './examples/increasing.json';
import oneWindow from './examples/one-window.json';
import windowMax from './examples/window-max.json';
import windowMin from './examples/window-min.json';
import windowOfOne from './examples/window-of-one.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type QueueExtra,
  type QueueSettings,
} from './model';
import { queuePractice } from './practice';
import { view } from './view';

export const monotonicQueue: VizDef<ArrayState, QueueSettings, QueueExtra> = {
  id: 'monotonic-queue',
  title: 'Monotonic queue (sliding window maximum)',
  family: 'Techniques',
  blurb:
    'The maximum of every window of k values in O(n): a deque whose values decrease, so its front is always the answer.',
  settings: [
    {
      kind: 'choice',
      key: 'goal',
      label: 'Find each window’s',
      options: [
        { value: 'max', label: 'Maximum (the deque decreases)' },
        { value: 'min', label: 'Minimum (the deque increases)' },
      ],
      help: 'Flip the comparison and the same deque finds the minimum.',
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
      label: 'Values or k',
      placeholder: 'e.g. 2 7 4 1 5 3, or 3',
      maxLength: 80,
      sample: '3',
      parse: parseInputUpTo(MAX_N),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'slide', label: 'Slide the window', usesInput: true, primary: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [load(randomValues(rng, 10, 1, 20)), ['slide', rng.int(2, 4)]],
    },
    presets: [
      {
        label: 'Random, k = 3',
        make: (rng, n) => [load(randomValues(rng, n, 1, 30)), ['slide', Math.min(3, n)]],
      },
      {
        label: 'Decreasing (the front expires every time)',
        make: (rng, n) => [
          load(ascending(distinctValues(rng, n)).reverse()),
          ['slide', Math.min(3, n)],
        ],
      },
      {
        label: 'Increasing (the deque holds one value)',
        make: (rng, n) => [load(ascending(distinctValues(rng, n))), ['slide', Math.min(4, n)]],
      },
      {
        label: 'Few distinct values (ties)',
        make: (rng, n) => [load(randomValues(rng, n, 1, 3)), ['slide', Math.min(3, n)]],
      },
      {
        label: 'One window: k = n',
        make: (rng, n) => [load(randomValues(rng, n, 1, 30)), ['slide', n]],
      },
    ],
    sizes: [8, 10, 14, 20],
  },
  explain,
  complexity: [
    {
      op: 'slide(k): every window’s maximum',
      best: {
        cost: 'O(n)',
        why: 'Increasing values: each new value pops the one before it, and the deque holds one index.',
        example: 'increasing',
      },
      average: {
        cost: 'O(n)',
        why: 'Each index is pushed once and popped at most once, from the back or the front.',
        example: 'window-max',
      },
      worst: {
        cost: 'O(n)',
        why: 'Decreasing values keep k indices in the deque, but every one still leaves just once.',
        example: 'decreasing',
      },
      note: 'Scanning each window for its maximum takes (n − k + 1)(k − 1) comparisons, O(nk). A heap of the window takes O(n log k). Space: O(k) for the deque.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(monotonicQueue, calls, settings as QueueSettings, (call, _before, steps) => {
        const v = steps[steps.length - 1]!.vars ?? {};
        if (call[0] !== 'slide' || v.result === undefined) return null;
        return { line: `${(settings as QueueSettings).goal} ${v.k}`, out: String(v.result) };
      }),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    windowMax,
    windowMin,
    decreasing,
    increasing,
    windowOfOne,
    oneWindow,
  ] as unknown as SavedExample[],
  practice: queuePractice(() => monotonicQueue),
  preview: { example: 'window-max', level: 2 },
};

export default monotonicQueue;
