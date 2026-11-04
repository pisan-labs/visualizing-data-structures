import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/array_deque.hpp?raw';
import javaSource from './code/java/ArrayDeque.java?raw';
import pythonSource from './code/python/array_deque.py?raw';
import explain from './explain.md?raw';
import asQueue from './examples/as-queue.json';
import asStack from './examples/as-stack.json';
import bothEnds from './examples/both-ends.json';
import fullBothEnds from './examples/full-both-ends.json';
import fullCount from './examples/full-count.json';
import underflow from './examples/underflow.json';
import wraps from './examples/wraps.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type DequeExtra,
  type DequeSettings,
  type DequeState,
} from './model';
import { dequePractice } from './practice';
import { view } from './view';

export const MAX_VALUE_LENGTH = 6;

/** Numbers stay numbers; anything else is a short string. */
export function parseDequeValue(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a value first.');
  if (t.length > MAX_VALUE_LENGTH)
    return new Error(`Keep values to ${MAX_VALUE_LENGTH} characters.`);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

export const dequeArray: VizDef<DequeState, DequeSettings, DequeExtra> = {
  id: 'deque-array',
  title: 'Deque (circular array)',
  family: 'Stacks, queues and arrays',
  blurb: 'Add and remove at both ends of a double-ended queue stored in a circular array.',
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
      parse: parseDequeValue,
    },
    buttons: [
      { op: 'addFirst', label: 'Add first', usesInput: true, bulk: true },
      { op: 'addLast', label: 'Add last', usesInput: true, bulk: true, primary: true },
      { op: 'removeFirst', label: 'Remove first', usesInput: false },
      { op: 'removeLast', label: 'Remove last', usesInput: false },
      { op: 'peekFirst', label: 'Peek first', usesInput: false, more: true },
      { op: 'peekLast', label: 'Peek last', usesInput: false, more: true },
    ],
    random: {
      label: 'Add random',
      make: (rng) => [[rng.int(0, 1) ? 'addFirst' : 'addLast', rng.int(1, 99)]],
    },
    presets: [
      {
        label: 'Random values at both ends',
        make: (rng, size) =>
          Array.from(
            { length: size },
            () => [rng.int(0, 1) ? 'addFirst' : 'addLast', rng.int(1, 99)] as OpCall,
          ),
      },
      {
        label: 'Add to the back',
        make: (rng, size) =>
          Array.from({ length: size }, () => ['addLast', rng.int(1, 99)] as OpCall),
      },
      {
        label: 'Add to the front',
        make: (rng, size) =>
          Array.from({ length: size }, () => ['addFirst', rng.int(1, 99)] as OpCall),
      },
      {
        label: 'A word, then take from both ends',
        make: (_rng, size) => {
          const word = [...'RACECAR'.slice(0, Math.min(size, 7))];
          const ends = Array.from({ length: Math.floor(word.length / 2) }, (): OpCall[] => [
            ['removeFirst'],
            ['removeLast'],
          ]).flat();
          return [...word.map((c) => ['addLast', c] as OpCall), ...ends];
        },
      },
    ],
    sizes: [3, 5, 7],
  },
  explain,
  complexity: [
    {
      op: 'addFirst(x)',
      best: { cost: 'O(1)', why: 'front moves back one slot, then one store.', example: 'wraps' },
      average: { cost: 'O(1)', why: 'Nothing shifts: front wraps around to the end instead.' },
      worst: {
        cost: 'O(1)',
        why: 'A full deque costs one check before reporting overflow.',
        example: 'full-both-ends',
      },
      note: 'In a plain array without wraparound, addFirst would shift every item right: O(n).',
    },
    {
      op: 'addLast(x)',
      best: { cost: 'O(1)', why: 'One store, and rear moves forward.', example: 'as-queue' },
      average: { cost: 'O(1)', why: 'The same two steps every time.' },
      worst: {
        cost: 'O(1)',
        why: 'A full deque costs one check.',
        example: 'full-count',
      },
      note: 'A deque that grows by copying into a bigger array keeps both adds O(1) amortized.',
    },
    {
      op: 'removeFirst()',
      best: { cost: 'O(1)', why: 'One read, and front moves forward.', example: 'as-queue' },
      average: { cost: 'O(1)', why: 'The other items stay where they are.' },
      worst: { cost: 'O(1)', why: 'An empty deque costs one check.', example: 'underflow' },
    },
    {
      op: 'removeLast()',
      best: { cost: 'O(1)', why: 'rear moves back, then one read.', example: 'as-stack' },
      average: { cost: 'O(1)', why: 'The other items stay where they are.' },
      worst: { cost: 'O(1)', why: 'An empty deque costs one check.', example: 'underflow' },
    },
    {
      op: 'peekFirst(), peekLast()',
      best: { cost: 'O(1)', why: 'One check and one read.', example: 'both-ends' },
      average: { cost: 'O(1)', why: 'front and rear say exactly where to look.' },
      worst: { cost: 'O(1)', why: 'Same work whatever the size.' },
      note: 'Space: O(capacity), whether the deque is full or empty.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DequeSettings),
  },
  practice: dequePractice(() => dequeArray),
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    bothEnds,
    wraps,
    asStack,
    asQueue,
    fullBothEnds,
    fullCount,
    underflow,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "new <array length>", then one operation per line.
 * Results: adds -> ok | overflow; removes -> the value | underflow; peeks -> the value | empty.
 * The code leaves one slot empty (the default). A deque that keeps a count holds as many items
 * as a one-slot-empty deque with one more slot, so count-mode scripts get capacity + 1.
 */
function codeScript(calls: OpCall[], settings: DequeSettings) {
  const t = new Timeline(dequeArray, settings, 1, calls);
  const length = settings.full === 'count' ? settings.capacity + 1 : settings.capacity;
  const input = [`new ${length}`, ...calls.map((c) => c.join(' '))];
  const expected = t.entries.map((e) => {
    const last = e.steps[e.steps.length - 1]!;
    const lines = last.lines;
    if (lines.some((l) => l.endsWith('.overflow'))) return 'overflow';
    if (lines.some((l) => l.endsWith('.underflow'))) return 'underflow';
    if (lines.some((l) => l.endsWith('.empty'))) return 'empty';
    if (last.vars?.returned !== undefined) return String(last.vars.returned);
    return 'ok';
  });
  return { input, expected };
}

export default dequeArray;
