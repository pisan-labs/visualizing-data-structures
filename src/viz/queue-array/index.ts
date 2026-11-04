import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/circular_queue.hpp?raw';
import javaSource from './code/java/CircularQueue.java?raw';
import pythonSource from './code/python/circular_queue.py?raw';
import explain from './explain.md?raw';
import fifo from './examples/fifo.json';
import fullCount from './examples/full-count.json';
import fullGap from './examples/full-gap.json';
import splitRow from './examples/split-row.json';
import underflow from './examples/underflow.json';
import wraparound from './examples/wraparound.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type QueueExtra,
  type QueueSettings,
  type QueueState,
} from './model';
import { queuePractice } from './practice';
import { view } from './view';

export const MAX_VALUE_LENGTH = 6;

/** Numbers stay numbers; anything else is a short string. */
export function parseQueueValue(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a value first.');
  if (t.length > MAX_VALUE_LENGTH)
    return new Error(`Keep values to ${MAX_VALUE_LENGTH} characters.`);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

const enqueueAll = (values: Value[]): OpCall[] => values.map((v) => ['enqueue', v]);

export const queueArray: VizDef<QueueState, QueueSettings, QueueExtra> = {
  id: 'queue-array',
  title: 'Queue (circular array)',
  family: 'Stacks, queues and arrays',
  blurb:
    'Enqueue and dequeue on a queue in a fixed-size array, with front and rear wrapping around.',
  settings: [
    {
      kind: 'choice',
      key: 'full',
      label: 'Telling full from empty',
      options: [
        { value: 'gap', label: 'Leave one slot empty (front and rear only)' },
        { value: 'count', label: 'Keep a count of the items' },
      ],
      help: 'Textbooks differ. With only front and rear, front == rear would mean both empty and full, so one slot always stays free. A count lets every slot be used.',
    },
    { kind: 'number', key: 'capacity', label: 'Capacity (array length)', min: 2, max: 12 },
    {
      kind: 'choice',
      key: 'layout',
      label: 'Draw the array',
      options: [
        { value: 'ring', label: 'As a ring' },
        { value: 'row', label: 'As a row, the way it sits in memory' },
      ],
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
      placeholder: 'e.g. 42 or 1 2 3',
      maxLength: 60,
      parse: parseQueueValue,
    },
    buttons: [
      { op: 'enqueue', label: 'Enqueue', usesInput: true, bulk: true, primary: true },
      { op: 'dequeue', label: 'Dequeue', usesInput: false },
      { op: 'peek', label: 'Peek', usesInput: false },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Enqueue random', make: (rng) => [['enqueue', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) => enqueueAll(Array.from({ length: size }, () => rng.int(1, 99))),
      },
      {
        label: 'Wrap around the end',
        make: (rng, size) => {
          const half = Math.ceil(size / 2);
          return [
            ...enqueueAll(Array.from({ length: size }, () => rng.int(1, 99))),
            ...Array.from({ length: half }, () => ['dequeue'] as OpCall),
            ...enqueueAll(Array.from({ length: half }, () => rng.int(1, 99))),
          ];
        },
      },
      {
        label: 'Numbers in order',
        make: (_rng, size) => enqueueAll(Array.from({ length: size }, (_, i) => i + 1)),
      },
      {
        label: 'The letters of a word',
        make: (_rng, size) => enqueueAll([...'CIRCULAR'.slice(0, Math.min(size, 8))]),
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'enqueue(x)',
      best: {
        cost: 'O(1)',
        why: 'One check, one store, and rear moves one slot.',
        example: 'fifo',
      },
      average: {
        cost: 'O(1)',
        why: 'Nothing shifts: rear wraps around instead.',
        example: 'wraparound',
      },
      worst: {
        cost: 'O(1)',
        why: 'A full queue costs one check before reporting overflow.',
        example: 'full-gap',
      },
      note: 'A queue that grows by copying into a bigger array when full keeps enqueue O(1) amortized.',
    },
    {
      op: 'dequeue()',
      best: {
        cost: 'O(1)',
        why: 'One check, one read, and front moves one slot.',
        example: 'fifo',
      },
      average: {
        cost: 'O(1)',
        why: 'The other items stay where they are.',
        example: 'wraparound',
      },
      worst: { cost: 'O(1)', why: 'An empty queue costs one check.', example: 'underflow' },
      note: 'Shifting every item forward after each dequeue would make it O(n).',
    },
    {
      op: 'peek()',
      best: { cost: 'O(1)', why: 'One check and one read.', example: 'fifo' },
      average: { cost: 'O(1)', why: 'front says exactly where to look.' },
      worst: { cost: 'O(1)', why: 'Same work whatever the size.' },
    },
    {
      op: 'clear()',
      best: { cost: 'O(1)', why: 'Only front and rear (and count) change.' },
      average: { cost: 'O(1)', why: 'The old values are left in place.' },
      worst: { cost: 'O(1)', why: 'No loop over the items.' },
      note: 'Space: O(capacity), whether the queue is full or empty.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as QueueSettings),
  },
  practice: queuePractice(() => queueArray),
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fifo,
    wraparound,
    splitRow,
    fullGap,
    fullCount,
    underflow,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "new <array length>", then one operation per line.
 * Results: enqueue -> ok | overflow; dequeue/peek -> the value | underflow/empty; clear -> ok.
 * The code leaves one slot empty (the default). A queue that keeps a count holds as many items
 * as a one-slot-empty queue with one more slot, so count-mode scripts get capacity + 1.
 */
function codeScript(calls: OpCall[], settings: QueueSettings) {
  const t = new Timeline(queueArray, settings, 1, calls);
  const length = settings.full === 'count' ? settings.capacity + 1 : settings.capacity;
  const input = [`new ${length}`, ...calls.map((c) => c.join(' '))];
  const expected = t.entries.map((e) => {
    const last = e.steps[e.steps.length - 1]!;
    const lines = last.lines;
    if (lines.includes('enqueue.overflow')) return 'overflow';
    if (lines.includes('dequeue.underflow')) return 'underflow';
    if (lines.includes('peek.empty')) return 'empty';
    if (last.vars?.returned !== undefined) return String(last.vars.returned);
    return 'ok';
  });
  return { input, expected };
}

export default queueArray;
