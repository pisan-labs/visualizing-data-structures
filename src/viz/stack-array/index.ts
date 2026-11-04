import type { SavedExample, Value, VizDef } from '../../engine/types';
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
  },
  explain,
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [lifo, reverseWord, leftovers, overflow, underflow, index] as unknown as SavedExample[],
};
