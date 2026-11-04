import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Step, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/dynamic_array.hpp?raw';
import javaSource from './code/java/DynamicArray.java?raw';
import pythonSource from './code/python/dynamic_array.py?raw';
import explain from './explain.md?raw';
import amortized from './examples/amortized.json';
import badIndex from './examples/bad-index.json';
import doubling from './examples/doubling.json';
import growth15 from './examples/growth-1-5.json';
import insertFront from './examples/insert-front.json';
import removeMiddle from './examples/remove-middle.json';
import shrink from './examples/shrink.json';
import thrash from './examples/thrash.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type DynExtra,
  type DynSettings,
  type DynState,
} from './model';
import { view } from './view';

export const MAX_VALUE_LENGTH = 6;

/** Numbers stay numbers; anything else is a short string. Indices are checked by the operations. */
export function parseDynValue(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a value first.');
  if (t.length > MAX_VALUE_LENGTH)
    return new Error(`Keep values to ${MAX_VALUE_LENGTH} characters.`);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

const appendAll = (values: Value[]): OpCall[] => values.map((v) => ['append', v]);

export const dynamicArray: VizDef<DynState, DynSettings, DynExtra> = {
  id: 'dynamic-array',
  title: 'Dynamic array (resizing)',
  family: 'Stacks, queues and arrays',
  blurb:
    'An array that grows by copying into a bigger one, with a counter that shows why append is still O(1) amortized.',
  settings: [
    {
      kind: 'choice',
      key: 'growth',
      label: 'When full, grow to',
      options: [
        { value: '2', label: 'Twice the capacity' },
        { value: '1.5', label: '1.5 times the capacity, rounded up' },
      ],
      help: 'Any factor above 1 keeps append O(1) amortized. Bigger factors copy less often and leave more slots empty.',
    },
    {
      kind: 'choice',
      key: 'shrink',
      label: 'After a removal, shrink',
      options: [
        { value: 'quarter', label: 'To half when a quarter full' },
        { value: 'never', label: 'Never' },
        { value: 'half', label: 'To half when half full (thrashes)' },
      ],
      help: 'Shrinking at a quarter full leaves room both ways, so no sequence of operations copies over and over. Shrinking at half full does not.',
    },
    { kind: 'number', key: 'start', label: 'Starting capacity', min: 1, max: 8 },
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
      label: 'Value or index',
      placeholder: 'e.g. 42, or 2 99',
      maxLength: 60,
      sample: '1',
      parse: parseDynValue,
    },
    buttons: [
      { op: 'append', label: 'Append', usesInput: true, bulk: true, primary: true },
      { op: 'insert', label: 'Insert', usesInput: true, args: ['an index', 'a value'] },
      { op: 'removeAt', label: 'Remove at', usesInput: true, bulk: true },
      { op: 'removeLast', label: 'Remove last', usesInput: false },
      { op: 'get', label: 'Get', usesInput: true, bulk: true },
      { op: 'set', label: 'Set', usesInput: true, args: ['an index', 'a value'] },
    ],
    random: { label: 'Append random', make: (rng) => [['append', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) => appendAll(Array.from({ length: size }, () => rng.int(1, 99))),
      },
      {
        label: 'Values in order',
        make: (_rng, size) => appendAll(Array.from({ length: size }, (_, i) => i + 1)),
      },
      {
        label: 'Fill, then empty from the end',
        make: (_rng, size) => [
          ...appendAll(Array.from({ length: size }, (_, i) => i + 1)),
          ...Array.from({ length: size }, () => ['removeLast'] as OpCall),
        ],
      },
      {
        label: 'Insert each at the front (worst case)',
        make: (_rng, size) =>
          Array.from({ length: size }, (_, i) => ['insert', 0, i + 1] as OpCall),
      },
    ],
    sizes: [4, 8, 16],
  },
  explain,
  complexity: [
    {
      op: 'append(x)',
      best: {
        cost: 'O(1)',
        why: 'There is room: one store and one increment.',
        example: 'doubling',
      },
      average: {
        cost: 'O(1) amortized',
        why: 'Copies happen at sizes 1, 2, 4, 8, ... and add up to fewer than 2 per append.',
        example: 'amortized',
      },
      worst: {
        cost: 'O(n)',
        why: 'A full array copies all n items into the new one first.',
        example: 'doubling',
      },
      note: 'Amortized: any sequence of n appends costs O(n) in total, even though a single append can cost O(n).',
    },
    {
      op: 'insert(i, x)',
      best: {
        cost: 'O(1)',
        why: 'Inserting at the end shifts nothing (if there is room).',
        example: 'insert-front',
      },
      average: { cost: 'O(n)', why: 'On average half the items shift right.' },
      worst: {
        cost: 'O(n)',
        why: 'Inserting at index 0 shifts every item.',
        example: 'insert-front',
      },
    },
    {
      op: 'removeAt(i)',
      best: { cost: 'O(1)', why: 'Removing the last item shifts nothing.', example: 'bad-index' },
      average: { cost: 'O(n)', why: 'On average half the items shift left.' },
      worst: {
        cost: 'O(n)',
        why: 'Removing index 0 shifts every other item.',
        example: 'remove-middle',
      },
    },
    {
      op: 'removeLast()',
      best: { cost: 'O(1)', why: 'One decrement and one read.', example: 'shrink' },
      average: {
        cost: 'O(1) amortized',
        why: 'Shrinking at a quarter full leaves enough slack that copies stay rare.',
        example: 'shrink',
      },
      worst: {
        cost: 'O(n)',
        why: 'A shrink copies the remaining items into the smaller array.',
        example: 'shrink',
      },
      note: 'Shrinking at half full instead can make every append and removal cost O(n).',
    },
    {
      op: 'get(i), set(i, x)',
      best: {
        cost: 'O(1)',
        why: 'The index says exactly which slot to use.',
        example: 'remove-middle',
      },
      average: { cost: 'O(1)', why: 'No searching and no shifting.' },
      worst: { cost: 'O(1)', why: 'Same work at any index.' },
      note: 'Space: O(n) once the array has grown, since shrinking at a quarter keeps it at least a quarter full. Without shrinking it keeps its largest size.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DynSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    doubling,
    amortized,
    growth15,
    insertFront,
    removeMiddle,
    shrink,
    thrash,
    badIndex,
  ] as unknown as SavedExample[],
};

function result(last: Step<DynState, DynExtra>): string {
  if (last.lines.some((l) => l.endsWith('.error'))) return 'error';
  if (last.lines.includes('removeLast.empty')) return 'empty';
  if (last.vars?.returned !== undefined) return String(last.vars.returned);
  return 'ok';
}

/**
 * Driver protocol for the code tabs: "new <starting capacity>", then one operation per line.
 * Results: append, insert, set -> ok | error; removeAt, get -> the value | error;
 * removeLast -> the value | empty. The code follows the default settings (double, halve at a
 * quarter), so with those settings every operation is followed by a "capacity" query that
 * checks the resizing too. A script stops where this page refuses to draw an array bigger
 * than MAX_CAPACITY slots, since the code (rightly) keeps growing.
 */
function codeScript(calls: OpCall[], settings: DynSettings) {
  const t = new Timeline(dynamicArray, settings, 1, calls);
  const checkCapacity = settings.growth === defaults.growth && settings.shrink === defaults.shrink;
  const input = [`new ${t.initial.state.capacity}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const last = e.steps[e.steps.length - 1]!;
    // Only a refusal to grow past MAX_CAPACITY ends an operation on its grow line.
    if (last.lines.some((l) => l.endsWith('.grow'))) break;
    input.push(e.call.join(' '));
    expected.push(result(last));
    if (checkCapacity) {
      input.push('capacity');
      expected.push(String(e.end.capacity));
    }
  }
  return { input, expected };
}

export default dynamicArray;
