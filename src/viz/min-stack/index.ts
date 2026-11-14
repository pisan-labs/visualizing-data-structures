import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/min_stack.hpp?raw';
import javaSource from './code/java/MinStack.java?raw';
import pythonSource from './code/python/min_stack.py?raw';
import aMinAfterEveryPush from './examples/a-min-after-every-push.json';
import emptyStack from './examples/empty-stack.json';
import everyPushAPair from './examples/every-push-a-pair.json';
import fallingValues from './examples/falling-values.json';
import fewMins from './examples/few-mins-favor-the-scan.json';
import minsOnTheSide from './examples/mins-on-the-side.json';
import risingValues from './examples/rising-values.json';
import scanForTheMinimum from './examples/scan-for-the-minimum.json';
import tiesStayOn from './examples/ties-stay-on.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_SIZE,
  ops,
  parseInput,
  pseudocode,
  type MSExtra,
  type MSSettings,
  type MSState,
} from './model';
import { minStackPractice } from './practice';
import { view } from './view';

const push = (v: number): OpCall => ['push', v];
const between = (rng: Rng, n: number, lo: number, hi: number) =>
  Array.from({ length: n }, () => rng.int(lo, hi));

const presets: Preset[] = [
  {
    label: 'Random values, then min',
    make: (rng, n) => [...between(rng, n, 1, 99).map(push), ['min']],
  },
  {
    label: 'Rising values: mins keeps one',
    make: (rng, n) => [
      ...between(rng, n, 1, 60)
        .sort((a, b) => a - b)
        .map(push),
      ['min'],
    ],
  },
  {
    label: 'Falling values: every push is a new minimum',
    make: (rng, n) => [
      ...between(rng, n, 1, 60)
        .sort((a, b) => b - a)
        .map(push),
      ['min'],
    ],
  },
  {
    label: 'Repeats of the minimum',
    make: (rng, n) => {
      const low = rng.int(1, 9);
      return [
        ...Array.from({ length: n }, (_, i) => push(i % 2 ? low : rng.int(10, 40))),
        ['pop'],
        ['min'],
        ['pop'],
        ['min'],
      ];
    },
  },
  {
    label: 'Pop back down, with min after each pop',
    make: (rng, n) => [
      ...between(rng, n, -20, 40).map(push),
      ...Array.from({ length: Math.ceil(n / 2) }, () => [['pop'], ['min']] as OpCall[]).flat(),
    ],
  },
  {
    label: 'A min after every push (best for mins)',
    make: (rng, n) => between(rng, n, 1, 99).flatMap((v) => [push(v), ['min'] as OpCall]),
  },
  {
    label: 'Pushes and pops, one min at the end (best for the scan)',
    make: (rng, n) => [
      ...between(rng, n, 1, 99).map(push),
      ...Array.from({ length: Math.floor(n / 2) }, () => ['pop'] as OpCall),
      ['min'],
    ],
  },
];

export const minStack: VizDef<MSState, MSSettings, MSExtra> = {
  id: 'min-stack',
  title: 'Min stack',
  family: 'Design a data structure',
  blurb:
    'A stack that also returns its minimum in O(1): keep a second stack of minimums beside it, and push onto it only when a value is at most the current minimum. Against scanning the stack, n − 1 comparisons for every min.',
  settings: [
    approachSetting({
      pattern: 'A second stack of minimums, O(1) min',
      naive: 'Scan the stack for the minimum, O(n) min',
      help: 'Both give the same answers. comparisons counts every value compared with another, over all the operations so far; naive total and pattern total say what each design has cost.',
    }),
    {
      kind: 'choice',
      key: 'track',
      label: 'Push onto mins',
      options: [
        { value: 'le', label: 'Only when the value is at most the minimum' },
        { value: 'every', label: 'Every time (the minimum so far)' },
      ],
      help: 'Every time keeps the two stacks the same height: pop never compares, but mins holds n values. For the second stack of minimums only.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Value',
      placeholder: 'e.g. 5, or 5 3 7 3',
      maxLength: 60,
      sample: '5',
      parse: parseInput,
    },
    buttons: [
      { op: 'push', label: 'Push', usesInput: true, bulk: true, primary: true },
      { op: 'pop', label: 'Pop', usesInput: false },
      { op: 'top', label: 'Top', usesInput: false },
      { op: 'min', label: 'Min', usesInput: false },
    ],
    random: { label: 'Push random', make: (rng) => [push(rng.int(1, 99))] },
    presets,
    sizes: [4, 6, 8, MAX_SIZE],
  },
  explain,
  complexity: [
    {
      op: 'push(x), with mins',
      best: {
        cost: 'O(1)',
        why: 'One push, one comparison with the top of mins, and at most one more push.',
        example: 'rising-values',
      },
      average: { cost: 'O(1)', why: 'The same few steps whatever the values.' },
      worst: {
        cost: 'O(1)',
        why: 'A new minimum costs one extra push onto mins, nothing more.',
        example: 'falling-values',
      },
    },
    {
      op: 'pop(), with mins',
      best: {
        cost: 'O(1)',
        why: 'One pop and one comparison with the top of mins.',
        example: 'mins-on-the-side',
      },
      average: { cost: 'O(1)', why: 'At most two pops and one comparison.' },
      worst: {
        cost: 'O(1)',
        why: 'Popping the minimum pops mins too; the old minimum is right under it.',
        example: 'ties-stay-on',
      },
    },
    {
      op: 'min(), with mins',
      best: {
        cost: 'O(1)',
        why: 'One look at the top of mins, no comparisons.',
        example: 'mins-on-the-side',
      },
      average: { cost: 'O(1)', why: 'The answer is always on top of mins.' },
      worst: { cost: 'O(1)', why: 'However many values there are.', example: 'falling-values' },
    },
    {
      op: 'min(), scanning the stack',
      best: {
        cost: 'Θ(n)',
        why: 'n − 1 comparisons, even when the minimum is at the bottom.',
        example: 'scan-for-the-minimum',
      },
      average: { cost: 'Θ(n)', why: 'The scan never stops early: any value could be smaller.' },
      worst: {
        cost: 'Θ(n)',
        why: '10 values: 9 comparisons for every min.',
        example: 'scan-for-the-minimum',
      },
      note: 'push, pop and top cost no comparisons in the plain stack, so a session with few mins can cost it less.',
    },
    {
      op: 'extra space for mins',
      best: {
        cost: 'O(1)',
        why: 'Rising values: only the first push is a minimum.',
        example: 'rising-values',
      },
      average: { cost: 'O(n)', why: 'One entry for each push that ties or beats the minimum.' },
      worst: {
        cost: 'Θ(n)',
        why: 'Falling values, or pushing every time: mins is as tall as the stack.',
        example: 'falling-values',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(minStack, settings as MSSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        const v = e.steps.at(-1)!.vars ?? {};
        const op = e.call[0];
        if (op === 'push') {
          if (v.x !== undefined) input.push(`push ${v.x}`);
        } else {
          input.push(op);
          expected.push(v.returned !== undefined ? String(v.returned) : 'empty');
        }
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    minsOnTheSide,
    tiesStayOn,
    everyPushAPair,
    scanForTheMinimum,
    aMinAfterEveryPush,
    fewMins,
    risingValues,
    fallingValues,
    emptyStack,
  ] as unknown as SavedExample[],
  practice: minStackPractice(() => minStack),
  preview: { example: 'a-min-after-every-push' },
};

export default minStack;
