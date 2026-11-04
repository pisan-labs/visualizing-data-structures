import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Step, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/sorted_array.hpp?raw';
import javaSource from './code/java/SortedArray.java?raw';
import pythonSource from './code/python/sorted_array.py?raw';
import explain from './explain.md?raw';
import binarySearch from './examples/binary-search.json';
import bounds from './examples/bounds.json';
import deleteExample from './examples/delete.json';
import insertShift from './examples/insert-shift.json';
import linearSearch from './examples/linear-search.json';
import minMax from './examples/min-max.json';
import missing from './examples/missing.json';
import reverseFull from './examples/reverse-full.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type SortedExtra,
  type SortedSettings,
  type SortedState,
} from './model';
import { view } from './view';

/** Whole numbers only: the array keeps them in numeric order. */
export function parseNumber(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a number first.');
  if (!/^-?\d{1,3}$/.test(t)) return new Error('Type a whole number from -999 to 999.');
  return Number(t);
}

const insertAll = (values: number[]): OpCall[] => values.map((v) => ['insert', v]);

export const sortedArray: VizDef<SortedState, SortedSettings, SortedExtra> = {
  id: 'sorted-array',
  title: 'Sorted vs unsorted array',
  family: 'Stacks, queues and arrays',
  blurb:
    'The same array kept in order or not: binary search against a scan, and shifting inserts against appends.',
  settings: [
    {
      kind: 'choice',
      key: 'mode',
      label: 'Mode',
      options: [
        { value: 'sorted', label: 'Sorted: keep the items in order' },
        { value: 'unsorted', label: 'Unsorted: add new items at the end' },
      ],
      help: 'Switch and replay to compare: the history stays the same, the costs do not.',
    },
    { kind: 'number', key: 'capacity', label: 'Capacity', min: 2, max: 12 },
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
      label: 'Number',
      placeholder: 'e.g. 42 or 5 17 30',
      maxLength: 60,
      parse: parseNumber,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'min', label: 'Min', usesInput: false, more: true },
      { op: 'max', label: 'Max', usesInput: false, more: true },
      { op: 'lowerBound', label: 'Lower bound', usesInput: true, more: true },
      { op: 'upperBound', label: 'Upper bound', usesInput: true, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) => insertAll(Array.from({ length: size }, () => rng.int(1, 99))),
      },
      {
        label: 'In order (no shifting)',
        make: (_rng, size) => insertAll(Array.from({ length: size }, (_, i) => 10 * (i + 1))),
      },
      {
        label: 'Reverse order (worst case)',
        make: (_rng, size) => insertAll(Array.from({ length: size }, (_, i) => 10 * (size - i))),
      },
      {
        label: 'Many duplicates',
        make: (rng, size) => insertAll(Array.from({ length: size }, () => 10 * rng.int(1, 3))),
      },
    ],
    sizes: [5, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'insert(x), sorted',
      best: { cost: 'O(1)', why: 'x is the largest: nothing shifts.', example: 'insert-shift' },
      average: { cost: 'O(n)', why: 'On average half the items shift right.' },
      worst: {
        cost: 'O(n)',
        why: 'x is the smallest: every item shifts.',
        example: 'reverse-full',
      },
    },
    {
      op: 'insert(x), unsorted',
      best: { cost: 'O(1)', why: 'Store at the end.', example: 'linear-search' },
      average: { cost: 'O(1)', why: 'No order to keep, so nothing moves.' },
      worst: { cost: 'O(1)', why: 'A full array costs one check.' },
    },
    {
      op: 'search(x), sorted',
      best: { cost: 'O(1)', why: 'x is the middle item, the first one checked.' },
      average: {
        cost: 'O(log n)',
        why: 'Each comparison halves the range.',
        example: 'binary-search',
      },
      worst: {
        cost: 'O(log n)',
        why: 'x is missing: about log₂ n halvings until lo passes hi.',
        example: 'missing',
      },
    },
    {
      op: 'search(x), unsorted',
      best: { cost: 'O(1)', why: 'x is the first item.' },
      average: { cost: 'O(n)', why: 'About half the items are checked.' },
      worst: {
        cost: 'O(n)',
        why: 'x is last or missing: every item is checked.',
        example: 'linear-search',
      },
    },
    {
      op: 'delete(x)',
      best: {
        cost: 'O(log n)',
        why: 'Sorted, and x is the last item: binary search, then nothing shifts.',
      },
      average: { cost: 'O(n)', why: 'The items after x shift left.', example: 'delete' },
      worst: { cost: 'O(n)', why: 'x is first: everything after it shifts.' },
      note: 'Unsorted, the search alone can take n comparisons; sorted, the shifting does.',
    },
    {
      op: 'min(), max()',
      best: { cost: 'O(1)', why: 'Sorted: the first or the last item.' },
      average: { cost: 'O(1)', why: 'Sorted: no comparisons at all.' },
      worst: { cost: 'O(1)', why: 'Sorted: the same one step at any size.' },
      note: 'Unsorted: O(n) in every case, since every item has to be looked at.',
    },
    {
      op: 'lowerBound(x), upperBound(x)',
      best: { cost: 'O(log n)', why: 'No early exit: the range always narrows to one place.' },
      average: { cost: 'O(log n)', why: 'Each comparison halves the range.', example: 'bounds' },
      worst: { cost: 'O(log n)', why: 'About log₂ n + 1 comparisons.' },
      note: 'Sorted mode only.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SortedSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    binarySearch,
    linearSearch,
    insertShift,
    missing,
    bounds,
    minMax,
    deleteExample,
    reverseFull,
  ] as unknown as SavedExample[],
};

function result(op: string, last: Step<SortedState, SortedExtra>): string {
  if (op === 'insert') return last.lines.includes('insert.full') ? 'full' : 'ok';
  if (op === 'delete') return last.lines.includes('delete.missing') ? 'missing' : 'ok';
  if (last.lines.includes(`${op}.empty`)) return 'empty';
  return String(last.vars?.returned);
}

/**
 * Driver protocol for the code tabs: "new <capacity>", then one operation per line.
 * Results: insert -> ok | full; delete -> ok | missing; search, lowerBound, upperBound -> an
 * index; min, max -> the value | empty. The code keeps its array sorted (the default). For
 * unsorted scripts the items sit in other places, so search becomes "contains" (true | false),
 * and lowerBound and upperBound, which need a sorted array, are left out.
 */
function codeScript(calls: OpCall[], settings: SortedSettings) {
  const t = new Timeline(sortedArray, settings, 1, calls);
  const unsorted = settings.mode === 'unsorted';
  const input = [`new ${settings.capacity}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const [op, x] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    if (typeof x === 'string') continue; // refused by the page; the drivers read whole numbers
    if (unsorted && (op === 'lowerBound' || op === 'upperBound')) continue;
    if (unsorted && op === 'search') {
      input.push(`contains ${x}`);
      expected.push(last.vars?.returned === -1 ? 'false' : 'true');
      continue;
    }
    input.push(e.call.join(' '));
    expected.push(result(op, last));
  }
  return { input, expected };
}

export default sortedArray;
