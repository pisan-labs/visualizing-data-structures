import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/linked_stack.hpp?raw';
import javaSource from './code/java/LinkedStack.java?raw';
import pythonSource from './code/python/linked_stack.py?raw';
import explain from './explain.md?raw';
import firstPush from './examples/first-push.json';
import lifo from './examples/lifo.json';
import noOverflow from './examples/no-overflow.json';
import reverseWord from './examples/reverse-word.json';
import underflow from './examples/underflow.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type StackListExtra,
  type StackListSettings,
  type StackListState,
} from './model';
import { stackListPractice } from './practice';
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

export const stackList: VizDef<StackListState, StackListSettings, StackListExtra> = {
  id: 'stack-list',
  title: 'Stack (linked list)',
  family: 'Stacks, queues and arrays',
  blurb: 'Push and pop at the front of a singly linked list: no capacity, no shifting.',
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
      { op: 'push', label: 'Push', usesInput: true, bulk: true, primary: true },
      { op: 'pop', label: 'Pop', usesInput: false },
      { op: 'peek', label: 'Peek', usesInput: false },
    ],
    random: { label: 'Push random', make: (rng) => [['push', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) => Array.from({ length: size }, () => ['push', rng.int(1, 99)] as OpCall),
      },
      {
        label: 'The letters of a word',
        make: (_rng, size) =>
          [...'LINKEDLIST'.slice(0, Math.min(size, 10))].map((c) => ['push', c] as OpCall),
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'push(x)',
      best: { cost: 'O(1)', why: 'Make a node and change two pointers.', example: 'lifo' },
      average: { cost: 'O(1)', why: 'The rest of the list is never touched.' },
      worst: {
        cost: 'O(1)',
        why: 'There is no capacity to run out of, so no overflow and no copying.',
        example: 'no-overflow',
      },
      note: 'Allocating a node takes time and memory too. Arrays win on that, linked lists on never being full.',
    },
    {
      op: 'pop()',
      best: {
        cost: 'O(1)',
        why: 'Read the top value and move top along one link.',
        example: 'lifo',
      },
      average: { cost: 'O(1)', why: 'Only the first node is touched.' },
      worst: { cost: 'O(1)', why: 'An empty stack costs one null check.', example: 'underflow' },
    },
    {
      op: 'peek()',
      best: { cost: 'O(1)', why: 'top points straight at the answer.' },
      average: { cost: 'O(1)', why: 'One null check, one read.' },
      worst: { cost: 'O(1)', why: 'Same work at any size.' },
      note: 'Space: O(n), plus one next pointer per item.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[]) => codeScript(calls),
  },
  practice: stackListPractice(() => stackList),
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [lifo, firstPush, underflow, noOverflow, reverseWord] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: one operation per line.
 * Results: push -> ok; pop -> the value | underflow; peek -> the value | empty.
 */
function codeScript(calls: OpCall[]) {
  const t = new Timeline(stackList, {}, 1, calls);
  const input = calls.map((c) => c.join(' '));
  const expected = t.entries.map((e) => {
    const last = e.steps[e.steps.length - 1]!;
    if (last.lines.includes('pop.underflow')) return 'underflow';
    if (last.lines.includes('peek.empty')) return 'empty';
    if (last.vars?.returned !== undefined) return String(last.vars.returned);
    return 'ok';
  });
  return { input, expected };
}

export default stackList;
