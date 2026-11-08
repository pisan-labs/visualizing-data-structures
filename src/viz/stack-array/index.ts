import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/array_stack.hpp?raw';
import javaSource from './code/java/ArrayStack.java?raw';
import pythonSource from './code/python/array_stack.py?raw';
import explain from './explain.md?raw';
import index from './examples/index-convention.json';
import leftovers from './examples/leftovers.json';
import lifo from './examples/lifo.json';
import overflow from './examples/overflow.json';
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
  type StackExtra,
  type StackSettings,
  type StackState,
} from './model';
import { stackPractice } from './practice';
import { view } from './view';

export const MAX_VALUE_LENGTH = 6;

/** Numbers stay numbers; anything else is a short string. */
export function parseStackValue(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a value first.');
  if (t.length > MAX_VALUE_LENGTH)
    return new Error(`Keep values to ${MAX_VALUE_LENGTH} characters.`);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

export const stackArray: VizDef<StackState, StackSettings, StackExtra> = {
  id: 'stack-array',
  title: 'Stack (array)',
  family: 'Linear structures',
  blurb: 'Push, pop and peek on a stack stored in a fixed-size array.',
  settings: [
    {
      kind: 'choice',
      key: 'top',
      label: 'Meaning of top',
      options: [
        { value: 'count', label: 'Number of items (starts at 0)' },
        { value: 'index', label: 'Index of the top item (starts at -1)' },
      ],
      help: 'Textbooks differ. Both work; the order of the steps in push and pop changes.',
    },
    { kind: 'number', key: 'capacity', label: 'Capacity', min: 2, max: 16 },
    {
      kind: 'choice',
      key: 'layout',
      label: 'Draw the array',
      options: [
        { value: 'fit', label: 'To fit the screen: across a laptop, up a phone' },
        { value: 'vertical', label: 'Vertically (bottom to top)' },
        { value: 'horizontal', label: 'Horizontally (left to right)' },
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
      parse: parseStackValue,
    },
    buttons: [
      { op: 'push', label: 'Push', usesInput: true, bulk: true, primary: true },
      { op: 'pop', label: 'Pop', usesInput: false },
      { op: 'peek', label: 'Peek', usesInput: false },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Push random', make: (rng) => [['push', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) => Array.from({ length: size }, () => ['push', rng.int(1, 99)] as OpCall),
      },
      {
        label: 'The letters of a word',
        make: (rng, size) =>
          [...'ALGORITHMS'.slice(0, Math.min(size, 10))].map((c) => ['push', c] as OpCall),
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'push(x)',
      best: { cost: 'O(1)', why: 'One check, one store, one increment.', example: 'lifo' },
      average: { cost: 'O(1)', why: 'Every push does the same three steps.' },
      worst: {
        cost: 'O(1)',
        why: 'Even a full array costs one check before reporting overflow.',
        example: 'overflow',
      },
    },
    {
      op: 'pop()',
      best: { cost: 'O(1)', why: 'One check, one decrement, one read.', example: 'lifo' },
      average: { cost: 'O(1)', why: 'Nothing is shifted or erased.' },
      worst: { cost: 'O(1)', why: 'An empty stack costs one check.', example: 'underflow' },
    },
    {
      op: 'peek()',
      best: { cost: 'O(1)', why: 'One check and one read.' },
      average: { cost: 'O(1)', why: 'top tells us exactly where to look.' },
      worst: { cost: 'O(1)', why: 'Same work whatever the size.' },
    },
    {
      op: 'clear()',
      best: { cost: 'O(1)', why: 'Only top changes.', example: 'leftovers' },
      average: { cost: 'O(1)', why: 'The old values are left in place.' },
      worst: {
        cost: 'O(1)',
        why: 'No loop over the items. (Erasing them would make it O(n).)',
      },
      note: 'Space: O(capacity), whether the stack is full or empty.',
    },
  ],
  practice: stackPractice(() => stackArray),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as StackSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [lifo, reverseWord, leftovers, overflow, underflow, index] as unknown as SavedExample[],
  preview: { example: 'lifo', level: 2 },
};

/**
 * Driver protocol for the code tabs: "new <capacity>", then one operation per line.
 * Results: push -> ok | overflow; pop/peek -> the value | underflow/empty; clear -> ok.
 */
function codeScript(calls: OpCall[], settings: StackSettings) {
  const t = new Timeline(stackArray, settings, 1, calls);
  const input = [`new ${settings.capacity}`, ...calls.map((c) => c.join(' '))];
  const expected = t.entries.map((e) => {
    const last = e.steps[e.steps.length - 1]!;
    const lines = last.lines;
    if (lines.includes('push.overflow')) return 'overflow';
    if (lines.includes('pop.underflow')) return 'underflow';
    if (lines.includes('peek.empty')) return 'empty';
    if (last.vars?.returned !== undefined) return String(last.vars.returned);
    return 'ok';
  });
  return { input, expected };
}

export default stackArray;
