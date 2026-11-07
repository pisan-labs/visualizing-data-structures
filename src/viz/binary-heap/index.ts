import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/max_heap.hpp?raw';
import javaSource from './code/java/MaxHeap.java?raw';
import pythonSource from './code/python/max_heap.py?raw';
import explain from './explain.md?raw';
import buildBottomUp from './examples/build-bottom-up.json';
import buildByInserts from './examples/build-by-inserts.json';
import deleteSiftsUp from './examples/delete-sifts-up.json';
import extractUntilEmpty from './examples/extract-until-empty.json';
import insertToRoot from './examples/insert-to-root.json';
import minHeapZero from './examples/min-heap-zero-based.json';
import updateBothWays from './examples/update-both-ways.json';
import {
  CAPACITY,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseIndex,
  parseKey,
  parseKeyList,
  pseudocode,
  type HeapExtra,
  type HeapSettings,
  type HeapState,
} from './model';
import { binaryHeapPractice } from './practice';
import { view } from './view';

/** One key stays a number; a list of keys (for build) becomes its canonical text. */
export function parseHeapInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a key first.');
  if (/[\s,]/.test(t)) {
    const keys = parseKeyList(t);
    return keys instanceof Error ? keys : keys.join(' ');
  }
  return parseKey(t);
}

/** n distinct keys from 1 to 99. */
function distinctKeys(rng: Rng, n: number): number[] {
  const keys = new Set<number>();
  while (keys.size < n) keys.add(rng.int(1, 99));
  return [...keys];
}

const asc = (keys: number[]) => [...keys].sort((a, b) => a - b);
const buildOf = (keys: number[]): OpCall[] => [['build', keys.join(' ')]];

export const binaryHeap: VizDef<HeapState, HeapSettings, HeapExtra> = {
  id: 'binary-heap',
  title: 'Binary heap',
  family: 'Heaps and priority queues',
  blurb:
    'A priority queue in an array: insert, extract, update and delete by sifting keys up and down, and two ways to build a heap from a list.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Which key is on top',
      options: [
        { value: 'max', label: 'The largest (max-heap, CLRS)' },
        { value: 'min', label: 'The smallest (min-heap)' },
      ],
    },
    {
      kind: 'choice',
      key: 'index',
      label: 'Array indexing',
      options: [
        { value: 'one', label: 'From 1: parent(i) = ⌊i/2⌋ (CLRS)' },
        { value: 'zero', label: 'From 0: parent(i) = ⌊(i − 1)/2⌋' },
      ],
      help: 'The pseudocode, the narration and the index labels all follow this choice.',
    },
    {
      kind: 'choice',
      key: 'build',
      label: 'Build heap',
      options: [
        { value: 'bottom-up', label: 'Bottom-up: sift down from the middle (O(n))' },
        { value: 'insert', label: 'Insert the keys one at a time (O(n log n))' },
      ],
      help: 'Build the same list both ways and compare the comparisons and swaps.',
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
      label: 'Key',
      placeholder: 'e.g. 42, or a list: 5 3 8 1',
      maxLength: 160,
      sample: '42',
      parse: parseHeapInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'extract', label: 'Extract', usesInput: false },
      { op: 'peek', label: 'Peek', usesInput: false },
      { op: 'build', label: 'Build heap', usesInput: true },
      {
        op: 'update',
        label: 'Update key',
        usesInput: true,
        args: ['an index', 'a new key'],
        more: true,
      },
      { op: 'delete', label: 'Delete at index', usesInput: true, more: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => buildOf(distinctKeys(rng, n)) },
      { label: 'Ascending', make: (rng, n) => buildOf(asc(distinctKeys(rng, n))) },
      { label: 'Descending', make: (rng, n) => buildOf(asc(distinctKeys(rng, n)).reverse()) },
      {
        label: 'Many duplicates',
        make: (rng, n) => buildOf(Array.from({ length: n }, () => 10 * rng.int(1, 4))),
      },
      {
        label: 'Random, one insert at a time',
        make: (rng, n) => distinctKeys(rng, n).map((k) => ['insert', k] as OpCall),
      },
    ],
    sizes: [7, 10, 15],
  },
  explain,
  practice: binaryHeapPractice(() => binaryHeap),
  complexity: [
    {
      op: 'insert(key)',
      best: {
        cost: 'O(1)',
        why: 'The new leaf already fits under its parent: one comparison and it stays.',
      },
      average: {
        cost: 'O(1)',
        why: 'On random keys a new key climbs fewer than two levels on average: most of a heap is near the bottom.',
      },
      worst: {
        cost: 'O(log n)',
        why: 'A key that beats everything climbs to the root, one swap per level.',
        example: 'insert-to-root',
      },
    },
    {
      op: 'extract()',
      best: {
        cost: 'O(1)',
        why: 'The key moved into the root already beats both children, for example when all keys are equal.',
      },
      average: {
        cost: 'O(log n)',
        why: 'The key moved up comes from the bottom row, so it usually sinks most of the way back down.',
        example: 'extract-until-empty',
      },
      worst: {
        cost: 'O(log n)',
        why: 'One swap per level, and a heap with n keys has ⌊log₂ n⌋ levels below the root.',
        example: 'extract-until-empty',
      },
    },
    {
      op: 'peek()',
      best: { cost: 'O(1)', why: 'The answer is always the root.' },
      average: { cost: 'O(1)', why: 'Read one slot; nothing moves.' },
      worst: { cost: 'O(1)', why: 'The same single read whatever n is.' },
    },
    {
      op: 'build(list), bottom-up',
      best: {
        cost: 'O(n)',
        why: 'The list is already a heap: each sift-down stops after at most two comparisons.',
      },
      average: {
        cost: 'O(n)',
        why: 'Half the keys are leaves and never move; most of the rest are near the bottom.',
      },
      worst: {
        cost: 'O(n)',
        why: 'A key sifts down at most its height, and the heights add up to less than n: fewer than n swaps and 2n comparisons.',
        example: 'build-bottom-up',
      },
    },
    {
      op: 'build(list), one insert at a time',
      best: {
        cost: 'O(n)',
        why: 'Keys arrive best first (descending for a max-heap): every insert stops after one comparison.',
      },
      average: { cost: 'O(n)', why: 'Random keys climb only a few levels on average.' },
      worst: {
        cost: 'O(n log n)',
        why: 'Keys arrive worst first (ascending for a max-heap): every new key climbs to the root, and half of them start log₂ n levels down.',
        example: 'build-by-inserts',
      },
    },
    {
      op: 'updateKey(i, key)',
      best: { cost: 'O(1)', why: 'The new key still fits between its parent and its children.' },
      average: { cost: 'O(log n)', why: 'The key moves along one path, up or down, never both.' },
      worst: {
        cost: 'O(log n)',
        why: 'From a leaf up to the root, or from the root down to a leaf.',
        example: 'update-both-ways',
      },
    },
    {
      op: 'delete(i)',
      best: { cost: 'O(1)', why: 'i is the last slot: shrink the heap and stop.' },
      average: { cost: 'O(log n)', why: 'One sift, up or down, from slot i.' },
      worst: {
        cost: 'O(log n)',
        why: 'The key moved into slot i can travel a whole path.',
        example: 'delete-sifts-up',
      },
      note: `Space: one array of capacity ${CAPACITY} here; no pointers at all.`,
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as HeapSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    buildBottomUp,
    buildByInserts,
    insertToRoot,
    extractUntilEmpty,
    updateBothWays,
    deleteSiftsUp,
    minHeapZero,
  ] as unknown as SavedExample[],
  preview: { example: 'build-by-inserts', level: 2 },
};

/** Does the model refuse this call before it looks at the heap (a key or index it cannot read)? */
function unreadable([op, ...args]: OpCall): boolean {
  const bad = (v: Value | undefined, f: (v: Value) => unknown) =>
    v === undefined || f(v) instanceof Error;
  switch (op) {
    case 'insert':
      return bad(args[0], parseKey);
    case 'build':
      return bad(args[0], parseKeyList);
    case 'update':
      return bad(args[0], parseIndex) || bad(args[1], parseKey);
    case 'delete':
      return bad(args[0], parseIndex);
    default:
      return false;
  }
}

/**
 * Driver protocol for the code tabs. The code is a max-heap indexed from 1 with bottom-up build
 * (the defaults), so the model runs with those settings too. It prints only what every correct
 * max-heap agrees on: sizes and the keys handed back.
 *   new <capacity>
 *   insert k          ->  n afterwards | "overflow"
 *   extract | peek    ->  the key | "empty"
 *   build k1 k2 ...   ->  n
 *   update i k        ->  "ok" | "invalid"
 *   delete i          ->  the deleted key | "invalid"
 *   clear             ->  "ok"
 */
function codeScript(calls: OpCall[], settings: HeapSettings) {
  const same: HeapSettings = { ...settings, order: 'max', index: 'one', build: 'bottom-up' };
  const kept = calls.filter((c) => !unreadable(c));
  const t = new Timeline(binaryHeap, same, 1, kept);
  const input = [`new ${CAPACITY}`];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const v = last.vars ?? {};
    const refused = last.marks.some((m) => m.role === 'error');
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    switch (op) {
      case 'insert':
        expected.push(refused ? 'overflow' : String(v.N));
        break;
      case 'extract':
      case 'peek':
        expected.push(v.returned === undefined ? 'empty' : String(v.returned));
        break;
      case 'build':
        expected.push(String(v.N));
        break;
      case 'update':
        expected.push(refused ? 'invalid' : 'ok');
        break;
      case 'delete':
        expected.push(refused ? 'invalid' : String(v.returned));
        break;
      default:
        expected.push('ok');
    }
  });
  return { input, expected };
}

export default binaryHeap;
