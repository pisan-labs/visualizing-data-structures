import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/linked_queue.hpp?raw';
import javaSource from './code/java/LinkedQueue.java?raw';
import pythonSource from './code/python/linked_queue.py?raw';
import explain from './explain.md?raw';
import fifo from './examples/fifo.json';
import firstEnqueue from './examples/first-enqueue.json';
import lastDequeue from './examples/last-dequeue.json';
import longLine from './examples/long-line.json';
import underflow from './examples/underflow.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type QueueListExtra,
  type QueueListSettings,
  type QueueListState,
} from './model';
import { view } from './view';

export const MAX_VALUE_LENGTH = 6;

/** Numbers stay numbers; anything else is a short string. */
export function parseListValue(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a value first.');
  if (t.length > MAX_VALUE_LENGTH)
    return new Error(`Keep values to ${MAX_VALUE_LENGTH} characters.`);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

export const queueList: VizDef<QueueListState, QueueListSettings, QueueListExtra> = {
  id: 'queue-list',
  title: 'Queue (linked list)',
  family: 'Stacks, queues and arrays',
  blurb: 'Enqueue after the tail and dequeue at the head of a singly linked list.',
  settings: [],
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
      parse: parseListValue,
    },
    buttons: [
      { op: 'enqueue', label: 'Enqueue', usesInput: true, bulk: true, primary: true },
      { op: 'dequeue', label: 'Dequeue', usesInput: false },
      { op: 'peek', label: 'Peek', usesInput: false },
    ],
    random: { label: 'Enqueue random', make: (rng) => [['enqueue', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) =>
          Array.from({ length: size }, () => ['enqueue', rng.int(1, 99)] as OpCall),
      },
      {
        label: 'Join, then leave',
        make: (_rng, size) => [
          ...Array.from({ length: size }, (_, i) => ['enqueue', i + 1] as OpCall),
          ...Array.from({ length: Math.ceil(size / 2) }, () => ['dequeue'] as OpCall),
        ],
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'enqueue(x)',
      best: { cost: 'O(1)', why: 'tail points straight at the last node.', example: 'fifo' },
      average: { cost: 'O(1)', why: 'Make a node and change two pointers.' },
      worst: {
        cost: 'O(1)',
        why: 'An empty queue sets head instead of tail.next; still constant.',
        example: 'first-enqueue',
      },
      note: 'Without a tail pointer, enqueue would walk the whole list: O(n).',
    },
    {
      op: 'dequeue()',
      best: {
        cost: 'O(1)',
        why: 'Read the head value and move head along one link.',
        example: 'fifo',
      },
      average: { cost: 'O(1)', why: 'Only the first node is touched.' },
      worst: {
        cost: 'O(1)',
        why: 'The last node also clears tail: one more assignment.',
        example: 'last-dequeue',
      },
    },
    {
      op: 'peek()',
      best: { cost: 'O(1)', why: 'head points straight at the answer.' },
      average: { cost: 'O(1)', why: 'One null check, one read.' },
      worst: { cost: 'O(1)', why: 'An empty queue costs one check.', example: 'underflow' },
      note: 'Space: O(n), plus one next pointer per item.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[]) => codeScript(calls),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [fifo, firstEnqueue, lastDequeue, underflow, longLine] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: one operation per line.
 * Results: enqueue -> ok; dequeue -> the value | underflow; peek -> the value | empty.
 */
function codeScript(calls: OpCall[]) {
  const t = new Timeline(queueList, {}, 1, calls);
  const input = calls.map((c) => c.join(' '));
  const expected = t.entries.map((e) => {
    const last = e.steps[e.steps.length - 1]!;
    if (last.lines.includes('dequeue.underflow')) return 'underflow';
    if (last.lines.includes('peek.empty')) return 'empty';
    if (last.vars?.returned !== undefined) return String(last.vars.returned);
    return 'ok';
  });
  return { input, expected };
}

export default queueList;
