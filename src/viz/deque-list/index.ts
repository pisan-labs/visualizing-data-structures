import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/linked_deque.hpp?raw';
import javaSource from './code/java/LinkedDeque.java?raw';
import pythonSource from './code/python/linked_deque.py?raw';
import explain from './explain.md?raw';
import bothEnds from './examples/both-ends.json';
import firstAdd from './examples/first-add.json';
import lastRemove from './examples/last-remove.json';
import removeLast from './examples/remove-last.json';
import underflow from './examples/underflow.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type DequeListExtra,
  type DequeListSettings,
  type DequeListState,
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

export const dequeList: VizDef<DequeListState, DequeListSettings, DequeListExtra> = {
  id: 'deque-list',
  title: 'Deque (linked list)',
  family: 'Stacks, queues and arrays',
  blurb: 'Add and remove at both ends of a doubly linked list with head and tail.',
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
        make: (_rng, size) => Array.from({ length: size }, (_, i) => ['addLast', i + 1] as OpCall),
      },
      {
        label: 'Add to the front',
        make: (_rng, size) => Array.from({ length: size }, (_, i) => ['addFirst', i + 1] as OpCall),
      },
    ],
    sizes: [3, 5, 7],
  },
  explain,
  complexity: [
    {
      op: 'addFirst(x), addLast(x)',
      best: { cost: 'O(1)', why: 'Make a node and change three pointers.', example: 'both-ends' },
      average: { cost: 'O(1)', why: 'Only the end node and its neighbour change.' },
      worst: {
        cost: 'O(1)',
        why: 'An empty deque sets the other end pointer instead; still constant.',
        example: 'first-add',
      },
    },
    {
      op: 'removeFirst()',
      best: {
        cost: 'O(1)',
        why: 'Move head along next and clear one back link.',
        example: 'both-ends',
      },
      average: { cost: 'O(1)', why: 'The rest of the list is never touched.' },
      worst: {
        cost: 'O(1)',
        why: 'The only node also clears tail: one more assignment.',
        example: 'last-remove',
      },
    },
    {
      op: 'removeLast()',
      best: {
        cost: 'O(1)',
        why: 'tail.prev leads straight to the new last node.',
        example: 'remove-last',
      },
      average: { cost: 'O(1)', why: 'Mirror image of removeFirst.' },
      worst: { cost: 'O(1)', why: 'An empty deque costs one null check.', example: 'underflow' },
      note: 'Without prev pointers this would be O(n): the node before tail is only reachable from the front.',
    },
    {
      op: 'peekFirst(), peekLast()',
      best: { cost: 'O(1)', why: 'head and tail point straight at the answers.' },
      average: { cost: 'O(1)', why: 'One null check, one read.' },
      worst: { cost: 'O(1)', why: 'Same work at any size.' },
      note: 'Space: O(n), plus two pointers per item.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[]) => codeScript(calls),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [bothEnds, firstAdd, lastRemove, removeLast, underflow] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: one operation per line.
 * Results: adds -> ok; removes -> the value | underflow; peeks -> the value | empty.
 */
function codeScript(calls: OpCall[]) {
  const t = new Timeline(dequeList, {}, 1, calls);
  const input = calls.map((c) => c.join(' '));
  const expected = t.entries.map((e) => {
    const last = e.steps[e.steps.length - 1]!;
    if (last.lines.some((l) => l.endsWith('.underflow'))) return 'underflow';
    if (last.lines.some((l) => l.endsWith('.empty') && l.startsWith('peek'))) return 'empty';
    if (last.vars?.returned !== undefined) return String(last.vars.returned);
    return 'ok';
  });
  return { input, expected };
}

export default dequeList;
