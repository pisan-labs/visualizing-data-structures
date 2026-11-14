import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/two_stack_queue.hpp?raw';
import javaSource from './code/java/TwoStackQueue.java?raw';
import pythonSource from './code/python/two_stack_queue.py?raw';
import alternating from './examples/alternating.json';
import moveEverything from './examples/move-everything-every-time.json';
import moveOnlyWhenEmpty from './examples/move-only-when-empty.json';
import nothingToDequeue from './examples/nothing-to-dequeue.json';
import oneCostlyDequeue from './examples/one-costly-dequeue.json';
import orderSurvives from './examples/order-survives.json';
import peeksAreFree from './examples/peeks-are-free.json';
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
  type TQExtra,
  type TQSettings,
  type TQState,
} from './model';
import { twoStackQueuePractice } from './practice';
import { view } from './view';

const enq = (v: number): OpCall => ['enqueue', v];
const deq: OpCall = ['dequeue'];
const values = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 99));

const presets: Preset[] = [
  {
    label: 'Enqueue them all, then dequeue them all: one move',
    make: (rng, n) => [...values(rng, n).map(enq), ...Array.from({ length: n }, () => deq)],
  },
  {
    label: 'Alternate enqueue and dequeue',
    make: (rng, n) => values(rng, n).flatMap((v) => [enq(v), deq]),
  },
  {
    label: 'Bursts: enqueue 3, dequeue 2',
    make: (rng, n) =>
      Array.from({ length: Math.ceil(n / 2) }, () => [...values(rng, 3).map(enq), deq, deq]).flat(),
  },
  {
    label: 'Enqueue, then peek again and again (worst for moving every time)',
    make: (rng, n) => [
      ...values(rng, n).map(enq),
      ...Array.from({ length: 4 }, () => ['peek'] as OpCall),
    ],
  },
  {
    label: 'Fill, drain half, fill again',
    make: (rng, n) => {
      const half = Math.ceil(n / 2);
      return [
        ...values(rng, n).map(enq),
        ...Array.from({ length: half }, () => deq),
        ...values(rng, half).map(enq),
        ...Array.from({ length: n }, () => deq),
      ];
    },
  },
  {
    label: 'Random operations',
    make: (rng, n) => {
      const out: OpCall[] = [];
      let size = 0;
      for (let k = 0; k < 2 * n; k++) {
        if (size > 0 && (size >= MAX_SIZE || rng.int(0, 1))) {
          out.push(rng.int(0, 3) ? deq : ['peek']);
          if (out.at(-1)![0] === 'dequeue') size--;
        } else {
          out.push(enq(rng.int(1, 99)));
          size++;
        }
      }
      return out;
    },
  },
];

export const twoStackQueue: VizDef<TQState, TQSettings, TQExtra> = {
  id: 'two-stack-queue',
  title: 'Queue from two stacks',
  family: 'Design a data structure',
  blurb:
    'A first-in, first-out queue made of two stacks: push onto in, pop off out, and move everything from in to out only when out is empty. One dequeue can cost 2n + 1, but every value moves across once, so any m operations cost at most 3m: O(1) amortized.',
  settings: [
    approachSetting({
      pattern: 'Move across only when out is empty, O(1) amortized',
      naive: 'Move everything there and back every time, O(n)',
      help: 'Both give the same answers. pushes and pops count over all the operations so far; naive total and pattern total say what each design has cost, and the bars show each operation.',
    }),
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
      placeholder: 'e.g. 5, or 1 2 3 4',
      maxLength: 60,
      sample: '5',
      parse: parseInput,
    },
    buttons: [
      { op: 'enqueue', label: 'Enqueue', usesInput: true, bulk: true, primary: true },
      { op: 'dequeue', label: 'Dequeue', usesInput: false },
      { op: 'peek', label: 'Peek', usesInput: false },
    ],
    random: { label: 'Enqueue random', make: (rng) => [enq(rng.int(1, 99))] },
    presets,
    sizes: [4, 6, MAX_SIZE],
  },
  explain,
  complexity: [
    {
      op: 'enqueue(x)',
      best: { cost: 'O(1)', why: 'One push onto in.', example: 'move-only-when-empty' },
      average: { cost: 'O(1)', why: 'Always one push, in either design.' },
      worst: { cost: 'O(1)', why: 'Nothing else moves.' },
    },
    {
      op: 'dequeue(), moving only when out is empty',
      best: {
        cost: 'O(1)',
        why: 'out is not empty: one pop.',
        example: 'order-survives',
      },
      average: {
        cost: 'O(1) amortized',
        why: 'Each value moves across once, so any m operations cost at most 3m stack operations.',
        example: 'alternating',
      },
      worst: {
        cost: 'O(n)',
        why: 'out is empty and in holds n values: 2n moves and a pop, 17 for 8 values.',
        example: 'one-costly-dequeue',
      },
      note: 'Amortized, not average: the 3m bound holds for every sequence, with no assumption about the input.',
    },
    {
      op: 'peek(), moving only when out is empty',
      best: { cost: 'O(1)', why: 'out is not empty: read its top.', example: 'peeks-are-free' },
      average: { cost: 'O(1) amortized', why: 'The same moves as dequeue, paid for the same way.' },
      worst: { cost: 'O(n)', why: 'out is empty: everything on in moves across first.' },
    },
    {
      op: 'dequeue(), moving everything every time',
      best: {
        cost: 'O(1)',
        why: 'One value: a move there, a pop, nothing to move back. 3 stack operations.',
        example: 'nothing-to-dequeue',
      },
      average: { cost: 'Θ(n)', why: '4n − 1 stack operations on n values, every time.' },
      worst: {
        cost: 'Θ(n)',
        why: 'n dequeues of a full queue cost Θ(n²) in all.',
        example: 'move-everything-every-time',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(twoStackQueue, settings as TQSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        const v = e.steps.at(-1)!.vars ?? {};
        const op = e.call[0];
        if (op === 'enqueue') {
          if (v.x !== undefined) input.push(`enqueue ${v.x}`);
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
    moveOnlyWhenEmpty,
    moveEverything,
    oneCostlyDequeue,
    alternating,
    peeksAreFree,
    orderSurvives,
    nothingToDequeue,
  ] as unknown as SavedExample[],
  practice: twoStackQueuePractice(() => twoStackQueue),
  preview: { example: 'move-only-when-empty', level: 2, hide: ['chart', 'bar-'] },
};

export default twoStackQueue;
